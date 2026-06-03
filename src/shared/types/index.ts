// ── Grammar types ────────────────────────────────────────

export interface GrammarError {
  readonly offset: number;
  readonly length: number;
  readonly original: string;
  readonly message: string;
  readonly shortMessage: string;
  readonly replacements: readonly string[];
  readonly type: ErrorType;
}

export type ErrorType = "grammar" | "spelling" | "style" | "punctuation";

export interface CheckResult {
  readonly errors: readonly GrammarError[];
  readonly originalText: string;
}

export interface CheckRequest {
  readonly text: string;
  readonly language?: string;
}

// ── Model definitions ────────────────────────────────────

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly created?: number;
}

export const DEFAULT_MODEL = "openai/gpt-5.4-mini";

// ── Settings ─────────────────────────────────────────────

export interface Settings {
  apiKey: string;
  model: string;
  enabled: boolean;
}

// ── Messaging ────────────────────────────────────────────

export type Message =
  | { type: "CHECK_TEXT"; payload: CheckRequest }
  | { type: "GET_API_KEY" }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; payload: Partial<Settings> }
  | { type: "FETCH_MODELS" }
  | { type: "INITIATE_OAUTH" }
  | { type: "DISCONNECT" };

export type MessageResponse =
  | { success: true; data: CheckResult }
  | { success: true; data: { apiKey: string | null } }
  | { success: true; data: Settings }
  | { success: true; data: ModelInfo[] }
  | { success: true; data: null }
  | { success: false; error: string };
