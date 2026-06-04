import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { apiKeysGetCurrentKeyMetadata } from "@openrouter/sdk/funcs/apiKeysGetCurrentKeyMetadata.js";

import { OPENROUTER_APP } from "../shared/utils/openrouter-app";

interface KeyMetadata {
  readonly isManagementKey: boolean;
}

export type OpenRouterKeyVerifier = (apiKey: string) => Promise<KeyMetadata>;

async function verifyWithOpenRouter(apiKey: string): Promise<KeyMetadata> {
  const client = new OpenRouterCore({
    apiKey,
    ...OPENROUTER_APP,
    retryConfig: { strategy: "none" },
    timeoutMs: 15_000,
  });
  const result = await apiKeysGetCurrentKeyMetadata(client);
  if (!result.ok) {
    throw new Error("OpenRouter could not verify this API key. Check it and try again.");
  }
  return { isManagementKey: result.value.data.isManagementKey };
}

export async function validateOpenRouterApiKey(
  value: string,
  verify: OpenRouterKeyVerifier = verifyWithOpenRouter,
): Promise<string> {
  const apiKey = value.trim();
  if (apiKey.length < 8 || apiKey.length > 8_192 || /[\s\u0000-\u001f\u007f]/u.test(apiKey)) {
    throw new Error("Enter a valid OpenRouter API key.");
  }

  const metadata = await verify(apiKey);
  if (metadata.isManagementKey) {
    throw new Error("Use an inference API key, not an OpenRouter management key.");
  }
  return apiKey;
}
