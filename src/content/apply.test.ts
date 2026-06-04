import { beforeEach, describe, expect, test, vi } from "vitest";

import type { GrammarError } from "../shared/types";
import { applyAllReplacements, applyReplacement, getElementText, mapEditableText } from "./apply";

function error(offset: number, original: string, replacement: string): GrammarError {
  return {
    id: `${offset}:${original}`,
    offset,
    length: original.length,
    original,
    message: "Fix it",
    shortMessage: "Test",
    replacements: [replacement],
    type: "grammar",
    confidence: "high",
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("form controls", () => {
  test("applies a range with the native setter and preserves a later selection", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "I hav a cat";
    textarea.setSelectionRange(8, 11);
    document.body.appendChild(textarea);
    const input = vi.fn();
    const change = vi.fn();
    let beforeInputComposed = false;
    let inputComposed = false;
    textarea.addEventListener("beforeinput", (event) => {
      beforeInputComposed = event.composed;
    });
    textarea.addEventListener("input", input);
    textarea.addEventListener("input", (event) => {
      inputComposed = event.composed;
    });
    textarea.addEventListener("change", change);

    const result = applyReplacement(textarea, error(2, "hav", "have"), "have");

    expect(result).toEqual({ applied: true, text: "I have a cat" });
    expect(textarea.selectionStart).toBe(9);
    expect(textarea.selectionEnd).toBe(12);
    expect(input).toHaveBeenCalledOnce();
    expect(beforeInputComposed).toBe(true);
    expect(inputComposed).toBe(true);
    expect(change).not.toHaveBeenCalled();
  });

  test("refuses a stale span instead of replacing another occurrence", () => {
    const input = document.createElement("input");
    input.value = "The text changed";
    const result = applyReplacement(input, error(4, "cat", "dog"), "dog");
    expect(result.applied).toBe(false);
    expect(input.value).toBe("The text changed");
  });

  test("applies all replacements right-to-left", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "teh cat teh";
    const result = applyAllReplacements(textarea, [error(0, "teh", "the"), error(8, "teh", "the")]);
    expect(result).toEqual({ applied: true, complete: true, text: "the cat the" });
  });

  test("applies spelling, capitalization, punctuation insertions, and spacing in one batch", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "helo how are you what are you doing ?";
    const result = applyAllReplacements(textarea, [
      error(0, "helo", "Hello"),
      error(4, "", ","),
      error(16, "", "?"),
      error(17, "what", "What"),
      error(35, " ", ""),
    ]);

    expect(result).toEqual({
      applied: true,
      complete: true,
      text: "Hello, how are you? What are you doing?",
    });
  });

  test("accepts a replacement handled by a controlled editor during beforeinput", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "teh cat";
    textarea.setSelectionRange(7, 7);
    textarea.addEventListener("beforeinput", (event) => {
      expect(textarea.selectionStart).toBe(0);
      expect(textarea.selectionEnd).toBe(3);
      event.preventDefault();
      textarea.value = "the cat";
    });

    const result = applyReplacement(textarea, error(0, "teh", "the"), "the");

    expect(result).toEqual({ applied: true, text: "the cat" });
  });

  test("does not mutate when a controlled editor rejects beforeinput", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "teh cat";
    textarea.setSelectionRange(7, 7);
    textarea.addEventListener("beforeinput", (event) => event.preventDefault());

    const result = applyReplacement(textarea, error(0, "teh", "the"), "the");

    expect(result).toEqual({ applied: false, text: "teh cat" });
    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);
  });
});

describe("contenteditable", () => {
  test("maps block boundaries to newlines", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<p>First line</p><p>Second line</p>";
    expect(mapEditableText(editor).text).toBe("First line\nSecond line");
  });

  test("maps a block followed by inline content with a visual boundary", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<p>First line</p><span>Second line</span>";
    expect(mapEditableText(editor).text).toBe("First line\nSecond line");
  });

  test("maps table cells and rows with protected visual boundaries", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<table><tbody><tr><td>First</td><td>Second</td></tr></tbody></table>";

    expect(mapEditableText(editor).text).toBe("First\nSecond");
  });

  test("omits hidden, inert, and non-rendered source nodes", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML =
      'Visible<span hidden>hidden</span><span inert>inert</span><span aria-hidden="true">duplicate</span><span style="display:none">none</span><script>secret()</script><style>.secret{}</style><template>template</template> text';

    expect(mapEditableText(editor).text).toBe("Visible text");
  });

  test("never deletes an omitted hidden subtree while replacing surrounding text", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "bad<span hidden>private</span> word";
    document.body.appendChild(editor);

    const result = applyReplacement(editor, error(0, "bad word", "good phrase"), "good phrase");

    expect(result.applied).toBe(false);
    expect(editor.querySelector("[hidden]")?.textContent).toBe("private");
    expect(getElementText(editor)).toBe("bad word");
  });

  test("replaces text without destroying rich formatting", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "I <strong>hav</strong> a cat";
    document.body.appendChild(editor);

    const result = applyReplacement(editor, error(2, "hav", "have"), "have");

    expect(result.applied).toBe(true);
    expect(getElementText(editor)).toBe("I have a cat");
    expect(editor.querySelector("strong")?.textContent).toBe("have");
  });

  test("inserts punctuation into rich text without flattening formatting", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<strong>Hello</strong> there";
    document.body.appendChild(editor);

    const result = applyReplacement(editor, error(5, "", ","), ",");

    expect(result).toEqual({ applied: true, text: "Hello, there" });
    expect(editor.querySelector("strong")?.textContent).toBe("Hello,");
  });

  test("selects the exact rich-text target before dispatching beforeinput", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "I <strong>hav</strong> a cat";
    document.body.appendChild(editor);
    let selected = "";
    editor.addEventListener("beforeinput", () => {
      selected = document.getSelection()?.toString() ?? "";
    });

    applyReplacement(editor, error(2, "hav", "have"), "have");

    expect(selected).toBe("hav");
  });

  test("preserves a later rich-text selection after shifting offsets", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "I <strong>hav</strong> a cat and dog";
    document.body.appendChild(editor);
    const lastText = editor.lastChild as Text;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(lastText, 11, lastText, 14);

    applyReplacement(editor, error(2, "hav", "have"), "have");

    expect(selection.toString()).toBe("dog");
    expect(selection.anchorNode).toBe(lastText);
    expect(selection.anchorOffset).toBe(11);
    expect(selection.focusOffset).toBe(14);
  });

  test("replaces a span across adjacent text nodes", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<span>bad</span><em> word</em>";
    document.body.appendChild(editor);

    const result = applyReplacement(editor, error(0, "bad word", "good phrase"), "good phrase");

    expect(result.applied).toBe(true);
    expect(getElementText(editor)).toBe("good phrase");
  });

  test("applies an issue after a block boundary at the correct offset", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<p>Good</p><p>teh cat</p>";
    document.body.appendChild(editor);

    const result = applyReplacement(editor, error(5, "teh", "the"), "the");

    expect(result.applied).toBe(true);
    expect(getElementText(editor)).toBe("Good\nthe cat");
  });

  test("refuses to replace synthetic block boundaries", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = "<p>First</p><p>Second</p>";
    document.body.appendChild(editor);

    const result = applyReplacement(editor, error(5, "\n", " "), " ");

    expect(result.applied).toBe(false);
    expect(editor.innerHTML).toBe("<p>First</p><p>Second</p>");
  });

  test("includes but never mutates nested non-editable mentions", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = 'Fix <span contenteditable="false">@teh</span> now';
    document.body.appendChild(editor);

    expect(getElementText(editor)).toBe("Fix @teh now");
    const result = applyReplacement(editor, error(4, "@teh", "@the"), "@the");

    expect(result.applied).toBe(false);
    expect(editor.querySelector('[contenteditable="false"]')?.textContent).toBe("@teh");
  });

  test("reports a partial apply-all instead of claiming the editor is clean", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.innerHTML = 'bad <span contenteditable="false">@teh</span>';
    document.body.appendChild(editor);

    const result = applyAllReplacements(editor, [
      error(0, "bad", "good"),
      error(4, "@teh", "@the"),
    ]);

    expect(result).toEqual({ applied: true, complete: false, text: "good @teh" });
    expect(editor.querySelector('[contenteditable="false"]')?.textContent).toBe("@teh");
  });
});
