import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CheckResult, GrammarError } from "../shared/types";
import { GrammarOverlay, requiresManualPaste } from "./overlay";

function issue(): GrammarError {
  return {
    id: "5:3:grammar:are",
    offset: 5,
    length: 3,
    original: "are",
    message: "Use singular agreement.",
    shortMessage: "Verb agreement",
    replacements: ["is"],
    type: "grammar",
    confidence: "high",
  };
}

function secondIssue(): GrammarError {
  return {
    ...issue(),
    id: "11:4:style:test",
    offset: 11,
    length: 4,
    original: "test",
    shortMessage: "Word choice",
    replacements: ["example"],
    type: "style",
  };
}

function result(errors: GrammarError[]): CheckResult {
  return {
    errors,
    originalText: "This are a test.",
    checkedAt: 1,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.querySelectorAll("localix-grammar-root").forEach((node) => node.remove());
});

describe("GrammarOverlay accessibility", () => {
  test("offers copy instead of apply for Teams contenteditable editors", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    const textarea = document.createElement("textarea");
    expect(requiresManualPaste("teams.cloud.microsoft", editor)).toBe(true);
    expect(requiresManualPaste("teams.microsoft.com", editor)).toBe(true);
    expect(requiresManualPaste("teams.cloud.microsoft", textarea)).toBe(false);
    expect(requiresManualPaste("example.com", editor)).toBe(false);
  });
  test("routes suggestion actions through the product callbacks", () => {
    const callbacks = {
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    };
    const overlay = new GrammarOverlay(callbacks);
    const shadow = overlay.host.shadowRoot!;

    overlay.showResult(result([issue(), secondIssue()]));
    shadow.querySelector<HTMLButtonElement>(".apply-all")!.click();
    shadow.querySelector<HTMLButtonElement>(".icon-button")!.click();

    expect(callbacks.onCheck).not.toHaveBeenCalled();
    expect(callbacks.onApplyAll).toHaveBeenCalledOnce();
    expect(callbacks.onApply).not.toHaveBeenCalled();
    expect(callbacks.onRejectAll).not.toHaveBeenCalled();
    expect(callbacks.onIgnore).not.toHaveBeenCalled();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  test("shows one clean corrected preview", () => {
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const shadow = overlay.host.shadowRoot!;

    overlay.showResult(result([issue(), secondIssue()]));
    expect(shadow.querySelector(".summary-count")?.textContent).toBe("2 improvements");
    expect(shadow.querySelector(".corrected-preview")?.textContent).toBe("This is a example.");
    expect(shadow.querySelector(".apply-all")?.textContent).toBe("Apply all");
    expect(shadow.querySelector(".apply-all")?.getAttribute("aria-label")).toBe("Accept all");
    expect(shadow.querySelector(".suggestion-card")).toBeNull();
    expect(shadow.querySelector(".diff-code")).toBeNull();

    overlay.showResult({
      ...result([{ ...secondIssue(), offset: 10 }]),
      originalText: "This is a test.",
    });
    expect(shadow.querySelector(".summary-count")?.textContent).toBe("1 improvement");
    expect(shadow.querySelector(".corrected-preview")?.textContent).toBe("This is a example.");
  });

  test("copies corrected text from results and from an apply error", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      const overlay = new GrammarOverlay({
        onCheck: vi.fn(),
        onApply: vi.fn(),
        onApplyAll: vi.fn(),
        onRejectAll: vi.fn(),
        onIgnore: vi.fn(),
        onClose: vi.fn(),
      });
      const shadow = overlay.host.shadowRoot!;
      overlay.showResult(result([issue()]));
      shadow.querySelector<HTMLButtonElement>(".copy-text")!.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("This is a test."));

      overlay.showError("Apply failed", "This is a test.");
      shadow.querySelector<HTMLButtonElement>(".copy-text")!.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
      overlay.destroy();
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  test("ignores script-generated trigger activation", () => {
    const onCheck = vi.fn();
    const overlay = new GrammarOverlay({
      onCheck,
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });

    overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    expect(onCheck).not.toHaveBeenCalled();
  });

  test("exposes the trigger and non-modal dialog relationship", () => {
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const shadow = overlay.host.shadowRoot!;
    const trigger = shadow.querySelector<HTMLButtonElement>(".trigger")!;
    const panel = shadow.querySelector<HTMLElement>(".panel")!;

    overlay.showChecking();

    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.getAttribute("aria-labelledby")).toBe("localix-grammar-title");
    expect(panel.getAttribute("aria-busy")).toBe("true");
    expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.host.style.getPropertyPriority("all")).toBe("important");
    expect(overlay.host.style.getPropertyValue("display")).toBe("block");
  });

  test("gives the batch action a specific accessible name", () => {
    const onApplyAll = vi.fn();
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll,
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const replacement = overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".apply-all");

    expect(replacement).toBeNull();
    overlay.showResult(result([issue()]));
    const rendered = overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".apply-all")!;
    expect(rendered.getAttribute("aria-label")).toBe("Accept all");
    rendered.click();
    expect(onApplyAll).toHaveBeenCalledOnce();
  });

  test("restores focus when an action rerenders or closes the dialog", () => {
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const textarea = document.createElement("textarea");
    textarea.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 300, 100);
    document.body.appendChild(textarea);
    overlay.setTarget(textarea);
    const shadow = overlay.host.shadowRoot!;
    const trigger = shadow.querySelector<HTMLButtonElement>(".trigger")!;
    overlay.showResult(result([issue()]));
    shadow.querySelector<HTMLButtonElement>(".apply-all")!.focus();

    overlay.showResult(result([]));
    expect(shadow.activeElement).toBe(trigger);

    overlay.showResult(result([issue()]));
    shadow.querySelector<HTMLButtonElement>(".apply-all")!.focus();
    overlay.hidePanel();
    expect(shadow.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("keeps the editor trigger at the same coordinates across state changes", () => {
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const textarea = document.createElement("textarea");
    textarea.getBoundingClientRect = (): DOMRect => new DOMRect(10, 20, 300, 100);
    document.body.appendChild(textarea);
    overlay.setTarget(textarea);
    const trigger = overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!;
    const initial = { top: trigger.style.top, left: trigger.style.left };

    overlay.showChecking();
    overlay.showResult(result([issue(), secondIssue()]));

    expect({ top: trigger.style.top, left: trigger.style.left }).toEqual(initial);
  });

  test("renders error and theme state and cleans up its host", () => {
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const shadow = overlay.host.shadowRoot!;

    overlay.setTheme("light");
    overlay.showError("Provider unavailable");

    expect(overlay.host.dataset["theme"]).toBe("light");
    expect(shadow.querySelector(".error-text")?.textContent).toContain("Provider unavailable");
    expect(shadow.querySelector(".panel")?.getAttribute("aria-busy")).toBe("false");

    overlay.destroy();
    expect(overlay.host.isConnected).toBe(false);
  });

  test("tracks system color-scheme changes and hides an orphaned target", () => {
    let onChange: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        onChange = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const textarea = document.createElement("textarea");
    textarea.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 300, 100);
    document.body.appendChild(textarea);
    overlay.setTarget(textarea);
    overlay.setTheme("system");

    media.matches = true;
    onChange?.();
    expect(overlay.host.dataset["theme"]).toBe("light");

    textarea.remove();
    overlay.position();
    expect(
      overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.style.display,
    ).toBe("none");

    overlay.destroy();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  test("hides both trigger and panel while the target is outside the viewport", () => {
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const textarea = document.createElement("textarea");
    let rect = new DOMRect(10, 10, 300, 100);
    textarea.getBoundingClientRect = (): DOMRect => rect;
    document.body.appendChild(textarea);
    overlay.setTarget(textarea);
    overlay.showResult(result([issue()]));

    rect = new DOMRect(10, window.innerHeight + 20, 300, 100);
    overlay.position();

    const shadow = overlay.host.shadowRoot!;
    expect(shadow.querySelector<HTMLButtonElement>(".trigger")!.style.display).toBe("none");
    expect(shadow.querySelector<HTMLElement>(".panel")!.dataset["open"]).toBe("false");

    rect = new DOMRect(10, 10, 300, 100);
    overlay.position();
    expect(shadow.querySelector<HTMLButtonElement>(".trigger")!.style.display).toBe("flex");
  });

  test("keeps the trigger visible beside a compact editor", () => {
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply: vi.fn(),
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const textarea = document.createElement("textarea");
    textarea.getBoundingClientRect = (): DOMRect => new DOMRect(10, 10, 1, 1);
    document.body.appendChild(textarea);

    overlay.setTarget(textarea);

    const trigger = overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!;
    expect(trigger.style.display).toBe("flex");
    expect(trigger.style.left).toBe("17px");
    expect(trigger.style.top).toBe("4px");
  });
});
