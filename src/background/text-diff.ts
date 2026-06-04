import { diffChars } from "diff";

import type { GrammarError } from "../shared/types";
import { MAX_CHECK_TEXT_LENGTH } from "../shared/types";

const MAX_CORRECTED_TEXT_LENGTH = MAX_CHECK_TEXT_LENGTH + 5_000;
const MAX_MERGED_CONTEXT_LENGTH = 2;
const UNSAFE_CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const PUNCTUATION_OR_SPACE = /^[\p{P}\p{S}\s]*$/u;

export function correctedTextFromReport(raw: unknown, originalText: string): string {
  if (!raw || typeof raw !== "object" || !("correctedText" in raw)) {
    throw new Error("The selected model returned an invalid corrected-text report.");
  }
  const correctedText = (raw as { correctedText?: unknown }).correctedText;
  if (
    typeof correctedText !== "string" ||
    correctedText.length > MAX_CORRECTED_TEXT_LENGTH ||
    UNSAFE_CONTROL_CHARACTER.test(correctedText) ||
    (originalText.trim().length > 0 && correctedText.trim().length === 0)
  ) {
    throw new Error("The selected model returned invalid corrected text.");
  }
  return correctedText;
}

function changeLabel(original: string, replacement: string): string {
  if (!original) return "Insertion";
  if (!replacement) return "Deletion";
  if (PUNCTUATION_OR_SPACE.test(original + replacement)) return "Punctuation";
  if (original.toLocaleLowerCase() === replacement.toLocaleLowerCase()) return "Capitalization";
  return "Text correction";
}

export function changesFromTexts(originalText: string, correctedText: string): GrammarError[] {
  const parts = diffChars(originalText, correctedText);
  const rawChanges: Array<{
    offset: number;
    original: string;
    replacement: string;
  }> = [];
  let offset = 0;
  let index = 0;

  while (index < parts.length) {
    const part = parts[index]!;
    if (!part.added && !part.removed) {
      offset += part.value.length;
      index += 1;
      continue;
    }

    const start = offset;
    let original = "";
    let replacement = "";
    while (index < parts.length && (parts[index]!.added || parts[index]!.removed)) {
      const changed = parts[index]!;
      if (changed.removed) {
        original += changed.value;
        offset += changed.value.length;
      } else {
        replacement += changed.value;
      }
      index += 1;
    }
    if (original === replacement) continue;
    rawChanges.push({ offset: start, original, replacement });
  }

  const mergedChanges: typeof rawChanges = [];
  for (const change of rawChanges) {
    const previous = mergedChanges.at(-1);
    if (previous) {
      const previousEnd = previous.offset + previous.original.length;
      const gapLength = change.offset - previousEnd;
      if (gapLength >= 0 && gapLength <= MAX_MERGED_CONTEXT_LENGTH) {
        const context = originalText.slice(previousEnd, change.offset);
        previous.original += context + change.original;
        previous.replacement += context + change.replacement;
        continue;
      }
    }
    mergedChanges.push({ ...change });
  }

  return mergedChanges.map((change, errorIndex) => {
    const { offset: start, original, replacement } = change;
    const shortMessage = changeLabel(original, replacement);
    return {
      id: `${start}:${original.length}:${errorIndex}`,
      offset: start,
      length: original.length,
      original,
      message: "Review this text change.",
      shortMessage,
      replacements: [replacement],
      type: shortMessage === "Punctuation" ? "punctuation" : "grammar",
      confidence: "high",
    };
  });
}
