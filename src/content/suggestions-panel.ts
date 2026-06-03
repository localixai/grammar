import type { CheckResult, GrammarError, ErrorType } from "../shared/types";
import type { SupportedElement } from "./input-detector";
import { getElementText } from "./input-detector";
import { applyAllReplacements } from "./apply";

// ── Types ──────────────────────────────────────────────────────────

export interface ButtonPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Segment =
  | { kind: "text"; value: string }
  | { kind: "fix"; original: string; replacement: string; error: GrammarError };

// ── Constants ──────────────────────────────────────────────────────

const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 360;
const VIEWPORT_GAP = 8;

const ERROR_COLORS: Record<ErrorType, string> = {
  grammar: "#ef4444",
  spelling: "#f97316",
  style: "#a78bfa",
  punctuation: "#60a5fa",
};

// ── Helpers ────────────────────────────────────────────────────────

function buildSegments(text: string, errors: readonly GrammarError[]): Segment[] {
  const sorted = [...errors]
    .filter((e) => e.replacements.length > 0)
    .sort((a, b) => a.offset - b.offset);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const error of sorted) {
    // Guard against overlapping / out-of-bounds errors
    if (error.offset < cursor || error.offset + error.length > text.length) continue;

    if (error.offset > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, error.offset) });
    }

    segments.push({
      kind: "fix",
      original: text.slice(error.offset, error.offset + error.length),
      replacement: error.replacements[0]!,
      error,
    });

    cursor = error.offset + error.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }

  return segments;
}

// ── SuggestionsPanel ───────────────────────────────────────────────

export class SuggestionsPanel {
  private readonly panel: HTMLElement;
  private result: CheckResult | null = null;
  private segments: Segment[] = [];
  private btnPos: ButtonPosition = { top: 0, left: 0, width: 22, height: 22 };

  constructor(
    private readonly target: SupportedElement,
    private readonly onApplySingle: (error: GrammarError, replacement: string) => void,
    private readonly onApplyAll: () => void,
    private readonly onClose: () => void,
  ) {
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);
  }

  // ── Panel creation ─────────────────────────────────────────────

  private createPanel(): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-grammar-ignore", "true");
    el.className = "localix-grammar";
    el.style.cssText = `
      position: fixed;
      z-index: 2147483646;
      background: var(--lx-surface);
      border: 1px solid var(--lx-border);
      border-radius: var(--lx-radius);
      box-shadow: var(--lx-shadow);
      width: ${PANEL_WIDTH}px;
      max-height: ${PANEL_MAX_HEIGHT}px;
      overflow: hidden;
      display: none;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: var(--lx-text);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    `;
    return el;
  }

  // ── Public API ─────────────────────────────────────────────────

  updateButtonPosition(pos: ButtonPosition): void {
    this.btnPos = pos;
  }

  show(result: CheckResult): void {
    this.result = result;
    this.segments = buildSegments(result.originalText, result.errors);
    this.render();
    this.panel.style.visibility = "hidden";
    this.panel.style.display = "flex";
    this.position();
    this.panel.style.visibility = "visible";
  }

  showError(message: string): void {
    this.panel.innerHTML = "";
    this.panel.appendChild(this.renderHeader(0));

    const el = document.createElement("div");
    el.style.cssText = "padding:16px;font-size:12px;color:var(--lx-error);line-height:1.5;";
    el.textContent = message;
    this.panel.appendChild(el);

    this.panel.style.visibility = "hidden";
    this.panel.style.display = "flex";
    this.position();
    this.panel.style.visibility = "visible";
  }

  refreshAfterApply(newText: string, newErrors: GrammarError[]): void {
    if (!this.result) return;
    this.result = { errors: newErrors, originalText: newText };
    this.segments = buildSegments(newText, newErrors);
    this.render();
    this.position();
  }

  hide(): void {
    this.panel.style.display = "none";
  }

  destroy(): void {
    this.panel.remove();
  }

  /** Apply all remaining fixes; returns the new text. */
  applyAll(): string {
    if (!this.result) return getElementText(this.target);
    const text = applyAllReplacements(this.target, this.result.errors);
    this.result = { errors: [], originalText: text };
    this.segments = [];
    this.render();
    return text;
  }

  // ── Positioning ────────────────────────────────────────────────

  position(): void {
    const { top: bTop, left: bLeft, width: bW, height: bH } = this.btnPos;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const panelHeight = this.panel.offsetHeight || PANEL_MAX_HEIGHT;

    let top = bTop + bH + VIEWPORT_GAP;
    let left = bLeft + bW - PANEL_WIDTH;

    // Flip up if not enough space below
    if (top + panelHeight > vh - VIEWPORT_GAP) {
      top = bTop - panelHeight - VIEWPORT_GAP;
    }

    // Clamp horizontally
    left = Math.max(VIEWPORT_GAP, Math.min(left, vw - PANEL_WIDTH - VIEWPORT_GAP));

    // Clamp vertically
    top = Math.max(VIEWPORT_GAP, top);

    this.panel.style.top = `${top}px`;
    this.panel.style.left = `${left}px`;
  }

  // ── Rendering ──────────────────────────────────────────────────

  private render(): void {
    this.panel.innerHTML = "";
    const fixCount = this.segments.filter((s) => s.kind === "fix").length;
    this.panel.appendChild(this.renderHeader(fixCount));

    if (fixCount === 0 && (!this.result || this.result.errors.length === 0)) {
      this.panel.appendChild(this.renderNoErrors());
    } else {
      this.panel.appendChild(this.renderBody());
    }
  }

  private renderHeader(fixCount: number): HTMLElement {
    const header = document.createElement("div");
    header.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      padding:9px 12px; border-bottom:1px solid var(--lx-border);
      flex-shrink:0; gap:6px;
    `;

    // Title
    const title = document.createElement("span");
    title.style.cssText = "font-weight:600;font-size:12px;color:var(--lx-text);";
    title.textContent =
      fixCount > 0 ? `${fixCount} fix${fixCount !== 1 ? "es" : ""} available` : "All good";

    // Actions container
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;gap:5px;flex-shrink:0;";

    // Apply all button (any fix available)
    if (fixCount >= 1) {
      const applyBtn = document.createElement("button");
      applyBtn.style.cssText = `
        background:var(--lx-accent); color:var(--lx-accent-fg); border:none;
        padding:3px 9px; border-radius:999px; font-size:11px; font-weight:600;
        cursor:pointer; white-space:nowrap; font-family:inherit;
        transition:opacity 0.15s;
      `;
      applyBtn.textContent = "Apply all";
      applyBtn.addEventListener("mouseenter", () => { applyBtn.style.opacity = "0.8"; });
      applyBtn.addEventListener("mouseleave", () => { applyBtn.style.opacity = "1"; });
      applyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onApplyAll();
      });
      actions.appendChild(applyBtn);
    }

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = `
      background:none; border:none; cursor:pointer; color:var(--lx-text-faint);
      padding:2px; display:flex; align-items:center; border-radius:4px;
      transition:color 0.12s, background 0.12s;
    `;
    closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.color = "var(--lx-text)";
      closeBtn.style.background = "var(--lx-surface-hover)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.color = "var(--lx-text-faint)";
      closeBtn.style.background = "";
    });
    closeBtn.addEventListener("click", () => this.onClose());

    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);
    return header;
  }

  private renderNoErrors(): HTMLElement {
    const el = document.createElement("div");
    el.style.cssText =
      "padding:24px;text-align:center;color:var(--lx-green);display:flex;flex-direction:column;align-items:center;gap:8px;";
    el.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
        <path d="M7.5 12L10.5 15L16.5 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span style="font-size:12px;">Looks good!</span>
    `;
    return el;
  }

  private renderBody(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "overflow-y:auto;flex:1;padding:12px;";

    // Hint text
    const hint = document.createElement("div");
    hint.style.cssText = "font-size:11px;color:var(--lx-text-faint);margin-bottom:8px;";
    hint.textContent = "Click a highlighted fix to apply it:";
    wrap.appendChild(hint);

    // Text with inline corrections
    const textView = document.createElement("div");
    textView.style.cssText =
      "font-size:13px;line-height:1.75;color:var(--lx-text-soft);word-break:break-word;";

    for (const seg of this.segments) {
      if (seg.kind === "text") {
        textView.appendChild(document.createTextNode(seg.value));
        continue;
      }

      // Correction chip
      const chip = document.createElement("span");
      chip.style.cssText = `
        cursor:pointer;
        color:var(--lx-green);
        border-bottom:1.5px solid var(--lx-green);
        border-radius:2px;
        transition:background 0.12s;
        white-space:pre;
      `;
      chip.textContent = seg.replacement || "∅";

      // "Was" tooltip
      const origSpan = document.createElement("span");
      origSpan.textContent = ` (was: ${seg.original})`;
      origSpan.style.cssText = "font-size:11px;color:var(--lx-error);display:none;";

      chip.addEventListener("mouseenter", () => {
        chip.style.background = "rgba(74,222,128,0.12)";
        origSpan.style.display = "inline";
      });
      chip.addEventListener("mouseleave", () => {
        chip.style.background = "";
        origSpan.style.display = "none";
      });

      // Single-fire click to prevent double-apply
      const handleClick = (e: Event): void => {
        e.stopPropagation();
        chip.removeEventListener("click", handleClick);
        chip.style.cursor = "default";
        chip.style.borderBottom = "none";
        chip.style.color = "var(--lx-green)";
        origSpan.style.display = "none";
        this.onApplySingle(seg.error, seg.replacement);
      };
      chip.addEventListener("click", handleClick);

      textView.appendChild(chip);
      textView.appendChild(origSpan);
    }

    wrap.appendChild(textView);

    // Error type badges
    const fixSegments = this.segments.filter((s): s is Extract<Segment, { kind: "fix" }> => s.kind === "fix");
    const types = [...new Set(fixSegments.map((s) => s.error.type))];

    if (types.length > 0) {
      const badges = document.createElement("div");
      badges.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;";

      for (const t of types) {
        const badge = document.createElement("span");
        const color = ERROR_COLORS[t];
        badge.style.cssText = `
          font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;
          padding:2px 6px;border-radius:999px;
          background:${color}1a;color:${color};
        `;
        badge.textContent = t;
        badges.appendChild(badge);
      }

      wrap.appendChild(badges);
    }

    return wrap;
  }
}
