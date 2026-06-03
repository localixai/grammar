import type { SupportedElement } from "./input-detector";

export type TriggerButtonState = "idle" | "loading" | "has-errors" | "no-errors";

// ── SVG Icons (10×10, thin strokes) ────────────────────────────────

const ICONS: Record<TriggerButtonState, string> = {
  idle: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2 8h1.5L8.5 3 7 1.5 2 6.5V8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M6 2.5l1.5 1.5" stroke="currentColor" stroke-width="1.0" stroke-linecap="round"/>
  </svg>`,

  loading: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="animation:localix-spin 0.75s linear infinite;transform-origin:center">
    <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="16" stroke-dashoffset="6" stroke-linecap="round"/>
  </svg>`,

  "has-errors": `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M1.5 4.5Q2.5 3.5 3.5 4.5Q4.5 5.5 5.5 4.5Q6.5 3.5 7.5 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M1.5 7Q2.5 6 3.5 7Q4.5 8 5.5 7Q6.5 6 7.5 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`,

  "no-errors": `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M1.5 5.5L3.8 7.8L8.5 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

// ── Color mapping ──────────────────────────────────────────────────

function stateColor(state: TriggerButtonState): string {
  switch (state) {
    case "has-errors": return "var(--lx-error)";
    case "no-errors":  return "var(--lx-green)";
    case "loading":    return "var(--lx-text-faint)";
    default:           return "var(--lx-text-soft)";
  }
}

function stateBorderColor(state: TriggerButtonState): string {
  switch (state) {
    case "has-errors": return "rgba(239,68,68,0.45)";
    case "no-errors":  return "rgba(74,222,128,0.35)";
    default:           return "var(--lx-border)";
  }
}

// ── TriggerButton ──────────────────────────────────────────────────

export class TriggerButton {
  private readonly button: HTMLButtonElement;
  private readonly container: HTMLElement;
  private state: TriggerButtonState = "idle";
  private visible = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly target: SupportedElement,
    private readonly onClick: () => void,
  ) {
    this.container = this.createContainer();
    this.button = this.createButton();
    this.container.appendChild(this.button);
    document.body.appendChild(this.container);
    this.position();
  }

  // ── Factory methods ────────────────────────────────────────────

  private createContainer(): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-grammar-ignore", "true");
    el.className = "localix-grammar";
    el.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      display: none;
      width: 22px;
      height: 22px;
    `;
    return el;
  }

  private createButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.setAttribute("data-grammar-ignore", "true");
    btn.title = "Check grammar";
    btn.innerHTML = ICONS.idle;
    btn.style.cssText = `
      pointer-events: all;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid var(--lx-border);
      background: var(--lx-bg);
      color: var(--lx-text-soft);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 0.12s ease, transform 0.12s ease,
                  background 0.12s, color 0.12s, border-color 0.12s;
      padding: 0;
      box-shadow: 0 1px 6px rgba(0,0,0,0.18);
      line-height: 1;
      outline: none;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "var(--lx-bg-hover)";
      btn.style.color = "var(--lx-text)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "var(--lx-bg)";
      btn.style.color = stateColor(this.state);
    });
    btn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.cancelHide();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick();
    });

    return btn;
  }

  // ── State ──────────────────────────────────────────────────────

  setState(state: TriggerButtonState): void {
    this.state = state;
    this.button.innerHTML = ICONS[state];
    this.button.style.color = stateColor(state);
    this.button.style.borderColor = stateBorderColor(state);
    this.button.disabled = state === "loading";
  }

  getState(): TriggerButtonState {
    return this.state;
  }

  // ── Positioning ────────────────────────────────────────────────

  position(): void {
    const rect = this.target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const size = 22;
    const margin = 5;
    const top = rect.top + (rect.height - size) / 2;
    const left = rect.right - size - margin;

    this.container.style.top = `${Math.round(top)}px`;
    this.container.style.left = `${Math.round(left)}px`;
  }

  getPosition(): { top: number; left: number; width: number; height: number } {
    return {
      top: parseFloat(this.container.style.top) || 0,
      left: parseFloat(this.container.style.left) || 0,
      width: 22,
      height: 22,
    };
  }

  // ── Visibility ─────────────────────────────────────────────────

  show(): void {
    this.cancelHide();
    this.visible = true;
    this.position();
    this.container.style.display = "block";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.visible) {
          this.button.style.opacity = "1";
          this.button.style.transform = "scale(1)";
        }
      });
    });
  }

  hide(delay = 120): void {
    this.visible = false;
    this.button.style.opacity = "0";
    this.button.style.transform = "scale(0.8)";
    this.cancelHide();
    this.hideTimer = setTimeout(() => {
      if (!this.visible) this.container.style.display = "none";
    }, delay);
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ── Cleanup ────────────────────────────────────────────────────

  destroy(): void {
    this.cancelHide();
    this.container.remove();
  }

  private cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
