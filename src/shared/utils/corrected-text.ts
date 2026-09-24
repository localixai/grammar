import type { CheckResult } from "../types";

export function correctedText(result: CheckResult): string {
  let text = result.originalText;
  for (const error of [...result.errors].sort((a, b) => b.offset - a.offset)) {
    const replacement = error.replacements[0];
    if (
      replacement === undefined ||
      text.slice(error.offset, error.offset + error.length) !== error.original
    ) {
      continue;
    }
    text = text.slice(0, error.offset) + replacement + text.slice(error.offset + error.length);
  }
  return text;
}
