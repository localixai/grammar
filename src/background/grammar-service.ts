import type { CheckResult, CheckRequest, GrammarError, ErrorType } from "../shared/types";

// ── JSON schema returned by the model ────────────────────────────────────────
//
// Kept intentionally minimal — fewer schema tokens = faster first token.

const GRAMMAR_SCHEMA = {
  type: "object",
  properties: {
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // 0-based Unicode char index where the error starts
          offset: { type: "integer" },
          // Exact erroneous substring copied verbatim from the input
          original: { type: "string" },
          // Human-readable explanation (keep short)
          message: { type: "string" },
          // One-word label: "Wrong word" / "Misspelling" / etc.
          shortMessage: { type: "string" },
          // Best correction first; empty string = delete the word
          replacements: { type: "array", items: { type: "string" }, maxItems: 3 },
          // Error category
          type: { type: "string", enum: ["grammar", "spelling", "style", "punctuation"] },
        },
        required: ["offset", "original", "message", "shortMessage", "replacements", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["errors"],
  additionalProperties: false,
} as const;

// ── System prompt ─────────────────────────────────────────────────────────────
//
// Optimised for speed: short, unambiguous, no fluff.
// The offset rule is the most critical — models often get it wrong.

const SYSTEM_PROMPT = `You are a grammar and spelling checker. Return only real errors — do not flag style or rewrite correctly written text.

OFFSET RULE (critical): "offset" is the 0-based Unicode character index of the first character of "original" in the input text. Spaces count. Verify: input[offset : offset + len(original)] === original exactly.

For each error output:
- offset: integer (0-based char index, verified)
- original: the exact wrong substring, copied verbatim
- message: brief explanation
- shortMessage: one short label (e.g. "Wrong verb form")
- replacements: up to 3 corrections, best first (empty string = delete)
- type: "grammar" | "spelling" | "style" | "punctuation"

Omit errors you are not confident about. Return an empty array if the text is correct.`;

// ── OpenRouter response shape ─────────────────────────────────────────────────

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
}

interface RawError {
  offset?: unknown;
  original?: unknown;
  message?: unknown;
  shortMessage?: unknown;
  replacements?: unknown;
  type?: unknown;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run a grammar check via OpenRouter.
 *
 * :nitro  — routes to the highest-throughput provider (max speed)
 * thinking disabled — skips extended reasoning to cut latency
 */
export async function checkGrammar(
  request: CheckRequest,
  apiKey: string,
  model: string,
): Promise<CheckResult> {
  const { text } = request;

  // Append :nitro for maximum throughput routing (sort by speed, no load balancing)
  const nitroModel = model.endsWith(":nitro") ? model : `${model}:nitro`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://localix.ai",
      "X-Title": "Localix Grammar",
    },
    body: JSON.stringify({
      model: nitroModel,

      // Cap output — grammar JSON is always small; prevents runaway generation
      max_tokens: 2048,

      // Structured output — forces the model to return valid JSON matching the schema
      response_format: {
        type: "json_schema",
        json_schema: { name: "grammar_check", strict: true, schema: GRAMMAR_SCHEMA },
      },

      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Text to check (${text.length} chars):\n\n${text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `OpenRouter error: HTTP ${res.status}`);
  }

  const data = (await res.json()) as OpenRouterResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from model");

  const parsed = JSON.parse(content) as { errors: RawError[] };
  const errors = validateErrors(parsed.errors, text);

  return { errors, originalText: text };
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_ERROR_TYPES = new Set<string>(["grammar", "spelling", "style", "punctuation"]);

/** Validate, normalise, and offset-verify errors from the model. */
function validateErrors(rawErrors: RawError[], text: string): GrammarError[] {
  if (!Array.isArray(rawErrors)) return [];

  return rawErrors
    .map((raw) => normalizeError(raw, text))
    .filter((e): e is GrammarError => e !== null)
    // Final guard: offset must actually point to the reported original substring
    .filter((e) => text.slice(e.offset, e.offset + e.length) === e.original);
}

function normalizeError(raw: RawError, text: string): GrammarError | null {
  const original = typeof raw.original === "string" ? raw.original.trim() : "";
  if (!original) return null;

  const hintOffset = typeof raw.offset === "number" ? Math.max(0, raw.offset) : 0;
  const offset = findBestOffset(text, original, hintOffset);

  // Reject if we couldn't place the original anywhere in the text
  if (text.slice(offset, offset + original.length) !== original) return null;

  const replacements = Array.isArray(raw.replacements)
    ? (raw.replacements as unknown[])
        .filter((r): r is string => typeof r === "string")
        .slice(0, 3)
    : [];

  return {
    original,
    offset,
    length: original.length,
    message: typeof raw.message === "string" ? raw.message : "",
    shortMessage: typeof raw.shortMessage === "string" ? raw.shortMessage : "",
    replacements,
    type: (VALID_ERROR_TYPES.has(raw.type as string) ? raw.type : "grammar") as ErrorType,
  };
}

// ── Offset resolution ─────────────────────────────────────────────────────────

/**
 * Find the actual character offset of `original` in `text` near `hint`.
 * Models sometimes return wrong offsets (byte vs. char confusion, off-by-one).
 * Three-step search: exact → ±50 char window → first occurrence.
 */
function findBestOffset(text: string, original: string, hint: number): number {
  // 1. Exact match at hinted position
  if (text.slice(hint, hint + original.length) === original) return hint;

  // 2. Search in ±50 char window
  const radius = 50;
  const start = Math.max(0, hint - radius);
  const end = Math.min(text.length, hint + radius + original.length);
  const rel = text.slice(start, end).indexOf(original);
  if (rel !== -1) return start + rel;

  // 3. First occurrence anywhere in the text
  const fallback = text.indexOf(original);
  return fallback === -1 ? hint : fallback;
}
