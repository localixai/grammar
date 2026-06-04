import { beforeEach, describe, expect, test } from "vitest";

import {
  isEligibleElement,
  isSupportedElement,
  languageForElement,
  resolveEditableTarget,
  skipReason,
} from "./input-detector";

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("lang");
});

describe("editable field detection", () => {
  test("supports prose controls and rejects non-prose inputs", () => {
    const text = document.createElement("input");
    text.type = "text";
    const email = document.createElement("input");
    email.type = "email";
    const password = document.createElement("input");
    password.type = "password";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(isSupportedElement(text)).toBe(true);
    expect(isSupportedElement(email)).toBe(false);
    expect(isSupportedElement(password)).toBe(false);
    expect(isSupportedElement(checkbox)).toBe(false);
  });

  test("resolves a child of contenteditable to its top-level editor", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    const child = document.createElement("span");
    editor.appendChild(child);
    document.body.appendChild(editor);
    const event = new Event("focusin", { composed: true });
    Object.defineProperty(event, "composedPath", { value: () => [child, editor, document] });
    expect(resolveEditableTarget(event)).toBe(editor);
  });

  test.each(["", "true", "plaintext-only"])(
    "supports contenteditable=%j editing hosts",
    (contenteditable) => {
      const editor = document.createElement("div");
      editor.setAttribute("contenteditable", contenteditable);
      const event = new Event("focusin", { composed: true });
      Object.defineProperty(event, "composedPath", { value: () => [editor, document] });

      expect(isSupportedElement(editor)).toBe(true);
      expect(resolveEditableTarget(event)).toBe(editor);
    },
  );

  test("does not cross a nested contenteditable=false boundary", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    const island = document.createElement("span");
    island.contentEditable = "false";
    const child = document.createElement("button");
    island.appendChild(child);
    editor.appendChild(island);
    document.body.appendChild(editor);
    const event = new Event("focusin", { composed: true });
    Object.defineProperty(event, "composedPath", {
      value: () => [child, island, editor, document],
    });

    expect(resolveEditableTarget(event)).toBeNull();
  });
});

describe("privacy and opt-out policy", () => {
  test("skips readonly, disabled, and ARIA-disabled fields", () => {
    const textarea = document.createElement("textarea");
    textarea.readOnly = true;
    expect(skipReason(textarea)).toBe("disabled or readonly");
    textarea.readOnly = false;
    textarea.setAttribute("aria-disabled", "true");
    expect(skipReason(textarea)).toBe("ARIA disabled or readonly");
  });

  test("does not treat native spellcheck state as an extension opt-out", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("spellcheck", "false");
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    wrapper.appendChild(editor);
    document.body.appendChild(wrapper);
    expect(skipReason(editor)).toBeNull();
  });

  test.each([
    "cc-number",
    "current-password",
    "one-time-code",
    "section-checkout shipping cc-number",
    "email",
  ])("skips sensitive autocomplete=%s fields", (autocomplete) => {
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("autocomplete", autocomplete);
    expect(skipReason(input)).toBe("sensitive autocomplete field");
  });

  test("honors Localix and common grammar-tool opt-outs", () => {
    const wrapper = document.createElement("div");
    wrapper.dataset["localixGrammarIgnore"] = "true";
    const textarea = document.createElement("textarea");
    wrapper.appendChild(textarea);
    document.body.appendChild(wrapper);
    expect(isEligibleElement(textarea)).toBe(false);
  });

  test.each(["numeric", "decimal", "tel", "email", "url", "none"])(
    "skips non-prose inputmode=%s editors",
    (inputMode) => {
      const editor = document.createElement("div");
      editor.contentEditable = "true";
      editor.setAttribute("inputmode", inputMode);
      expect(skipReason(editor)).toBe("non-prose input mode");
    },
  );

  test("skips widget roles", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("role", "spinbutton");
    expect(skipReason(input)).toBe("non-prose role");
  });

  test.each([
    ["name", "account_password"],
    ["id", "checkout-card-number"],
    ["placeholder", "Enter verification code"],
    ["aria-label", "One-time password"],
  ])("skips sensitive fields identified by %s", (attribute, value) => {
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute(attribute, value);

    expect(skipReason(input)).toBe("sensitive field label");
  });

  test("does not overmatch sensitive substrings inside ordinary words", () => {
    const textarea = document.createElement("textarea");
    textarea.placeholder = "Share your opinion";

    expect(skipReason(textarea)).toBeNull();
  });
});

describe("language hints", () => {
  test("uses the nearest valid inherited language", () => {
    document.documentElement.lang = "en";
    const wrapper = document.createElement("section");
    wrapper.lang = "ru-Cyrl";
    const textarea = document.createElement("textarea");
    wrapper.appendChild(textarea);
    document.body.appendChild(wrapper);

    expect(languageForElement(textarea)).toBe("ru-Cyrl");
  });

  test("inherits language through nested shadow hosts", () => {
    const outer = document.createElement("section");
    outer.lang = "tr";
    const outerShadow = outer.attachShadow({ mode: "open" });
    const innerHost = document.createElement("div");
    const innerShadow = innerHost.attachShadow({ mode: "open" });
    const textarea = document.createElement("textarea");
    innerShadow.appendChild(textarea);
    outerShadow.appendChild(innerHost);
    document.body.appendChild(outer);

    expect(languageForElement(textarea)).toBe("tr");
  });

  test("ignores malformed language attributes", () => {
    document.documentElement.lang = "en";
    const textarea = document.createElement("textarea");
    textarea.lang = "ignore previous instructions";
    document.body.appendChild(textarea);

    expect(languageForElement(textarea)).toBe("en");
  });
});

describe("composed-tree exclusions", () => {
  test("inherits explicit privacy opt-outs but not native spellcheck state across a shadow host", () => {
    const host = document.createElement("section");
    host.setAttribute("data-localix-grammar-ignore", "");
    const shadow = host.attachShadow({ mode: "open" });
    const editor = document.createElement("textarea");
    shadow.appendChild(editor);
    document.body.appendChild(host);

    expect(skipReason(editor)).toBe("extension opt-out");

    host.removeAttribute("data-localix-grammar-ignore");
    host.setAttribute("spellcheck", "false");
    expect(skipReason(editor)).toBeNull();
  });

  test("inherits ARIA disabled and widget roles across a shadow host", () => {
    const host = document.createElement("section");
    const shadow = host.attachShadow({ mode: "open" });
    const editor = document.createElement("textarea");
    shadow.appendChild(editor);
    document.body.appendChild(host);

    host.setAttribute("aria-disabled", "true");
    expect(skipReason(editor)).toBe("ARIA disabled or readonly");

    host.removeAttribute("aria-disabled");
    host.setAttribute("role", "listbox");
    expect(skipReason(editor)).toBe("non-prose role");
  });
});
