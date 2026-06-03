import type { ModelInfo } from "../shared/types";

interface OpenRouterModel {
  id: string;
  name: string;
  created?: number;
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

// Cache models for 10 minutes to avoid repeated API calls
let cachedModels: ModelInfo[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Fetch available models from the OpenRouter /api/v1/models endpoint.
 * Results are cached for 10 minutes.
 */
export async function fetchModels(apiKey?: string): Promise<ModelInfo[]> {
  const now = Date.now();
  if (cachedModels && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://localix.ai",
      "X-Title": "Localix Grammar",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", { headers });

    if (!res.ok) {
      throw new Error(`Failed to fetch models: HTTP ${res.status}`);
    }

    const json = (await res.json()) as OpenRouterModelsResponse;

    const models: ModelInfo[] = json.data
      .filter((m) => m.id && m.name)
      .map((m) => ({ id: m.id, name: m.name, created: m.created }))
      .sort((a, b) => {
        const timeA = a.created ?? 0;
        const timeB = b.created ?? 0;
        if (timeB !== timeA) {
          return timeB - timeA; // Newest first
        }
        return a.name.localeCompare(b.name);
      });

    cachedModels = models;
    cacheTimestamp = now;
    return models;
  } catch {
    // On error, return empty list — the popup will show the current model as fallback
    return cachedModels ?? [];
  }
}
