import { describe, expect, test, vi } from "vitest";

import { validateOpenRouterApiKey } from "./openrouter-key";

describe("manual OpenRouter API key validation", () => {
  test("normalizes and verifies a regular inference key", async () => {
    const verify = vi.fn(() => Promise.resolve({ isManagementKey: false }));

    await expect(validateOpenRouterApiKey("  sk-or-v1-test-key  ", verify)).resolves.toBe(
      "sk-or-v1-test-key",
    );
    expect(verify).toHaveBeenCalledWith("sk-or-v1-test-key");
  });

  test("rejects malformed values without sending them to OpenRouter", async () => {
    const verify = vi.fn(() => Promise.resolve({ isManagementKey: false }));

    await expect(validateOpenRouterApiKey("short", verify)).rejects.toThrow("valid OpenRouter");
    await expect(validateOpenRouterApiKey("sk-test key", verify)).rejects.toThrow(
      "valid OpenRouter",
    );
    await expect(validateOpenRouterApiKey("x".repeat(8_193), verify)).rejects.toThrow(
      "valid OpenRouter",
    );
    expect(verify).not.toHaveBeenCalled();
  });

  test("rejects management keys that cannot be used for grammar requests", async () => {
    await expect(
      validateOpenRouterApiKey("sk-or-v1-management", () =>
        Promise.resolve({ isManagementKey: true }),
      ),
    ).rejects.toThrow("inference API key");
  });
});
