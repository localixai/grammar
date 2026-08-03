import type { CheckResult, GrammarError, ThemeMode } from "../shared/types";
import { viewportRect, visibleEditorRect } from "./editor-geometry";
import type { SupportedElement } from "./input-detector";

export type OverlayState = "idle" | "checking" | "issues" | "clean" | "error";

interface OverlayCallbacks {
  readonly onCheck: () => void;
  readonly onApply: (error: GrammarError, replacement: string) => void;
  readonly onApplyAll: () => void;
  readonly onRejectAll: () => void;
  readonly onIgnore: (error: GrammarError) => void;
  readonly onClose: () => void;
}

const STYLE = `
  :host {
    --background: oklch(0.13 0 0);
    --card: oklch(0.155 0 0);
    --popover: oklch(0.17 0 0);
    --primary: oklch(0.97 0 0);
    --primary-fg: oklch(0.13 0 0);
    --border: oklch(0.235 0 0);
    --border-strong: oklch(0.31 0 0);
    --text-strong: oklch(0.96 0 0);
    --text-soft: oklch(0.72 0 0);
    --text-faint: oklch(0.62 0 0);
    --surface-hover: oklch(0.185 0 0);
    --surface-active: oklch(0.21 0 0);
    --success: oklch(0.74 0.16 155);
    --error: oklch(0.68 0.19 18);
    --warning: oklch(0.8 0.14 80);
    --info: oklch(0.7 0.15 250);
    --accent: oklch(0.68 0.16 230);
    --ring: oklch(0.7 0 0);
    --shadow: 0 12px 32px rgba(0, 0, 0, .44);
    --radius: 10px;
    --font: "Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
    all: initial;
    color-scheme: dark;
  }
  :host([data-theme="light"]) {
    --background: oklch(0.978 0 0);
    --card: oklch(1 0 0);
    --popover: oklch(1 0 0);
    --primary: oklch(0.3 0 0);
    --primary-fg: oklch(0.985 0 0);
    --border: oklch(0.918 0 0);
    --border-strong: oklch(0.845 0 0);
    --text-strong: oklch(0.24 0 0);
    --text-soft: oklch(0.47 0 0);
    --text-faint: oklch(0.45 0 0);
    --surface-hover: oklch(0.945 0 0);
    --surface-active: oklch(0.915 0 0);
    --success: oklch(0.51 0.15 155);
    --error: oklch(0.55 0.21 20);
    --warning: oklch(0.54 0.12 75);
    --info: oklch(0.55 0.17 255);
    --ring: oklch(0.45 0 0);
    --shadow: 0 0 0 1px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.12);
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  button { font: inherit; }
  .trigger {
    position: fixed;
    z-index: 2147483647;
    width: 24px;
    height: 24px;
    display: none;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0;
    background: var(--background);
    color: var(--text-soft);
    box-shadow: 0 1px 3px rgba(0,0,0,.18);
    cursor: pointer;
    pointer-events: auto;
    transition: background 150ms, border-color 150ms, color 150ms;
  }
  .trigger svg { width: 13px; height: 13px; }
  .trigger:hover {
    border-color: var(--border-strong);
    background: var(--surface-active);
    color: var(--text-strong);
  }
  .trigger:active { background: var(--surface-hover); }
  .trigger:focus-visible, button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .trigger[data-state="issues"] { color: var(--error); }
  .trigger[data-state="clean"] { color: var(--success); }
  .trigger[data-state="error"] { color: var(--warning); }
  .trigger[data-state="checking"] svg { animation: lx-spin .8s linear infinite; }
  .count {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 13px;
    height: 13px;
    padding: 0 3px;
    display: none;
    place-items: center;
    border: 1px solid var(--background);
    border-radius: 999px;
    background: var(--error);
    color: white;
    font: 700 7.5px/1 var(--font);
  }
  .trigger[data-state="issues"] .count { display: grid; }
  .panel {
    position: fixed;
    z-index: 2147483646;
    width: min(344px, calc(100vw - 16px));
    max-height: min(420px, calc(100vh - 16px));
    display: none;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--popover);
    color: var(--text-strong);
    box-shadow: var(--shadow);
    font: 13px/1.45 var(--font);
    letter-spacing: -.011em;
    pointer-events: auto;
  }
  .panel[data-open="true"] { display: flex; animation: lx-in 180ms cubic-bezier(.22,1,.36,1); }
  .header {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 10px 7px 12px;
  }
  .brand-mark {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--text-strong);
    font-weight: 700;
  }
  .title-wrap { min-width: 0; flex: 1; }
  .title { font-weight: 650; font-size: 13px; }
  .icon-button, .primary {
    border: 1px solid transparent;
    border-radius: 7px;
    cursor: pointer;
  }
  .icon-button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    background: transparent;
    color: var(--text-faint);
  }
  .icon-button:hover { background: var(--surface-hover); color: var(--text-strong); }
  .body { overflow-y: auto; }
  .summary { padding: 7px 14px 14px; }
  .summary-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 11px;
  }
  .summary-count {
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 600;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--error); }
  .corrected-preview {
    max-height: 152px;
    overflow-y: auto;
    padding: 12px;
    border-radius: 10px;
    background: var(--card);
    color: var(--text-strong);
    font-size: 12px;
    line-height: 1.55;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .correction {
    margin: 0 -1px;
    padding: 1px 2px;
    border-radius: 3px;
    background: color-mix(in oklch, var(--success), transparent 82%);
    color: color-mix(in oklch, var(--success), var(--text-strong) 24%);
    font-weight: 600;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .primary { min-height: 38px; padding: 7px 12px; font-size: 11.5px; font-weight: 650; }
  .primary { background: var(--primary); color: var(--primary-fg); }
  .primary:hover { opacity: .86; }
  .apply-all {
    width: 100%;
    margin-top: 10px;
  }
  .empty, .status-view { padding: 28px 20px; text-align: center; color: var(--text-soft); overflow-wrap: anywhere; }
  .empty-icon { width: 34px; height: 34px; margin: 0 auto 9px; color: var(--success); }
  .status-view strong { display: block; margin-bottom: 5px; color: var(--text-strong); }
  .error-text { color: var(--error); }
  @keyframes lx-spin { to { transform: rotate(360deg); } }
  @keyframes lx-in { from { opacity: 0; transform: translateY(5px) scale(.985); } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

const ICONS: Record<OverlayState, string> = {
  idle: '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M4 15.5h2.5L16 6l-2-2-9.5 9.5V16Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m12.5 5.5 2 2" stroke="currentColor" stroke-width="1.4"/></svg>',
  checking:
    '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.8" stroke-dasharray="28 13" stroke-linecap="round"/></svg>',
  issues:
    '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M3 8c2.1-2.1 3.9 2.1 6 0s3.9 2.1 6 0M3 13c2.1-2.1 3.9 2.1 6 0s3.9 2.1 6 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  clean:
    '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="m4 10 4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error:
    '<svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 3 18 17H2L10 3Z" stroke="currentColor" stroke-width="1.5"/><path d="M10 8v4m0 2.5v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

const pointerActions = new WeakMap<HTMLButtonElement, () => void>();

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  pointerActions.set(element, onClick);
  element.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted) return;
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.detail !== 0) return;
    onClick();
  });
  return element;
}

function correctedPreview(result: CheckResult): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const errors = [...result.errors].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const error of errors) {
    const replacement = error.replacements[0];
    const end = error.offset + error.length;
    if (
      replacement === undefined ||
      error.offset < cursor ||
      result.originalText.slice(error.offset, end) !== error.original
    ) {
      continue;
    }
    fragment.append(document.createTextNode(result.originalText.slice(cursor, error.offset)));
    if (replacement) {
      const mark = document.createElement("mark");
      mark.className = "correction";
      mark.textContent = replacement;
      fragment.append(mark);
    }
    cursor = end;
  }
  fragment.append(document.createTextNode(result.originalText.slice(cursor)));
  return fragment;
}

export class GrammarOverlay {
  readonly host: HTMLElement;
  private readonly colorScheme = window.matchMedia("(prefers-color-scheme: light)");
  private readonly shadow: ShadowRoot;
  private readonly trigger: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private target: SupportedElement | null = null;
  private state: OverlayState = "idle";
  private theme: ThemeMode = "system";
  private panelOpen = false;
  private pointerInteraction = false;
  private readonly onColorSchemeChange = (): void => {
    if (this.theme === "system") this.applyResolvedTheme();
  };
  private readonly onWindowPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (!path.includes(this.host) || !event.isTrusted) return;
    this.pointerInteraction = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  private readonly onWindowPointerUp = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (!path.includes(this.host) || !event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    queueMicrotask(() => {
      this.pointerInteraction = false;
    });
  };
  private readonly onWindowClick = (event: MouseEvent): void => {
    const path = event.composedPath();
    if (!path.includes(this.host) || !event.isTrusted) return;
    this.pointerInteraction = false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = path.find(
      (value): value is HTMLButtonElement => value instanceof HTMLButtonElement,
    );
    if (!target || target.disabled) return;
    pointerActions.get(target)?.();
  };

  constructor(private readonly callbacks: OverlayCallbacks) {
    this.host = document.createElement("localix-grammar-root");
    this.host.dataset["localixGrammarIgnore"] = "true";
    this.host.style.setProperty("all", "initial", "important");
    this.host.style.setProperty("display", "block", "important");
    this.shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;

    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "trigger";
    this.trigger.setAttribute("aria-label", "Check writing with Localix Grammar");
    this.trigger.setAttribute("aria-controls", "localix-grammar-panel");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.innerHTML = ICONS.idle;
    pointerActions.set(this.trigger, () => this.callbacks.onCheck());
    this.count = document.createElement("span");
    this.count.className = "count";
    this.count.setAttribute("aria-hidden", "true");
    this.trigger.appendChild(this.count);
    const preserveEditorInteraction = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    this.trigger.addEventListener("pointerdown", (event) => {
      preserveEditorInteraction(event);
      if (event.isTrusted) this.callbacks.onCheck();
    });
    this.trigger.addEventListener("mousedown", preserveEditorInteraction);
    this.trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!event.isTrusted || event.detail !== 0) return;
      this.callbacks.onCheck();
    });

    this.panel = document.createElement("section");
    this.panel.id = "localix-grammar-panel";
    this.panel.className = "panel";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-labelledby", "localix-grammar-title");
    this.panel.setAttribute("aria-live", "polite");
    this.panel.addEventListener("pointerdown", preserveEditorInteraction);
    this.panel.addEventListener("mousedown", preserveEditorInteraction);
    this.panel.addEventListener("click", (event) => event.stopPropagation());
    const header = document.createElement("header");
    header.className = "header";
    const mark = document.createElement("span");
    mark.className = "brand-mark";
    mark.textContent = "L";
    const titleWrap = document.createElement("div");
    titleWrap.className = "title-wrap";
    const title = document.createElement("div");
    title.id = "localix-grammar-title";
    title.className = "title";
    title.textContent = "Corrected text";
    titleWrap.append(title);
    const close = button("×", "icon-button", () => this.callbacks.onClose());
    close.setAttribute("aria-label", "Close suggestions");
    header.append(mark, titleWrap, close);
    this.body = document.createElement("div");
    this.body.className = "body";
    this.panel.append(header, this.body);
    this.shadow.append(style, this.trigger, this.panel);
    document.documentElement.appendChild(this.host);
    window.addEventListener("pointerdown", this.onWindowPointerDown, true);
    window.addEventListener("pointerup", this.onWindowPointerUp, true);
    window.addEventListener("click", this.onWindowClick, true);
    this.colorScheme.addEventListener("change", this.onColorSchemeChange);
  }

  setTheme(theme: ThemeMode): void {
    this.theme = theme;
    this.applyResolvedTheme();
  }

  setTarget(target: SupportedElement | null): void {
    this.target = target;
    if (!target) {
      this.hide();
      return;
    }
    this.trigger.style.display = "flex";
    this.position();
  }

  containsEvent(event: Event): boolean {
    return event.composedPath().includes(this.host);
  }

  isInteracting(): boolean {
    return this.pointerInteraction;
  }

  setState(state: OverlayState, issueCount = 0): void {
    this.state = state;
    this.trigger.dataset["state"] = state;
    this.trigger.firstChild?.remove();
    this.trigger.insertAdjacentHTML("afterbegin", ICONS[state]);
    this.count.textContent = issueCount > 99 ? "99+" : String(issueCount);
    this.trigger.disabled = state === "checking";
    this.trigger.setAttribute(
      "aria-label",
      state === "issues"
        ? `${issueCount} writing ${issueCount === 1 ? "issue" : "issues"} found`
        : state === "checking"
          ? "Checking writing"
          : "Check writing with Localix Grammar",
    );
  }

  showChecking(): void {
    this.setState("checking");
    this.panel.setAttribute("aria-busy", "true");
    this.body.replaceChildren(
      this.statusView("Checking your writing…", "Usually finishes within 30 seconds"),
    );
    this.openPanel();
  }

  showError(message: string): void {
    this.setState("error");
    this.panel.setAttribute("aria-busy", "false");
    const view = this.statusView("Could not check this text", message);
    view.classList.add("error-text");
    this.body.replaceChildren(view);
    this.openPanel();
  }

  showResult(result: CheckResult): void {
    const restoreFocus = this.panelHasFocus();
    this.renderResult(result, restoreFocus);
  }

  private renderResult(result: CheckResult, restoreFocus: boolean): void {
    this.setState(result.errors.length > 0 ? "issues" : "clean", result.errors.length);
    this.panel.setAttribute("aria-busy", "false");
    this.body.replaceChildren();
    if (result.errors.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML =
        '<svg aria-hidden="true" focusable="false" class="empty-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="m7.5 12 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const text = document.createElement("div");
      text.textContent = "No clear issues found";
      empty.appendChild(text);
      this.body.appendChild(empty);
      this.openPanel();
      if (restoreFocus) this.trigger.focus({ preventScroll: true });
      return;
    }

    const summary = document.createElement("div");
    summary.className = "summary";
    const summaryHead = document.createElement("div");
    summaryHead.className = "summary-head";
    const dot = document.createElement("span");
    dot.className = "dot";
    const count = document.createElement("span");
    count.className = "summary-count";
    count.textContent = `${result.errors.length} ${
      result.errors.length === 1 ? "improvement" : "improvements"
    }`;
    summaryHead.append(dot, count);

    const preview = document.createElement("div");
    preview.className = "corrected-preview";
    preview.setAttribute("role", "region");
    preview.setAttribute("aria-label", "Corrected text preview");
    preview.append(correctedPreview(result));

    const applyAll = button("Apply all", "primary apply-all", () => this.callbacks.onApplyAll());
    applyAll.setAttribute("aria-label", "Accept all");

    summary.append(summaryHead, preview, applyAll);
    this.body.appendChild(summary);
    this.openPanel();
    if (restoreFocus) {
      this.shadow.querySelector<HTMLButtonElement>(".apply-all")?.focus({ preventScroll: true });
    }
  }

  hidePanel(shouldRestoreFocus = true): void {
    const restoreFocus = shouldRestoreFocus && this.panelHasFocus();
    this.panelOpen = false;
    this.panel.dataset["open"] = "false";
    this.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus && this.target) this.trigger.focus({ preventScroll: true });
  }

  hide(): void {
    this.hidePanel(false);
    this.trigger.style.display = "none";
    this.target = null;
  }

  position(): void {
    if (!this.target) return;
    if (!this.target.isConnected) {
      this.setTarget(null);
      return;
    }
    const rect = visibleEditorRect(this.target);
    if (!rect) {
      this.hidePanel(false);
      this.trigger.style.display = "none";
      return;
    }
    this.trigger.style.display = "flex";
    const viewport = viewportRect();
    const buttonWidth = this.trigger.offsetWidth || 24;
    const buttonHeight = this.trigger.offsetHeight || 24;
    const inset = 6;
    const desiredTop =
      rect.height >= buttonHeight + inset * 2
        ? rect.bottom - buttonHeight - inset
        : rect.top + (rect.height - buttonHeight) / 2;
    const fitsInside = rect.width >= buttonWidth + inset * 2;
    const fitsAfter = rect.right + inset + buttonWidth <= viewport.right;
    const desiredLeft = fitsInside
      ? rect.right - buttonWidth - inset
      : fitsAfter
        ? rect.right + inset
        : rect.left - buttonWidth - inset;
    const top = Math.max(
      viewport.top + 4,
      Math.min(viewport.bottom - buttonHeight - 4, desiredTop),
    );
    const left = Math.max(
      viewport.left + 4,
      Math.min(viewport.right - buttonWidth - 4, desiredLeft),
    );
    this.trigger.style.top = `${Math.round(top)}px`;
    this.trigger.style.left = `${Math.round(left)}px`;

    if (!this.panelOpen) return;
    const panelWidth = Math.min(344, viewport.width - 16);
    this.panel.style.width = `${panelWidth}px`;
    this.panel.style.maxHeight = `${viewport.height - 16}px`;
    const panelHeight = this.panel.offsetHeight || 420;
    const below = top + buttonHeight + 8;
    const above = top - panelHeight - 8;
    const fitsBelow = below + panelHeight <= viewport.bottom - 8;
    const fitsAbove = above >= viewport.top + 8;
    const spaceBelow = viewport.bottom - (top + buttonHeight);
    const spaceAbove = top - viewport.top;
    let panelTop = fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove) ? below : above;
    panelTop = Math.max(viewport.top + 8, Math.min(panelTop, viewport.bottom - panelHeight - 8));
    const panelLeft = Math.max(
      viewport.left + 8,
      Math.min(left + buttonWidth - panelWidth, viewport.right - panelWidth - 8),
    );
    this.panel.style.top = `${Math.round(panelTop)}px`;
    this.panel.style.left = `${Math.round(panelLeft)}px`;
  }

  destroy(): void {
    window.removeEventListener("pointerdown", this.onWindowPointerDown, true);
    window.removeEventListener("pointerup", this.onWindowPointerUp, true);
    window.removeEventListener("click", this.onWindowClick, true);
    this.colorScheme.removeEventListener("change", this.onColorSchemeChange);
    this.host.remove();
  }

  private applyResolvedTheme(): void {
    this.host.dataset["theme"] =
      this.theme === "system" ? (this.colorScheme.matches ? "light" : "dark") : this.theme;
  }

  private openPanel(): void {
    this.panelOpen = true;
    this.panel.dataset["open"] = "true";
    this.trigger.setAttribute("aria-expanded", "true");
    this.position();
  }

  private panelHasFocus(): boolean {
    const active = this.shadow.activeElement;
    return active instanceof Element && this.panel.contains(active);
  }

  private statusView(title: string, detail: string): HTMLElement {
    const view = document.createElement("div");
    view.className = "status-view";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const text = document.createElement("span");
    text.textContent = detail;
    view.append(strong, text);
    return view;
  }
}
