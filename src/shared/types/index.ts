export const ERROR_TYPES = ["grammar", "spelling", "punctuation", "style"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export interface GrammarError {
  readonly id: string;
  readonly offset: number;
  readonly length: number;
  readonly original: string;
  readonly message: string;
  readonly shortMessage: string;
  readonly replacements: readonly string[];
  readonly type: ErrorType;
  readonly confidence: "high" | "medium";
}

export interface CheckResult {
  readonly errors: readonly GrammarError[];
  readonly originalText: string;
  readonly checkedAt: number;
}

export const MAX_CHECK_TEXT_LENGTH = 20_000;

export interface CheckRequest {
  readonly requestId: string;
  readonly text: string;
  readonly language?: string;
}

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly contextWindow?: number;
  readonly inputCostPerMillion?: number;
  readonly outputCostPerMillion?: number;
}

export type ThemeMode = "dark" | "light" | "system";

export interface Preferences {
  model: string;
  enabled: boolean;
  autoCheck: boolean;
  checkDelayMs: number;
  disabledSites: string[];
  theme: ThemeMode;
}

export interface Settings extends Preferences {
  apiKey: string;
}

export interface SettingsView extends Preferences {
  connected: boolean;
  disabledHere: boolean;
}

export type Message =
  | { type: "CHECK_TEXT"; payload: CheckRequest }
  | { type: "CANCEL_CHECK"; payload: { requestId: string } }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; payload: Partial<Preferences> }
  | { type: "FETCH_MODELS" }
  | { type: "INITIATE_OAUTH" }
  | { type: "CONNECT_API_KEY"; payload: { apiKey: string } }
  | { type: "DISCONNECT" };

export interface SettingsChangedEvent {
  readonly type: "SETTINGS_CHANGED";
}

export type MessageResponse =
  | { success: true; data: CheckResult }
  | { success: true; data: SettingsView }
  | { success: true; data: ModelInfo[] }
  | { success: true; data: null }
  | { success: false; error: string };

export function isSuccessResponse<T>(
  response: MessageResponse,
): response is Extract<MessageResponse, { success: true }> & { data: T } {
  return response.success;
}
