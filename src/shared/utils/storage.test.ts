import { beforeEach, describe, expect, test } from "vitest";

import type { Settings } from "../types";
import {
  API_KEY_STORAGE_KEY,
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  clearApiKey,
  getApiKey,
  getPreferences,
  getSettings,
  savePreferences,
  setApiKey,
  toSettingsView,
} from "./storage";

const values = new Map<string, unknown>();

beforeEach(() => {
  values.clear();
  const local = {
    get(key: string): Promise<Record<string, unknown>> {
      return Promise.resolve({ [key]: values.get(key) });
    },
    set(record: Record<string, unknown>): Promise<void> {
      for (const [key, value] of Object.entries(record)) values.set(key, value);
      return Promise.resolve();
    },
    remove(key: string): Promise<void> {
      values.delete(key);
      return Promise.resolve();
    },
  };
  globalThis.chrome = { storage: { local } } as unknown as typeof chrome;
});

describe("preference storage", () => {
  test("returns safe defaults when storage is empty", async () => {
    await expect(getPreferences()).resolves.toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.model).toBe("");
  });

  test("preserves an explicit empty model selection", async () => {
    values.set(PREFERENCES_STORAGE_KEY, { model: "   " });
    await expect(getPreferences()).resolves.toMatchObject({ model: "" });
  });

  test("normalizes untrusted values and deduplicates disabled sites", async () => {
    values.set(PREFERENCES_STORAGE_KEY, {
      model: "  test/model  ",
      enabled: false,
      autoCheck: false,
      checkDelayMs: 99_000,
      disabledSites: ["Example.com", "example.com", "not/a-host", "", 42],
      theme: "unknown",
    });
    await expect(getPreferences()).resolves.toEqual({
      model: "test/model",
      enabled: false,
      autoCheck: false,
      checkDelayMs: 5_000,
      disabledSites: ["example.com"],
      theme: "system",
    });
  });

  test("merges a patch through the same validation boundary", async () => {
    const saved = await savePreferences({ checkDelayMs: 100, theme: "light" });
    expect(saved.checkDelayMs).toBe(500);
    expect(saved.theme).toBe("light");
    expect(values.get(PREFERENCES_STORAGE_KEY)).toEqual(saved);
  });

  test("bounds model and hostname values recovered from storage", async () => {
    values.set(PREFERENCES_STORAGE_KEY, {
      model: "x".repeat(201),
      disabledSites: ["valid.example", "x".repeat(254), "bad host"],
    });
    const preferences = await getPreferences();
    expect(preferences.model).toBe(DEFAULT_PREFERENCES.model);
    expect(preferences.disabledSites).toEqual(["valid.example"]);
  });
});

describe("credential isolation", () => {
  test("stores and clears the key separately from preferences", async () => {
    await setApiKey("secret");
    expect(values.get(API_KEY_STORAGE_KEY)).toBe("secret");
    await expect(getApiKey()).resolves.toBe("secret");
    await clearApiKey();
    await expect(getApiKey()).resolves.toBe("");
  });

  test("rejects invalid credentials and ignores corrupted stored values", async () => {
    await expect(setApiKey("")).rejects.toThrow("invalid API key");
    await expect(setApiKey("x".repeat(8_193))).rejects.toThrow("invalid API key");
    values.set(API_KEY_STORAGE_KEY, "x".repeat(8_193));
    await expect(getApiKey()).resolves.toBe("");
  });

  test("never exposes the API key through SettingsView", () => {
    const settings: Settings = { ...DEFAULT_PREFERENCES, apiKey: "secret" };
    const view = toSettingsView(settings);
    expect(view.connected).toBe(true);
    expect(view.disabledHere).toBe(false);
    expect(view).not.toHaveProperty("apiKey");
  });

  test("derives current-site state without exposing the hostname as stored history", () => {
    const settings: Settings = {
      ...DEFAULT_PREFERENCES,
      apiKey: "",
      disabledSites: ["example.com"],
    };
    expect(toSettingsView(settings, "example.com").disabledHere).toBe(true);
    expect(toSettingsView(settings, "other.example").disabledHere).toBe(false);
  });

  test("can redact the disabled-site list for untrusted content contexts", () => {
    const settings: Settings = {
      ...DEFAULT_PREFERENCES,
      apiKey: "secret",
      disabledSites: ["private.example"],
    };

    expect(toSettingsView(settings, "private.example", false)).toMatchObject({
      connected: true,
      disabledHere: true,
      disabledSites: [],
    });
  });

  test("joins preferences and credentials only inside the background layer", async () => {
    await setApiKey("secret");
    const settings = await getSettings();
    expect(settings.apiKey).toBe("secret");
    expect(settings.model).toBe(DEFAULT_PREFERENCES.model);
  });
});
