import type { GrammarError } from "../shared/types";
import type { SupportedElement } from "./input-detector";

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIELDSET",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);
const NON_TEXT_TAGS = new Set(["NOSCRIPT", "SCRIPT", "STYLE", "TEMPLATE"]);

interface TextSegment {
  readonly start: number;
  readonly end: number;
  readonly node: Text;
  readonly editable: boolean;
}

interface EditableTextMap {
  readonly text: string;
  readonly segments: readonly TextSegment[];
  readonly barriers: readonly number[];
}

interface TextSelection {
  readonly anchor: number;
  readonly focus: number;
}

export interface ApplyResult {
  readonly applied: boolean;
  readonly text: string;
}

export interface ApplyAllResult extends ApplyResult {
  readonly complete: boolean;
}

function appendBoundary(state: { text: string }): void {
  if (state.text && !state.text.endsWith("\n")) state.text += "\n";
}

export function mapEditableText(root: HTMLElement): EditableTextMap {
  const state: { text: string; segments: TextSegment[]; barriers: number[] } = {
    text: "",
    segments: [],
    barriers: [],
  };

  function visit(node: Node, editable = true): void {
    if (node instanceof Text) {
      if (!node.data) return;
      const start = state.text.length;
      state.text += node.data;
      state.segments.push({ start, end: state.text.length, node, editable });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (
      node !== root &&
      (NON_TEXT_TAGS.has(node.tagName) ||
        node.hidden ||
        node.hasAttribute("inert") ||
        node.getAttribute("aria-hidden")?.toLowerCase() === "true" ||
        node.style.display === "none" ||
        node.style.visibility === "hidden" ||
        node.style.visibility === "collapse" ||
        node.style.contentVisibility === "hidden")
    ) {
      state.barriers.push(state.text.length);
      return;
    }
    const descendantsEditable =
      editable && !(node !== root && node.getAttribute("contenteditable") === "false");
    if (node.tagName === "BR") {
      appendBoundary(state);
      return;
    }

    const block = node !== root && BLOCK_TAGS.has(node.tagName);
    if (block) appendBoundary(state);
    for (const child of node.childNodes) visit(child, descendantsEditable);
    if (block) appendBoundary(state);
  }

  for (const child of root.childNodes) visit(child);
  return {
    text: state.text.replace(/\n+$/u, ""),
    segments: state.segments,
    barriers: state.barriers,
  };
}

export function getElementText(element: SupportedElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return mapEditableText(element).text;
}

function nativeValueSetter(
  element: HTMLInputElement | HTMLTextAreaElement,
): (value: string) => void {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  return (value: string) => {
    if (setter) setter.call(element, value);
    else element.value = value;
  };
}

function dispatchBeforeInput(
  element: SupportedElement,
  replacement: string,
  targetRange?: Range,
): boolean {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    composed: true,
    inputType: "insertReplacementText",
    data: replacement,
  });
  if (targetRange && typeof StaticRange !== "undefined") {
    const staticRange = new StaticRange({
      startContainer: targetRange.startContainer,
      startOffset: targetRange.startOffset,
      endContainer: targetRange.endContainer,
      endOffset: targetRange.endOffset,
    });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [staticRange],
    });
  }
  return element.dispatchEvent(event);
}

function dispatchInput(element: SupportedElement, replacement: string): void {
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertReplacementText",
      data: replacement,
    }),
  );
}

function replaceFormRange(
  element: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string,
  originalSelectionStart: number,
  originalSelectionEnd: number,
  selectionDirection: "backward" | "forward" | "none" | null,
): string {
  const current = element.value;
  const next = current.slice(0, start) + replacement + current.slice(end);
  const delta = replacement.length - (end - start);

  nativeValueSetter(element)(next);
  const nextSelectionStart =
    originalSelectionStart <= start
      ? originalSelectionStart
      : originalSelectionStart >= end
        ? originalSelectionStart + delta
        : start + replacement.length;
  const nextSelectionEnd =
    originalSelectionEnd <= start
      ? originalSelectionEnd
      : originalSelectionEnd >= end
        ? originalSelectionEnd + delta
        : start + replacement.length;
  element.setSelectionRange(nextSelectionStart, nextSelectionEnd, selectionDirection ?? undefined);
  return next;
}

function pointAt(
  map: EditableTextMap,
  offset: number,
  bias: "start" | "end",
): { node: Text; offset: number } | null {
  const exact = map.segments.find((segment) =>
    bias === "start"
      ? offset >= segment.start && offset < segment.end
      : offset > segment.start && offset <= segment.end,
  );
  if (exact) return { node: exact.node, offset: offset - exact.start };

  const adjacent =
    bias === "start"
      ? map.segments.find((segment) => segment.start >= offset)
      : [...map.segments].reverse().find((segment) => segment.end <= offset);
  if (!adjacent) return null;
  return {
    node: adjacent.node,
    offset: bias === "start" ? 0 : adjacent.node.data.length,
  };
}

function editableRange(element: HTMLElement, start: number, end: number): Range | null {
  const map = mapEditableText(element);
  if (start === end) {
    const point = caretPoint(map, start);
    if (!point) return null;
    const range = element.ownerDocument.createRange();
    range.setStart(point.node, point.offset);
    range.collapse(true);
    return range;
  }
  if (map.barriers.some((offset) => start < offset && end > offset)) return null;
  const covered = map.segments.reduce(
    (length, segment) =>
      length + Math.max(0, Math.min(end, segment.end) - Math.max(start, segment.start)),
    0,
  );
  const touched = map.segments.filter((segment) => start < segment.end && end > segment.start);
  if (covered !== end - start || touched.some((segment) => !segment.editable)) return null;
  const from = pointAt(map, start, "start");
  const to = pointAt(map, end, "end");
  if (!from || !to) return null;

  const range = element.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

function selectionOffset(map: EditableTextMap, node: Node | null, offset: number): number | null {
  if (!(node instanceof Text)) return null;
  const segment = map.segments.find((candidate) => candidate.node === node);
  return segment && offset >= 0 && offset <= node.data.length ? segment.start + offset : null;
}

function captureTextSelection(element: HTMLElement, map: EditableTextMap): TextSelection | null {
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (
    !selection ||
    !element.contains(selection.anchorNode) ||
    !element.contains(selection.focusNode)
  ) {
    return null;
  }
  const anchor = selectionOffset(map, selection.anchorNode, selection.anchorOffset);
  const focus = selectionOffset(map, selection.focusNode, selection.focusOffset);
  return anchor === null || focus === null ? null : { anchor, focus };
}

function adjustedOffset(
  offset: number,
  replacementStart: number,
  replacementEnd: number,
  replacementLength: number,
): number {
  if (offset <= replacementStart) return offset;
  if (offset >= replacementEnd) {
    return offset + replacementLength - (replacementEnd - replacementStart);
  }
  return replacementStart + replacementLength;
}

function caretPoint(map: EditableTextMap, offset: number): { node: Text; offset: number } | null {
  const segment =
    map.segments.find((candidate) => offset >= candidate.start && offset <= candidate.end) ??
    [...map.segments].reverse().find((candidate) => candidate.end <= offset);
  if (!segment) return null;
  return {
    node: segment.node,
    offset: Math.max(0, Math.min(segment.node.data.length, offset - segment.start)),
  };
}

function restoreTextSelection(
  element: HTMLElement,
  selectionState: TextSelection | null,
  replacementStart: number,
  replacementEnd: number,
  replacementLength: number,
): void {
  if (!selectionState) return;
  const map = mapEditableText(element);
  const anchor = caretPoint(
    map,
    adjustedOffset(selectionState.anchor, replacementStart, replacementEnd, replacementLength),
  );
  const focus = caretPoint(
    map,
    adjustedOffset(selectionState.focus, replacementStart, replacementEnd, replacementLength),
  );
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (!selection || !anchor || !focus) return;
  selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
}

function replaceEditableRange(element: HTMLElement, range: Range, replacement: string): string {
  const selection = element.ownerDocument.defaultView?.getSelection();
  range.deleteContents();
  const inserted = element.ownerDocument.createTextNode(replacement);
  range.insertNode(inserted);

  if (selection) {
    const caret = element.ownerDocument.createRange();
    caret.setStartAfter(inserted);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
  }
  return getElementText(element);
}

function selectRange(element: HTMLElement, range: Range): (() => void) | undefined {
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (!selection) return undefined;
  const saved: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    saved.push(selection.getRangeAt(index).cloneRange());
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return () => {
    selection.removeAllRanges();
    for (const savedRange of saved) {
      try {
        selection.addRange(savedRange);
      } catch {
        // The page may have removed a saved selection node while handling beforeinput.
      }
    }
  };
}

export function applyReplacement(
  element: SupportedElement,
  error: GrammarError,
  replacement: string,
): ApplyResult {
  const current = getElementText(element);
  const end = error.offset + error.length;
  if (
    error.offset < 0 ||
    end > current.length ||
    current.slice(error.offset, end) !== error.original
  ) {
    return { applied: false, text: current };
  }
  const expected = current.slice(0, error.offset) + replacement + current.slice(end);
  const formElement =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null;
  const form = formElement
    ? {
        start: formElement.selectionStart ?? end,
        end: formElement.selectionEnd ?? formElement.selectionStart ?? end,
        direction: formElement.selectionDirection,
      }
    : null;
  const targetRange = form ? undefined : editableRange(element, error.offset, end);
  if (!form && !targetRange) return { applied: false, text: current };
  const textSelection = form ? null : captureTextSelection(element, mapEditableText(element));
  const restoreSelection = form
    ? (): void =>
        formElement!.setSelectionRange(
          Math.min(form.start, formElement!.value.length),
          Math.min(form.end, formElement!.value.length),
          form.direction ?? undefined,
        )
    : selectRange(element, targetRange!);
  if (form) formElement!.setSelectionRange(error.offset, end);

  // Let the browser perform the edit first. Rich editors often accept this native editing
  // command and update their own state, while a synthetic input event alone is ignored.
  if (!form && typeof element.ownerDocument.execCommand === "function") {
    try {
      element.focus({ preventScroll: true });
      selectRange(element, targetRange!);
      if (element.ownerDocument.execCommand("insertText", false, replacement)) {
        const nativeText = getElementText(element);
        if (nativeText === expected) {
          restoreTextSelection(element, textSelection, error.offset, end, replacement.length);
        }
        return { applied: nativeText === expected, text: nativeText };
      }
    } catch {
      // Continue with the existing beforeinput and DOM path when the command is unavailable.
    }
  }

  if (!dispatchBeforeInput(element, replacement, targetRange ?? undefined)) {
    const handledText = getElementText(element);
    if (handledText === expected && !form) {
      restoreTextSelection(element, textSelection, error.offset, end, replacement.length);
    } else if (handledText !== expected) {
      restoreSelection?.();
    }
    return { applied: handledText === expected, text: handledText };
  }

  const text = form
    ? replaceFormRange(
        formElement!,
        error.offset,
        end,
        replacement,
        form.start,
        form.end,
        form.direction,
      )
    : replaceEditableRange(element, targetRange!, replacement);
  if (!form) {
    restoreTextSelection(element, textSelection, error.offset, end, replacement.length);
  }
  dispatchInput(element, replacement);
  return { applied: true, text };
}

/** Use a single native edit for plain rich-editor surfaces that reject incremental changes. */
export function replaceWholeEditableText(
  element: SupportedElement,
  replacement: string,
): ApplyResult {
  const current = getElementText(element);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.querySelector(
      'strong, b, em, i, a, code, pre, blockquote, ul, ol, li, img, video, [contenteditable="false"]',
    ) ||
    typeof element.ownerDocument.execCommand !== "function"
  ) {
    return { applied: false, text: current };
  }
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (!selection) return { applied: false, text: current };
  try {
    element.focus({ preventScroll: true });
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!element.ownerDocument.execCommand("insertText", false, replacement)) {
      return { applied: false, text: getElementText(element) };
    }
  } catch {
    return { applied: false, text: getElementText(element) };
  }
  const text = getElementText(element);
  return { applied: text === replacement, text };
}

export function applyAllReplacements(
  element: SupportedElement,
  errors: readonly GrammarError[],
): ApplyAllResult {
  let text = getElementText(element);
  let applied = false;
  let appliedCount = 0;
  const applicable = errors.filter((error) => error.replacements[0] !== undefined);
  for (const error of [...applicable].sort((a, b) => b.offset - a.offset)) {
    const replacement = error.replacements[0];
    if (replacement === undefined) continue;
    const result = applyReplacement(element, error, replacement);
    if (!result.applied) continue;
    applied = true;
    appliedCount += 1;
    text = result.text;
  }
  return {
    applied,
    text,
    complete: applicable.length > 0 && appliedCount === applicable.length,
  };
}
