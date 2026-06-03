export type SupportedElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const EDITABLE_INPUT_TYPES = new Set(["text", "email", "search", "url", "tel", "password", ""]);

export function isEditableInput(el: Element): el is HTMLInputElement {
  return el.tagName === "INPUT" && EDITABLE_INPUT_TYPES.has((el as HTMLInputElement).type.toLowerCase());
}

export function isTextarea(el: Element): el is HTMLTextAreaElement {
  return el.tagName === "TEXTAREA";
}

export function isContentEditable(el: Element): el is HTMLElement {
  return (el as HTMLElement).isContentEditable === true;
}

export function isSupportedElement(el: Element): el is SupportedElement {
  return isEditableInput(el) || isTextarea(el) || isContentEditable(el);
}

export function getElementText(el: SupportedElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.innerText ?? el.textContent ?? "";
}

export function shouldSkipElement(el: SupportedElement): boolean {
  // Never check password fields
  if (el instanceof HTMLInputElement && el.type === "password") return true;

  // Skip presentational elements
  const role = el.getAttribute("role");
  if (role === "presentation" || role === "none") return true;

  // Skip elements marked by us or by other grammar tools
  if (el.closest("[data-grammar-ignore]")) return true;

  return false;
}

export function observeDOM(onElementAdded: (el: SupportedElement) => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (isSupportedElement(node)) {
          onElementAdded(node);
        }

        for (const child of node.querySelectorAll<Element>("input, textarea, [contenteditable]")) {
          if (isSupportedElement(child)) {
            onElementAdded(child);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
