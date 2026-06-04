import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CheckResult, GrammarError } from "../shared/types";
import { GrammarOverlay } from "./overlay";

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
    shadow.querySelector<HTMLButtonElement>(".reject-all")!.click();
    shadow.querySelector<HTMLButtonElement>(".review-toggle")!.click();
    shadow.querySelector<HTMLButtonElement>(".reject")!.click();
    shadow.querySelector<HTMLButtonElement>(".icon-button")!.click();

    expect(callbacks.onCheck).not.toHaveBeenCalled();
    expect(callbacks.onApplyAll).toHaveBeenCalledOnce();
    expect(callbacks.onRejectAll).toHaveBeenCalledOnce();
    expect(callbacks.onIgnore).toHaveBeenCalledWith(issue());
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  test("shows a batch-first corrected preview with optional compact details", () => {
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
    expect(shadow.querySelector(".preview")?.textContent).toBe("This is a example.");
    expect(shadow.querySelector(".apply-all")?.textContent).toBe("Accept all");
    expect(shadow.querySelector(".reject-all")?.textContent).toBe("Reject all");
    expect(shadow.querySelector(".details")).toBeNull();

    shadow.querySelector<HTMLButtonElement>(".review-toggle")!.click();
    expect(shadow.querySelectorAll(".detail")).toHaveLength(2);
    expect(shadow.querySelectorAll(".diff-code")).toHaveLength(2);
    expect(shadow.querySelector(".diff-line.removed")?.textContent).toBe("−are");
    expect(shadow.querySelector(".diff-line.added")?.textContent).toBe("+is");
    expect(shadow.querySelector(".review-toggle")?.textContent).toBe("Hide changes");

    overlay.showResult({
      ...result([secondIssue()]),
      originalText: "This is a test.",
    });
    expect(shadow.querySelector(".details")).not.toBeNull();
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

  test("gives hunk actions specific accessible names", () => {
    const onApply = vi.fn();
    const overlay = new GrammarOverlay({
      onCheck: vi.fn(),
      onApply,
      onApplyAll: vi.fn(),
      onRejectAll: vi.fn(),
      onIgnore: vi.fn(),
      onClose: vi.fn(),
    });
    const replacement = overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".accept");

    expect(replacement).toBeNull();
    overlay.showResult(result([issue()]));
    overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".review-toggle")!.click();
    const rendered = overlay.host.shadowRoot!.querySelector<HTMLButtonElement>(".accept")!;
    expect(rendered.getAttribute("aria-label")).toBe("Accept change 1");
    rendered.click();
    expect(onApply).toHaveBeenCalledWith(issue(), "is");
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
