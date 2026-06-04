import type { Preferences, Settings, SettingsView, ThemeMode } from "../types";

export const PREFERENCES_STORAGE_KEY = "preferences";
export const API_KEY_STORAGE_KEY = "openrouterApiKey";

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  model: "",
  enabled: true,
  autoCheck: true,
  checkDelayMs: 700,
  disabledSites: [],
  theme: "system",
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

function normalizeModel(value: unknown): string {
  if (typeof value !== "string") return "";
  const model = value.trim();
  return model.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(model) ? model : "";
}

function normalizeSite(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const site = value.trim().toLowerCase();
  return site &&
    site.length <= 253 &&
    !/[\s/?#@]/u.test(site) &&
    !/[\u0000-\u001f\u007f]/u.test(site)
    ? site
    : null;
}

function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_PREFERENCES };
  const stored = value as Partial<Preferences>;
  return {
    model: normalizeModel(stored.model),
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_PREFERENCES.enabled,
    autoCheck:
      typeof stored.autoCheck === "boolean" ? stored.autoCheck : DEFAULT_PREFERENCES.autoCheck,
    checkDelayMs:
      typeof stored.checkDelayMs === "number" && Number.isFinite(stored.checkDelayMs)
        ? Math.max(500, Math.min(5_000, Math.round(stored.checkDelayMs)))
        : DEFAULT_PREFERENCES.checkDelayMs,
    disabledSites: Array.isArray(stored.disabledSites)
      ? [
          ...new Set(
            stored.disabledSites.map(normalizeSite).filter((site): site is string => site !== null),
          ),
        ].slice(0, 500)
      : [],
    theme: isThemeMode(stored.theme) ? stored.theme : DEFAULT_PREFERENCES.theme,
  };
}

export async function getPreferences(): Promise<Preferences> {
  const result = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY);
  return normalizePreferences(result[PREFERENCES_STORAGE_KEY]);
}

export async function savePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const current = await getPreferences();
  const preferences = normalizePreferences({ ...current, ...patch });
  await chrome.storage.local.set({ [PREFERENCES_STORAGE_KEY]: preferences });
  return preferences;
}

export async function getApiKey(): Promise<string> {
  const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  const value = result[API_KEY_STORAGE_KEY];
  return typeof value === "string" && value.length > 0 && value.length <= 8_192 ? value : "";
}

export async function setApiKey(apiKey: string): Promise<void> {
  if (!apiKey || apiKey.length > 8_192) throw new Error("OpenRouter returned an invalid API key");
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey });
}

export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
}

export async function getSettings(): Promise<Settings> {
  const [preferences, apiKey] = await Promise.all([getPreferences(), getApiKey()]);
  return { ...preferences, apiKey };
}

export function toSettingsView(
  settings: Settings,
  hostname: string | null = null,
  includeDisabledSites = true,
): SettingsView {
  const { apiKey, ...preferences } = settings;
  return {
    ...preferences,
    disabledSites: includeDisabledSites ? preferences.disabledSites : [],
    connected: apiKey.length > 0,
    disabledHere: hostname !== null && preferences.disabledSites.includes(hostname),
  };
}
