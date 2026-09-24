export const PENDING_SELECTION_KEY = "pendingSelection";

export interface PendingSelection {
  readonly id: string;
  readonly text: string;
  readonly createdAt: number;
  readonly truncated: boolean;
}

export function isPendingSelection(value: unknown): value is PendingSelection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingSelection>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.truncated === "boolean"
  );
}
