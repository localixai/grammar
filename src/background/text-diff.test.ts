import { describe, expect, test } from "vitest";

import { changesFromTexts, correctedTextFromReport } from "./text-diff";

describe("corrected text reports", () => {
  test("accepts a complete corrected text without language-specific logic", () => {
    const original = "helo how are you what are you doing ?";
    const corrected = correctedTextFromReport(
      { correctedText: "Hello, how are you? What are you doing?" },
      original,
    );

    expect(corrected).toBe("Hello, how are you? What are you doing?");
  });

  test("accepts unchanged text as a clean result", () => {
    expect(correctedTextFromReport({ correctedText: "Already correct." }, "Already correct.")).toBe(
      "Already correct.",
    );
  });

  test("rejects malformed, unsafe, blank, and oversized corrected text", () => {
    const invalidReports = [
      null,
      {},
      { correctedText: 42 },
      { correctedText: "" },
      { correctedText: "bad\u0000value" },
      { correctedText: "x".repeat(25_001) },
    ];

    for (const report of invalidReports) {
      expect(() => correctedTextFromReport(report, "source text")).toThrow();
    }
  });

  test("derives safe right-to-left editor changes from the corrected text", () => {
    const original = "helo how are you what are you doing ?";
    const corrected = "Hello, how are you? What are you doing?";
    const changes = changesFromTexts(original, corrected);
    let applied = original;
    for (const change of [...changes].sort((a, b) => b.offset - a.offset)) {
      applied =
        applied.slice(0, change.offset) +
        change.replacements[0]! +
        applied.slice(change.offset + change.length);
    }

    expect(applied).toBe(corrected);
    expect(changes).toHaveLength(3);
    expect(changes[0]).toMatchObject({
      original: "helo",
      replacements: ["Hello,"],
    });
    expect(changes[1]).toMatchObject({
      original: " w",
      replacements: ["? W"],
    });
    expect(changes.every((change) => change.replacements.length === 1)).toBe(true);
  });

  test("uses UTF-16 offsets and classifies local diff shapes", () => {
    const changes = changesFromTexts("🙂 hello !", "🙂 Hello!");

    expect(changes).toEqual([
      expect.objectContaining({
        offset: 3,
        original: "h",
        replacements: ["H"],
        shortMessage: "Capitalization",
      }),
      expect.objectContaining({
        offset: 8,
        original: " ",
        replacements: [""],
        shortMessage: "Deletion",
      }),
    ]);
  });
});
