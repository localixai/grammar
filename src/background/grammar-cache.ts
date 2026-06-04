import type { CheckRequest, CheckResult } from "../shared/types";

const DEFAULT_LIMIT = 50;
const DEFAULT_TTL_MS = 5 * 60 * 1_000;

interface CacheEntry {
  readonly result: CheckResult;
  readonly storedAt: number;
}

export class GrammarResultCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limit = DEFAULT_LIMIT,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  get(model: string, request: CheckRequest): CheckResult | undefined {
    const key = this.key(model, request);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.result;
  }

  set(model: string, request: CheckRequest, result: CheckResult): void {
    const key = this.key(model, request);
    this.entries.delete(key);
    this.entries.set(key, { result, storedAt: this.now() });
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== "string") break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  private key(model: string, request: CheckRequest): string {
    return `${model}\u0000${request.language ?? ""}\u0000${request.text}`;
  }
}
