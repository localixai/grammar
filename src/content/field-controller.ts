import type { SupportedElement } from "./input-detector";
import { getElementText } from "./input-detector";
import { applyReplacement } from "./apply";
import { TriggerButton } from "./trigger-button";
import { SuggestionsPanel } from "./suggestions-panel";
import type { CheckResult, GrammarError, Message, MessageResponse } from "../shared/types";

// ── Messaging helper ───────────────────────────────────────────────

function sendMessage(msg: Message): Promise<MessageResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r: MessageResponse) => resolve(r));
  });
}

// ── FieldController ────────────────────────────────────────────────

/**
 * Manages a single input field: attaches a trigger button,
 * handles grammar checking, and coordinates the suggestions panel.
 */
export class FieldController {
  private readonly button: TriggerButton;
  private readonly resizeObserver: ResizeObserver;
  private panel: SuggestionsPanel | null = null;
  private isPanelOpen = false;
  private hasFocus = false;
  private suppressInputReset = false;
  private lastCheckedText: string | null = null;
  private lastResult: CheckResult | null = null;
  private repositionRafId: number | null = null;

  constructor(private readonly element: SupportedElement) {
    this.button = new TriggerButton(element, () => void this.handleButtonClick());
    this.resizeObserver = new ResizeObserver(() => {
      // Debounce via rAF — fires at most once per frame, prevents lag on every keystroke
      if (this.repositionRafId !== null) return;
      this.repositionRafId = requestAnimationFrame(() => {
        this.repositionRafId = null;
        this.button.position();
        if (this.isPanelOpen && this.panel) {
          this.panel.updateButtonPosition(this.button.getPosition());
          this.panel.position();
        }
      });
    });
    this.resizeObserver.observe(element);
    this.setupListeners();
  }

  // ── Event listeners ────────────────────────────────────────────

  private setupListeners(): void {
    this.element.addEventListener("focus", this.onFocus);
    this.element.addEventListener("blur", this.onBlur as EventListener);
    this.element.addEventListener("input", this.onInput);
    document.addEventListener("mousedown", this.onDocumentMousedown, true);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onScroll, { passive: true });
  }

  private readonly onFocus = (): void => {
    this.hasFocus = true;
    this.button.show();
  };

  private readonly onBlur = (e: FocusEvent): void => {
    this.hasFocus = false;
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.closest("[data-grammar-ignore]")) return;
    if (this.isPanelOpen) return;
    this.button.hide();
  };

  private readonly onInput = (): void => {
    if (this.suppressInputReset) return;
    // Compare raw text (no trim) so any mutation — including adding/removing spaces — resets state
    const current = getElementText(this.element);
    if (current !== this.lastCheckedText) {
      this.lastCheckedText = null;
      this.lastResult = null;
      if (this.button.getState() !== "idle") this.button.setState("idle");
    }
  };

  private readonly onDocumentMousedown = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-grammar-ignore]")) return;
    if (target === this.element || this.element.contains(target)) return;
    this.closePanel();
    this.button.hide(0);
  };

  private readonly onScroll = (): void => {
    this.button.position();
    if (this.isPanelOpen && this.panel) {
      this.panel.updateButtonPosition(this.button.getPosition());
      this.panel.position();
    }
  };

  // ── Button click handler ───────────────────────────────────────

  private async handleButtonClick(): Promise<void> {
    // Toggle panel if already open
    if (this.isPanelOpen) {
      this.closePanel();
      if (this.hasFocus) this.button.show();
      return;
    }

    const text = getElementText(this.element);
    if (!text.trim()) return;

    // Reuse cached result if text hasn't changed
    if (text === this.lastCheckedText && this.lastResult) {
      this.openPanel(this.lastResult);
      return;
    }

    // Fetch new results
    this.button.setState("loading");
    const response = await sendMessage({ type: "CHECK_TEXT", payload: { text } });

    if (!response.success) {
      this.button.setState("idle");
      this.openErrorPanel(response.error);
      return;
    }

    const result = (response as { success: true; data: CheckResult }).data;
    this.lastCheckedText = text; // store raw (non-trimmed) to match onInput
    this.lastResult = result;
    this.button.setState(result.errors.length > 0 ? "has-errors" : "no-errors");
    this.openPanel(result);
  }

  // ── Panel management ───────────────────────────────────────────

  private ensurePanel(): SuggestionsPanel {
    if (!this.panel) {
      this.panel = new SuggestionsPanel(
        this.element,
        (error, replacement) => this.handleApplySingle(error, replacement),
        () => this.handleApplyAll(),
        () => {
          this.closePanel();
          if (this.hasFocus) this.button.show();
        },
      );
    }
    return this.panel;
  }

  private openPanel(result: CheckResult): void {
    const panel = this.ensurePanel();
    panel.updateButtonPosition(this.button.getPosition());
    panel.show(result);
    this.isPanelOpen = true;
    this.button.show();
  }

  private openErrorPanel(message: string): void {
    const panel = this.ensurePanel();
    panel.updateButtonPosition(this.button.getPosition());
    panel.showError(message);
    this.isPanelOpen = true;
    this.button.show();
  }

  private closePanel(): void {
    this.panel?.hide();
    this.isPanelOpen = false;
  }

  // ── Replacement handlers ───────────────────────────────────────

  private handleApplySingle(error: GrammarError, replacement: string): void {
    if (!this.lastResult) return;
    this.suppressInputReset = true;

    try {
      const newText = applyReplacement(this.element, error, replacement);
      const diff = replacement.length - error.length;

      // Update remaining errors: shift offsets for those after the applied fix
      const updatedErrors = this.lastResult.errors
        .filter((e) => e !== error)
        .map((e) => (e.offset > error.offset ? { ...e, offset: e.offset + diff } : e));

      this.lastResult = { errors: updatedErrors, originalText: newText };
      this.lastCheckedText = newText; // store raw to match onInput
      this.button.setState(updatedErrors.length > 0 ? "has-errors" : "no-errors");
      this.panel?.refreshAfterApply(newText, updatedErrors);
    } finally {
      this.suppressInputReset = false;
    }
  }

  private handleApplyAll(): void {
    if (!this.panel) return;
    this.suppressInputReset = true;

    try {
      const newText = this.panel.applyAll();
      this.lastResult = { errors: [], originalText: newText };
      this.lastCheckedText = newText; // store raw to match onInput
      this.button.setState("no-errors");
      this.closePanel();
      if (this.hasFocus) this.button.show();
    } finally {
      this.suppressInputReset = false;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────

  destroy(): void {
    this.element.removeEventListener("focus", this.onFocus);
    this.element.removeEventListener("blur", this.onBlur as EventListener);
    this.element.removeEventListener("input", this.onInput);
    document.removeEventListener("mousedown", this.onDocumentMousedown, true);
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onScroll);
    this.resizeObserver.disconnect();
    if (this.repositionRafId !== null) cancelAnimationFrame(this.repositionRafId);
    this.button.destroy();
    this.panel?.destroy();
  }
}
