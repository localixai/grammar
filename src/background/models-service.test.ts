import { describe, expect, test, vi } from "vitest";

import {
  createModelCatalogService,
  normalizeModelCatalog,
  type CatalogModel,
  type ModelCatalogLoader,
} from "./models-service";

function catalogModel(
  id: string,
  overrides: {
    name?: string;
    prompt?: string;
    completion?: string;
    discount?: number;
    parameters?: string[];
    created?: number;
  } = {},
): CatalogModel {
  return {
    id,
    name: overrides.name ?? id,
    ...(overrides.created === undefined ? {} : { created: overrides.created }),
    contextLength: 128_000,
    pricing: {
      prompt: overrides.prompt ?? "0.000001",
      completion: overrides.completion ?? "0.000002",
      ...(overrides.discount === undefined ? {} : { discount: overrides.discount }),
    },
    supportedParameters: overrides.parameters ?? ["tools"],
  };
}

describe("official OpenRouter model catalog", () => {
  test("keeps tool-capable models, converts pricing, deduplicates, and sorts by name", () => {
    const models = normalizeModelCatalog([
      catalogModel("vendor/zeta", { name: "Zeta", prompt: "0.0000005" }),
      catalogModel("vendor/alpha", { name: "Alpha", discount: 0.25 }),
      catalogModel("vendor/no-tools", { parameters: ["temperature"] }),
      catalogModel("vendor/zeta", { name: "Duplicate" }),
      catalogModel("bad\u0000id"),
    ]);

    expect(models).toEqual([
      {
        id: "vendor/alpha",
        name: "Alpha",
        contextWindow: 128_000,
        inputCostPerMillion: 0.75,
        outputCostPerMillion: 1.5,
      },
      {
        id: "vendor/zeta",
        name: "Zeta",
        contextWindow: 128_000,
        inputCostPerMillion: 0.5,
        outputCostPerMillion: 2,
      },
    ]);
  });

  test("bounds malformed catalog metadata and omits invalid prices", () => {
    const models = normalizeModelCatalog([
      catalogModel("vendor/unpriced", {
        name: "Unpriced",
        prompt: "not-a-price",
        completion: "-1",
      }),
      catalogModel("vendor/free", {
        name: "Free",
        prompt: "0.000001",
        completion: "0.000002",
        discount: 2,
      }),
      catalogModel("", { name: "Empty id" }),
      catalogModel("vendor/empty-name", { name: "" }),
      catalogModel(`vendor/${"x".repeat(201)}`),
      catalogModel("vendor/control-name", { name: "Bad\u007fname" }),
    ]);

    expect(models).toEqual([
      {
        id: "vendor/free",
        name: "Free",
        contextWindow: 128_000,
        inputCostPerMillion: 0,
        outputCostPerMillion: 0,
      },
      {
        id: "vendor/unpriced",
        name: "Unpriced",
        contextWindow: 128_000,
      },
    ]);
  });

  test("passes through valid model creation timestamps for popup sorting", () => {
    const models = normalizeModelCatalog([
      catalogModel("vendor/new", { created: 1_750_000_000 }),
      catalogModel("vendor/unknown", { created: 0 }),
    ]);
    expect(models.find((model) => model.id === "vendor/new")?.createdAt).toBe(1_750_000_000);
    expect(models.find((model) => model.id === "vendor/unknown")?.createdAt).toBeUndefined();
  });

  test("bounds an unexpectedly oversized catalog response", () => {
    const catalog = Array.from({ length: 1_001 }, (_, index) =>
      catalogModel(`vendor/model-${index}`),
    );
    const models = normalizeModelCatalog(catalog);
    expect(models).toHaveLength(1_000);
    expect(models.some((model) => model.id === "vendor/model-1000")).toBe(false);
  });

  test("caches defensive copies and refreshes after the TTL", async () => {
    let now = 1_000;
    const loader = vi
      .fn<ModelCatalogLoader>()
      .mockResolvedValueOnce([catalogModel("vendor/base")])
      .mockResolvedValueOnce([catalogModel("vendor/base"), catalogModel("vendor/new")]);
    const list = createModelCatalogService(loader, () => now);

    const first = await list();
    first.splice(0, 1);
    expect(await list()).toHaveLength(1);
    expect(loader).toHaveBeenCalledOnce();

    now += 15 * 60 * 1_000;
    expect(await list()).toHaveLength(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("uses a stale successful catalog if a refresh temporarily fails", async () => {
    let now = 0;
    const loader = vi
      .fn<ModelCatalogLoader>()
      .mockResolvedValueOnce([catalogModel("vendor/base")])
      .mockRejectedValueOnce(new Error("offline"));
    const list = createModelCatalogService(loader, () => now);

    await expect(list()).resolves.toHaveLength(1);
    now += 15 * 60 * 1_000;
    await expect(list()).resolves.toHaveLength(1);
  });

  test("fails closed when no valid catalog has ever loaded", async () => {
    const list = createModelCatalogService(() => Promise.resolve([]));
    await expect(list()).rejects.toThrow("no tool-capable models");
  });
});
