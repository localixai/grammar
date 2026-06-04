const MAX_PUBLIC_ERROR_LENGTH = 500;

export function publicErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown error";
  const sanitized = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/\b(?:sk-or-v1-|sk-)[a-z0-9_-]{8,}\b/giu, "[credential redacted]")
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [credential redacted]")
    .trim()
    .slice(0, MAX_PUBLIC_ERROR_LENGTH);
  return sanitized || "Unknown error";
}
