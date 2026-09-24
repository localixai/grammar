export type SupportedElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const EDITABLE_INPUT_TYPES = new Set(["text", "search"]);
const EXCLUDED_INPUT_MODES = new Set(["decimal", "email", "none", "numeric", "tel", "url"]);
const SENSITIVE_AUTOCOMPLETE = new Set([
  "additional-name",
  "address-level1",
  "address-level2",
  "address-level3",
  "address-level4",
  "address-line1",
  "address-line2",
  "address-line3",
  "bday",
  "bday-day",
  "bday-month",
  "bday-year",
  "cc-additional-name",
  "cc-family-name",
  "cc-given-name",
  "cc-name",
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "country",
  "country-name",
  "current-password",
  "email",
  "family-name",
  "given-name",
  "honorific-prefix",
  "honorific-suffix",
  "impp",
  "new-password",
  "nickname",
  "one-time-code",
  "organization",
  "organization-title",
  "photo",
  "postal-code",
  "sex",
  "street-address",
  "tel",
  "tel-area-code",
  "tel-country-code",
  "tel-extension",
  "tel-local",
  "tel-local-prefix",
  "tel-local-suffix",
  "tel-national",
  "transaction-amount",
  "transaction-currency",
  "url",
  "username",
  "webauthn",
]);
const EXCLUDED_ROLES = new Set([
  "combobox",
  "listbox",
  "menu",
  "none",
  "presentation",
  "slider",
  "spinbutton",
  "switch",
]);
const SENSITIVE_FIELD_HINT =
  /(?:^|[^a-z0-9])(?:auth(?:entication)?[ _-]?code|card[ _-]?(?:number|security)|credit[ _-]?card|cvc|cvv|one[ _-]?time(?:[ _-]?(?:code|password))?|otp|passcode|password|pin|security[ _-]?code|social[ _-]?security|ssn|tax[ _-]?id|verification[ _-]?code)(?:$|[^a-z0-9])/iu;

export function isEditableInput(element: Element): element is HTMLInputElement {
  return (
    element instanceof HTMLInputElement &&
    EDITABLE_INPUT_TYPES.has(element.type.toLowerCase()) &&
    element.type.toLowerCase() !== "password"
  );
}

export function isTextarea(element: Element): element is HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement;
}

export function isContentEditable(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const declared = element.getAttribute("contenteditable")?.trim().toLowerCase();
  return (
    element.isContentEditable ||
    declared === "" ||
    declared === "true" ||
    declared === "plaintext-only"
  );
}

export function isSupportedElement(element: Element): element is SupportedElement {
  return isEditableInput(element) || isTextarea(element) || isContentEditable(element);
}

export function isFramedEditableBody(element: SupportedElement): boolean {
  return element === document.body && isContentEditable(element) && window !== window.top;
}

function topLevelEditable(element: HTMLElement): HTMLElement {
  let root = element;
  while (root.parentElement && isContentEditable(root.parentElement)) {
    root = root.parentElement;
  }
  return root;
}

function composedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function closestComposed(element: Element, selector: string): Element | null {
  let current: Element | null = element;
  while (current) {
    const match = current.closest(selector);
    if (match) return match;
    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

export function resolveEditableTarget(event: Event): SupportedElement | null {
  for (const value of event.composedPath()) {
    if (!(value instanceof Element)) continue;
    if (isEditableInput(value) || isTextarea(value)) return value;
    const declaredEditable = value.closest<HTMLElement>("[contenteditable]");
    if (declaredEditable?.getAttribute("contenteditable")?.trim().toLowerCase() === "false") {
      return null;
    }
    const editable =
      declaredEditable && isContentEditable(declaredEditable)
        ? declaredEditable
        : isContentEditable(value)
          ? value
          : null;
    if (editable && isContentEditable(editable)) return topLevelEditable(editable);
  }
  return null;
}

function inheritedAttribute(element: Element, name: string): string | null {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute(name)) return current.getAttribute(name);
    current = composedParent(current);
  }
  return null;
}

export function skipReason(element: SupportedElement): string | null {
  if (closestComposed(element, "[data-localix-grammar-ignore], [data-grammar-ignore]")) {
    return "extension opt-out";
  }
  if (closestComposed(element, '[data-enable-grammarly="false"]')) {
    return "grammar tools disabled";
  }
  if (element instanceof HTMLInputElement && element.type.toLowerCase() === "password") {
    return "password field";
  }
  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    (element.disabled || element.readOnly)
  ) {
    return "disabled or readonly";
  }
  if (closestComposed(element, '[aria-disabled="true"], [aria-readonly="true"]')) {
    return "ARIA disabled or readonly";
  }
  const inputMode = element.getAttribute("inputmode")?.trim().toLowerCase() ?? "";
  if (EXCLUDED_INPUT_MODES.has(inputMode)) return "non-prose input mode";
  const autocomplete = element.getAttribute("autocomplete")?.trim().toLowerCase() ?? "";
  if (autocomplete.split(/\s+/u).some((token) => SENSITIVE_AUTOCOMPLETE.has(token))) {
    return "sensitive autocomplete field";
  }
  const fieldDescription = ["id", "name", "placeholder", "aria-label"]
    .map((attribute) => element.getAttribute(attribute) ?? "")
    .join(" ");
  if (SENSITIVE_FIELD_HINT.test(fieldDescription)) return "sensitive field label";
  const role = inheritedAttribute(element, "role")?.toLowerCase() ?? "";
  if (EXCLUDED_ROLES.has(role)) return "non-prose role";
  if (location.hostname === "docs.google.com") return "unsupported Google Docs canvas";
  return null;
}

export function isEligibleElement(element: SupportedElement): boolean {
  return skipReason(element) === null;
}

/** Avoid controls intended for a cell value, label, or short search term. */
export function hasWritingSpace(element: SupportedElement): boolean {
  if (isFramedEditableBody(element)) {
    return window.innerWidth >= 120 && window.innerHeight >= 64;
  }
  const rect = element.getBoundingClientRect();
  if (element instanceof HTMLInputElement) return rect.width >= 180 && rect.height >= 24;
  if (element.closest("td, th, [role='gridcell'], [role='columnheader']")) {
    return rect.width >= 240 && rect.height >= 64;
  }
  if (rect.width >= 120 && rect.height >= 24) return true;
  // Some rich editors keep a tiny editing node inside a full-size writing surface.
  if (
    !(element instanceof HTMLTextAreaElement) &&
    element.getAttribute("role") === "textbox" &&
    element.textContent &&
    element.textContent.trim().length >= 20
  ) {
    const surface = element.parentElement?.getBoundingClientRect();
    return !!surface && surface.width >= 240 && surface.height >= 80;
  }
  return false;
}

function validLanguage(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= 35 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/iu.test(normalized)
    ? normalized
    : undefined;
}

function inheritedLanguage(element: Element): string | undefined {
  let current: Element | null = element;
  while (current) {
    const language = validLanguage(current.getAttribute("lang"));
    if (language) return language;
    current = composedParent(current);
  }
  return undefined;
}

export function languageForElement(element: SupportedElement): string | undefined {
  const local = inheritedLanguage(element);
  if (local) return local;
  return validLanguage(document.documentElement.getAttribute("lang"));
}
