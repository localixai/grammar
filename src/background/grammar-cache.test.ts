import { describe, expect, test } from "vitest";

import type { CheckRequest, CheckResult } from "../shared/types";
import { GrammarResultCache } from "./grammar-cache";

const request: CheckRequest = { requestId: "request-1", text: "This are text.", language: "en" };
const result: CheckResult = {
  originalText: request.text,
  checkedAt: 1,
  errors: [],
};

describe("GrammarResultCache", () => {
  test("reuses an unchanged result without depending on the request id", () => {
    const cache = new GrammarResultCache();
    cache.set("vendor/model", request, result);

    expect(cache.get("vendor/model", { ...request, requestId: "request-2" })).toBe(result);
  });

  test("separates models, languages, and text", () => {
    const cache = new GrammarResultCache();
    cache.set("vendor/model", request, result);

    expect(cache.get("vendor/other", request)).toBeUndefined();
    expect(cache.get("vendor/model", { ...request, language: "ru" })).toBeUndefined();
    expect(cache.get("vendor/model", { ...request, text: "Changed text." })).toBeUndefined();
  });

  test("expires old results and evicts the least recently used entry", () => {
    let now = 0;
    const cache = new GrammarResultCache(() => now, 2, 100);
    cache.set("model", { ...request, text: "one" }, result);
    cache.set("model", { ...request, text: "two" }, result);
    expect(cache.get("model", { ...request, text: "one" })).toBe(result);
    cache.set("model", { ...request, text: "three" }, result);

    expect(cache.get("model", { ...request, text: "two" })).toBeUndefined();
    now = 100;
    expect(cache.get("model", { ...request, text: "one" })).toBeUndefined();
  });

  test("clears all transient text when credentials are disconnected", () => {
    const cache = new GrammarResultCache();
    cache.set("vendor/model", request, result);
    cache.clear();
    expect(cache.get("vendor/model", request)).toBeUndefined();
  });
});
