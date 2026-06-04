import { MAX_CHECK_TEXT_LENGTH, type Message, type Preferences } from "../shared/types";

const MESSAGE_TYPES_WITHOUT_PAYLOAD = new Set([
  "GET_SETTINGS",
  "FETCH_MODELS",
  "INITIATE_OAUTH",
  "DISCONNECT",
]);
const PREFERENCE_KEYS = new Set<keyof Preferences>([
  "model",
  "enabled",
  "autoCheck",
  "checkDelayMs",
  "disabledSites",
  "theme",
]);
const CHECK_REQUEST_KEYS = new Set(["requestId", "text", "language"]);
const CANCEL_REQUEST_KEYS = new Set(["requestId"]);
const API_KEY_REQUEST_KEYS = new Set(["apiKey"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,128}$/iu.test(value);
}

function isPreferencesPatch(value: unknown): value is Partial<Preferences> {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !PREFERENCE_KEYS.has(key as keyof Preferences))) {
    return false;
  }
  if ("model" in value && (typeof value["model"] !== "string" || value["model"].length > 200)) {
    return false;
  }
  for (const key of ["enabled", "autoCheck"] as const) {
    if (key in value && typeof value[key] !== "boolean") return false;
  }
  if (
    "checkDelayMs" in value &&
    (typeof value["checkDelayMs"] !== "number" || !Number.isFinite(value["checkDelayMs"]))
  ) {
    return false;
  }
  if (
    "disabledSites" in value &&
    (!Array.isArray(value["disabledSites"]) ||
      value["disabledSites"].length > 500 ||
      value["disabledSites"].some(
        (site) => typeof site !== "string" || site.length === 0 || site.length > 253,
      ))
  ) {
    return false;
  }
  return (
    !("theme" in value) ||
    value["theme"] === "dark" ||
    value["theme"] === "light" ||
    value["theme"] === "system"
  );
}

export function isMessage(value: unknown): value is Message {
  if (!isRecord(value) || typeof value["type"] !== "string") return false;
  const type = value["type"];
  if (MESSAGE_TYPES_WITHOUT_PAYLOAD.has(type)) {
    return Object.keys(value).length === 1;
  }
  if (Object.keys(value).some((key) => key !== "type" && key !== "payload")) return false;
  const payload = value["payload"];
  if (!isRecord(payload)) return false;

  if (type === "CHECK_TEXT") {
    return (
      hasOnlyKeys(payload, CHECK_REQUEST_KEYS) &&
      isRequestId(payload["requestId"]) &&
      typeof payload["text"] === "string" &&
      payload["text"].length <= MAX_CHECK_TEXT_LENGTH &&
      (!("language" in payload) ||
        (typeof payload["language"] === "string" && payload["language"].length <= 35))
    );
  }
  if (type === "CANCEL_CHECK") {
    return hasOnlyKeys(payload, CANCEL_REQUEST_KEYS) && isRequestId(payload["requestId"]);
  }
  if (type === "CONNECT_API_KEY") {
    return (
      hasOnlyKeys(payload, API_KEY_REQUEST_KEYS) &&
      typeof payload["apiKey"] === "string" &&
      payload["apiKey"].length > 0 &&
      payload["apiKey"].length <= 8_192 &&
      !/[\u0000-\u001f\u007f]/u.test(payload["apiKey"])
    );
  }
  if (type === "SET_SETTINGS") return isPreferencesPatch(payload);
  return false;
}
