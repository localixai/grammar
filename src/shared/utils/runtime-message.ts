import type { Message, MessageResponse } from "../types";

export interface RuntimeMessageTransport {
  send(
    message: Message,
    callback: (response: MessageResponse | undefined) => void,
  ): void | Promise<unknown>;
  lastError(): string | undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function chromeTransport(): RuntimeMessageTransport {
  return {
    send(message, callback): void {
      chrome.runtime.sendMessage(message, callback);
    },
    lastError(): string | undefined {
      return chrome.runtime.lastError?.message;
    },
  };
}

export function sendRuntimeMessage(
  message: Message,
  timeoutMs: number,
  timeoutError: string,
  transport: RuntimeMessageTransport = chromeTransport(),
): Promise<MessageResponse> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response: MessageResponse): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(response);
    };
    const timer = window.setTimeout(() => {
      finish({ success: false, error: timeoutError });
    }, timeoutMs);

    try {
      const pending = transport.send(message, (response) => {
        try {
          const runtimeError = transport.lastError();
          if (settled) return;
          if (runtimeError) {
            finish({ success: false, error: runtimeError });
          } else {
            finish(response ?? { success: false, error: "No response from Localix Grammar." });
          }
        } catch (error) {
          finish({ success: false, error: errorMessage(error) });
        }
      });
      if (pending && typeof pending.then === "function") {
        void pending.then(undefined, (error: unknown) => {
          finish({ success: false, error: errorMessage(error) });
        });
      }
    } catch (error) {
      finish({ success: false, error: errorMessage(error) });
    }
  });
}
