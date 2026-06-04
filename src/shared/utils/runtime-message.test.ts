import { describe, expect, test, vi } from "vitest";

import type { MessageResponse } from "../types";
import { sendRuntimeMessage, type RuntimeMessageTransport } from "./runtime-message";

function transport(): RuntimeMessageTransport & {
  respond(response?: MessageResponse): void;
  setError(message?: string): void;
} {
  let callback: ((response: MessageResponse | undefined) => void) | undefined;
  let error: string | undefined;
  return {
    send(_message, next): void {
      callback = next;
    },
    lastError: () => error,
    respond(response): void {
      callback?.(response);
    },
    setError(message): void {
      error = message;
    },
  };
}

describe("bounded runtime messages", () => {
  test("returns the response and clears its deadline", async () => {
    vi.useFakeTimers();
    const runtime = transport();
    const pending = sendRuntimeMessage({ type: "GET_SETTINGS" }, 1_000, "Timed out", runtime);
    runtime.respond({ success: true, data: null });

    await expect(pending).resolves.toEqual({ success: true, data: null });
    await vi.advanceTimersByTimeAsync(1_000);
    vi.useRealTimers();
  });

  test("fails closed when Chrome reports an error", async () => {
    const runtime = transport();
    const pending = sendRuntimeMessage({ type: "GET_SETTINGS" }, 1_000, "Timed out", runtime);
    runtime.setError("Extension context invalidated.");
    runtime.respond();

    await expect(pending).resolves.toEqual({
      success: false,
      error: "Extension context invalidated.",
    });
  });

  test("resolves at the deadline and ignores a late callback", async () => {
    vi.useFakeTimers();
    const runtime = transport();
    const pending = sendRuntimeMessage(
      { type: "GET_SETTINGS" },
      1_000,
      "Localix timed out.",
      runtime,
    );
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual({ success: false, error: "Localix timed out." });
    runtime.respond({ success: true, data: null });
    vi.useRealTimers();
  });
});
