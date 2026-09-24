import { isContentEditable, isFramedEditableBody, type SupportedElement } from "./input-detector";

const CLIPPING_OVERFLOW = new Set(["auto", "clip", "hidden", "scroll"]);
const INLINE_DISPLAYS = new Set(["inline", "inline-block", "inline-flex", "inline-grid"]);

export interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

function composedParent(element: Element): HTMLElement | null {
  if (element.parentElement instanceof HTMLElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
}

function finiteRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.left) &&
    rect.width >= 0 &&
    rect.height >= 0
  );
}

function renderedRect(rect: DOMRect): boolean {
  return finiteRect(rect) && rect.width > 0 && rect.height > 0;
}

function unionRect(first: DOMRect, second: DOMRect): DOMRect {
  const left = Math.min(first.left, second.left);
  const top = Math.min(first.top, second.top);
  const right = Math.max(first.right, second.right);
  const bottom = Math.max(first.bottom, second.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

function pixelTolerance(): number {
  const ratio = window.devicePixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? 1 / ratio : 1;
}

function containsRect(outer: DOMRect, inner: DOMRect): boolean {
  const tolerance = pixelTolerance();
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

function contentBounds(element: HTMLElement): DOMRect | null {
  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    if (typeof range.getClientRects !== "function") return null;

    let bounds: DOMRect | null = null;
    for (const clientRect of Array.from(range.getClientRects())) {
      const current = new DOMRect(
        clientRect.left,
        clientRect.top,
        clientRect.width,
        clientRect.height,
      );
      if (!renderedRect(current)) continue;
      bounds = bounds ? unionRect(bounds, current) : current;
    }
    return bounds;
  } catch {
    return null;
  }
}

function usesInlineLayout(element: HTMLElement): boolean {
  return INLINE_DISPLAYS.has(getComputedStyle(element).display.trim().toLowerCase());
}

function clipsOwnContent(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    overflowClips(style.overflowX || style.overflow) ||
    overflowClips(style.overflowY || style.overflow)
  );
}

/**
 * Rich editors sometimes expose a collapsed contenteditable node while its text is painted by a
 * containing layout surface. Resolve that surface from actual rendered content bounds instead of
 * editor dimensions, ancestor depth, product classes, or hostnames.
 */
export function resolveEditorAnchor(element: SupportedElement): HTMLElement {
  if (!isContentEditable(element)) return element;
  if (isFramedEditableBody(element)) return document.documentElement;
  const directRect = element.getBoundingClientRect();
  if (renderedRect(directRect) && (usesInlineLayout(element) || clipsOwnContent(element))) {
    return element;
  }

  const paintedContent = contentBounds(element);
  if (renderedRect(directRect) && (!paintedContent || containsRect(directRect, paintedContent))) {
    return element;
  }

  const requiredBounds =
    renderedRect(directRect) && paintedContent
      ? unionRect(directRect, paintedContent)
      : paintedContent && renderedRect(paintedContent)
        ? paintedContent
        : null;

  let current = composedParent(element);
  while (current) {
    if (current === document.body || current === document.documentElement) break;
    const candidateRect = current.getBoundingClientRect();
    if (
      renderedRect(candidateRect) &&
      (!requiredBounds || containsRect(candidateRect, requiredBounds))
    ) {
      return current;
    }
    current = composedParent(current);
  }
  return element;
}

export function viewportRect(): ViewportRect {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function overflowClips(value: string): boolean {
  return CLIPPING_OVERFLOW.has(value.trim().toLowerCase());
}

function hasHiddenSurface(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return true;
    }
    current = composedParent(current);
  }
  return false;
}

function isFrameVisible(): boolean {
  try {
    const frame = window.frameElement;
    return !frame || !hasHiddenSurface(frame);
  } catch {
    return true;
  }
}

/**
 * Returns the on-screen portion of the visual editor surface after viewport and overflow clipping.
 */
export function visibleEditorRect(element: SupportedElement): DOMRect | null {
  if (hasHiddenSurface(element) || !isFrameVisible()) return null;
  if (isFramedEditableBody(element)) {
    const viewport = viewportRect();
    return new DOMRect(viewport.left, viewport.top, viewport.width, viewport.height);
  }
  const anchor = resolveEditorAnchor(element);
  const anchorRect = anchor.getBoundingClientRect();
  if (!finiteRect(anchorRect)) return null;
  const viewport = viewportRect();

  let left = Math.max(viewport.left, anchorRect.left);
  let top = Math.max(viewport.top, anchorRect.top);
  let right = Math.min(viewport.right, anchorRect.right);
  let bottom = Math.min(viewport.bottom, anchorRect.bottom);
  let current = composedParent(anchor);

  while (current) {
    if (current === document.body || current === document.documentElement) break;
    const style = getComputedStyle(current);
    const clipsX = overflowClips(style.overflowX || style.overflow);
    const clipsY = overflowClips(style.overflowY || style.overflow);
    if (clipsX || clipsY) {
      const rect = current.getBoundingClientRect();
      if (finiteRect(rect)) {
        if (clipsX) {
          left = Math.max(left, rect.left);
          right = Math.min(right, rect.right);
        }
        if (clipsY) {
          top = Math.max(top, rect.top);
          bottom = Math.min(bottom, rect.bottom);
        }
      }
    }
    current = composedParent(current);
  }

  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : null;
}
