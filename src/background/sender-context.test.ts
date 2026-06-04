import { describe, expect, test } from "vitest";

import { isExtensionPage, scopedRequestId, topLevelHostname } from "./sender-context";

function sender(tabUrl?: string, frameUrl?: string): chrome.runtime.MessageSender {
  return {
    ...(frameUrl ? { url: frameUrl } : {}),
    ...(tabUrl ? { tab: { id: 42, url: tabUrl } as chrome.tabs.Tab } : {}),
  };
}

describe("topLevelHostname", () => {
  test("uses and normalizes the top-level tab URL", () => {
    expect(
      topLevelHostname(sender("https://EXAMPLE.com/editor", "https://widgets.example/frame")),
    ).toBe("example.com");
  });

  test("does not mistake a cross-origin frame URL for the current site", () => {
    expect(topLevelHostname(sender(undefined, "https://widgets.example/frame"))).toBeNull();
  });

  test("rejects non-web and malformed tab URLs", () => {
    expect(topLevelHostname(sender("chrome-extension://id/popup.html"))).toBeNull();
    expect(topLevelHostname(sender("not a URL"))).toBeNull();
  });
});

describe("isExtensionPage", () => {
  test("accepts only an internal page whose origin matches the sender id", () => {
    expect(
      isExtensionPage({
        id: "abcdefghijklmnop",
        url: "chrome-extension://abcdefghijklmnop/src/popup/index.html",
      }),
    ).toBe(true);
    expect(
      isExtensionPage({
        id: "abcdefghijklmnop",
        url: "chrome-extension://attacker/src/popup/index.html",
      }),
    ).toBe(false);
    expect(isExtensionPage({ id: "abcdefghijklmnop", url: "https://example.com/editor" })).toBe(
      false,
    );
  });
});

describe("scopedRequestId", () => {
  test("isolates request ids by tab, frame, and document", () => {
    expect(
      scopedRequestId(
        {
          tab: { id: 42 } as chrome.tabs.Tab,
          frameId: 3,
          documentId: "document-a",
        },
        "same-id",
      ),
    ).toBe("42:3:document-a:same-id");
    expect(
      scopedRequestId(
        {
          tab: { id: 43 } as chrome.tabs.Tab,
          frameId: 3,
          documentId: "document-a",
        },
        "same-id",
      ),
    ).toBe("43:3:document-a:same-id");
  });

  test("rejects requests without a tab identity", () => {
    expect(scopedRequestId({ frameId: 0 }, "request")).toBeNull();
  });
});
