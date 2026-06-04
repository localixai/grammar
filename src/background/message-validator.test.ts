import { describe, expect, test } from "vitest";

import { isMessage } from "./message-validator";

describe("isMessage", () => {
  test("accepts the content and popup message contracts", () => {
    expect(
      isMessage({
        type: "CHECK_TEXT",
        payload: { requestId: "7f0b8c3e-1", text: "Some text", language: "en-GB" },
      }),
    ).toBe(true);
    expect(isMessage({ type: "SET_SETTINGS", payload: { enabled: false, theme: "dark" } })).toBe(
      true,
    );
    expect(isMessage({ type: "GET_SETTINGS" })).toBe(true);
    expect(isMessage({ type: "CONNECT_API_KEY", payload: { apiKey: "sk-or-v1-test-key" } })).toBe(
      true,
    );
  });

  test("rejects malformed, oversized, and unknown messages", () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage({ type: "CHECK_TEXT", payload: { requestId: "", text: "text" } })).toBe(false);
    expect(
      isMessage({
        type: "CHECK_TEXT",
        payload: { requestId: "request-1", text: "x".repeat(20_001) },
      }),
    ).toBe(false);
    expect(isMessage({ type: "UNKNOWN" })).toBe(false);
    expect(isMessage({ type: "CONNECT_API_KEY", payload: { apiKey: "" } })).toBe(false);
    expect(isMessage({ type: "CONNECT_API_KEY", payload: { apiKey: `sk-test\u0000secret` } })).toBe(
      false,
    );
    expect(isMessage({ type: "CONNECT_API_KEY", payload: { apiKey: "x".repeat(8_193) } })).toBe(
      false,
    );
  });

  test("does not allow settings messages to smuggle credentials or invalid values", () => {
    expect(isMessage({ type: "SET_SETTINGS", payload: { apiKey: "secret" } })).toBe(false);
    expect(isMessage({ type: "SET_SETTINGS", payload: { enabled: true }, apiKey: "secret" })).toBe(
      false,
    );
    expect(isMessage({ type: "GET_SETTINGS", apiKey: "secret" })).toBe(false);
    expect(isMessage({ type: "SET_SETTINGS", payload: { checkDelayMs: Number.NaN } })).toBe(false);
    expect(isMessage({ type: "SET_SETTINGS", payload: { theme: "blue" } })).toBe(false);
  });

  test("rejects unknown fields inside check and cancellation payloads", () => {
    expect(
      isMessage({
        type: "CHECK_TEXT",
        payload: { requestId: "request-1", text: "Some text", apiKey: "secret" },
      }),
    ).toBe(false);
    expect(
      isMessage({
        type: "CANCEL_CHECK",
        payload: { requestId: "request-1", tabId: 42 },
      }),
    ).toBe(false);
  });
});
