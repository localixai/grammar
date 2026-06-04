import { describe, expect, test } from "vitest";

import { publicErrorMessage } from "./public-error";

describe("publicErrorMessage", () => {
  test("preserves a useful bounded provider error", () => {
    expect(publicErrorMessage(new Error("Provider temporarily unavailable"))).toBe(
      "Provider temporarily unavailable",
    );
    expect(publicErrorMessage(new Error("x".repeat(600)))).toHaveLength(500);
  });

  test("redacts OpenRouter-style keys, bearer values, and control characters", () => {
    const message = publicErrorMessage(
      new Error("key sk-or-v1-supersecretvalue; Authorization: Bearer token-value\u0000failed"),
    );
    expect(message).toBe(
      "key [credential redacted]; Authorization: Bearer [credential redacted] failed",
    );
    expect(message).not.toContain("supersecretvalue");
    expect(message).not.toContain("token-value");
  });

  test("does not stringify arbitrary thrown values", () => {
    expect(publicErrorMessage({ apiKey: "secret" })).toBe("Unknown error");
  });
});
