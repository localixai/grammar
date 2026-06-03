import type { GrammarError } from "../shared/types";
import type { SupportedElement } from "./input-detector";

// ── Offset resolution ──────────────────────────────────────────────

/**
 * Resolve the actual character offset of `original` in `text`.
 *
 * Models sometimes return incorrect offsets (byte-vs-char confusion,
 * off-by-one, etc.) so we perform a three-step fuzzy search:
 *   1. Exact match at the hinted position
 *   2. Nearest match within ±30 char window
 *   3. First occurrence anywhere in the string
 */
export function resolveOffset(text: string, original: string, hint: number): number {
  if (!original) return hint;

  // 1. Exact match at hint
  if (text.slice(hint, hint + original.length) === original) return hint;

  // 2. Search in ±30 char window
  const radius = 30;
  const searchStart = Math.max(0, hint - radius);
  const searchEnd = Math.min(text.length, hint + radius + original.length);
  const slice = text.slice(searchStart, searchEnd);
  const rel = slice.indexOf(original);
  if (rel !== -1) return searchStart + rel;

  // 3. First occurrence anywhere
  const idx = text.indexOf(original);
  return idx === -1 ? hint : idx;
}

// ── Text access ────────────────────────────────────────────────────

function getText(el: SupportedElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.innerText ?? el.textContent ?? "";
}

/**
 * Set the element's text using the native property setter for
 * React/Vue compatibility, then dispatch appropriate events.
 */
function setText(el: SupportedElement, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto =
      el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    el.innerText = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  }
}

// ── Single replacement ─────────────────────────────────────────────

/** Apply a single replacement with robust offset resolution. Returns the new full text. */
export function applyReplacement(
  el: SupportedElement,
  error: GrammarError,
  replacement: string,
): string {
  const currentText = getText(el);
  const original = error.original || currentText.slice(error.offset, error.offset + error.length);
  const offset = resolveOffset(currentText, original, error.offset);
  const end = offset + original.length;

  // Bounds check
  if (offset < 0 || end > currentText.length) return currentText;

  const newText = currentText.slice(0, offset) + replacement + currentText.slice(end);
  setText(el, newText);
  return newText;
}

// ── Batch replacement ──────────────────────────────────────────────

/**
 * Apply all replacements right-to-left so earlier offsets don't shift.
 * Each offset is re-resolved against the running text state.
 */
export function applyAllReplacements(el: SupportedElement, errors: readonly GrammarError[]): string {
  const sorted = [...errors]
    .filter((e) => e.replacements.length > 0)
    .sort((a, b) => b.offset - a.offset); // descending by offset

  let text = getText(el);

  for (const error of sorted) {
    const replacement = error.replacements[0]!;
    const original = error.original || text.slice(error.offset, error.offset + error.length);
    const offset = resolveOffset(text, original, error.offset);
    const end = offset + original.length;

    // Skip invalid bounds
    if (offset < 0 || end > text.length) continue;

    text = text.slice(0, offset) + replacement + text.slice(end);
  }

  setText(el, text);
  return text;
}
