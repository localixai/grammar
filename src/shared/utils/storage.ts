import type { Settings } from "../types";
import { DEFAULT_MODEL } from "../types";

const DEFAULTS: Settings = {
  apiKey: "",
  model: DEFAULT_MODEL,
  enabled: true,
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get("settings");
  const stored = result["settings"] as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({ settings: { ...current, ...patch } });
}
