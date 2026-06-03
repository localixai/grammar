import { isSupportedElement, shouldSkipElement, observeDOM } from "./input-detector";
import { injectThemeStyle } from "./theme";
import type { SupportedElement } from "./input-detector";
import { FieldController } from "./field-controller";

const controllers = new WeakMap<SupportedElement, FieldController>();

function attachToElement(el: SupportedElement): void {
  if (controllers.has(el)) return;
  if (shouldSkipElement(el)) return;
  controllers.set(el, new FieldController(el));
}

function initExistingElements(): void {
  const selector = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="search"]',
    'input[type="url"]',
    'input[type="tel"]',
    "input:not([type])",
    "textarea",
    '[contenteditable="true"]',
    '[contenteditable=""]',
  ].join(", ");

  for (const el of document.querySelectorAll<Element>(selector)) {
    if (isSupportedElement(el)) attachToElement(el);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────

injectThemeStyle();
initExistingElements();
observeDOM(attachToElement);
