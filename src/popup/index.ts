import type {
  Message,
  MessageResponse,
  ModelInfo,
  Preferences,
  SettingsView,
  ThemeMode,
} from "../shared/types";

const THEME_ICON: Record<ThemeMode, string> = {
  dark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.7 12.7A6.5 6.5 0 0 1 7.3 4.3 6.5 6.5 0 1 0 15.7 12.7Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  light:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.3 4.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  system:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 17h6m-3-2.5V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing popup element #${id}`);
  return value as T;
}

function sendMessage(message: Message): Promise<MessageResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse | undefined) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message ?? "Localix Grammar is unavailable.",
        });
      } else {
        resolve(response ?? { success: false, error: "No response from Localix Grammar." });
      }
    });
  });
}

function isSettingsView(value: unknown): value is SettingsView {
  return (
    !!value &&
    typeof value === "object" &&
    "connected" in value &&
    typeof (value as { connected?: unknown }).connected === "boolean" &&
    "disabledHere" in value &&
    typeof (value as { disabledHere?: unknown }).disabledHere === "boolean"
  );
}

function nextTheme(theme: ThemeMode): ThemeMode {
  if (theme === "dark") return "light";
  if (theme === "light") return "system";
  return "dark";
}

function resolveTheme(theme: ThemeMode): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

async function activeHostname(): Promise<string | null> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return null;
  }
  const url = tabs[0]?.url;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

const loadingView = element("loadingView");
const connectView = element("connectView");
const settingsView = element("settingsView");
const modelsView = element("modelsView");
const connectButton = element<HTMLButtonElement>("connectButton");
const tokenToggleButton = element<HTMLButtonElement>("tokenToggleButton");
const tokenPanel = element<HTMLFormElement>("tokenPanel");
const apiKeyInput = element<HTMLInputElement>("apiKeyInput");
const tokenVisibilityButton = element<HTMLButtonElement>("tokenVisibilityButton");
const connectTokenButton = element<HTMLButtonElement>("connectTokenButton");
const connectError = element("connectError");
const disconnectButton = element<HTMLButtonElement>("disconnectButton");
const enabledToggle = element<HTMLInputElement>("enabledToggle");
const autoCheckToggle = element<HTMLInputElement>("autoCheckToggle");
const siteSetting = element("siteSetting");
const siteToggle = element<HTMLInputElement>("siteToggle");
const siteTitle = element("siteTitle");
const siteSubtitle = element("siteSubtitle");
const themeButton = element<HTMLButtonElement>("themeButton");
const modelButton = element<HTMLButtonElement>("modelButton");
const modelName = element("modelName");
const modelId = element("modelId");
const modelsBackButton = element<HTMLButtonElement>("modelsBackButton");
const modelSearch = element<HTMLInputElement>("modelSearch");
const modelList = element("modelList");
const popupAlert = element("popupAlert");

let settings: SettingsView | null = null;
let hostname: string | null = null;
let models: ModelInfo[] = [];
let alertTimer: number | undefined;

function show(view: HTMLElement): void {
  for (const candidate of [loadingView, connectView, settingsView, modelsView]) {
    candidate.classList.toggle("hidden", candidate !== view);
  }
}

function showAlert(message: string): void {
  window.clearTimeout(alertTimer);
  popupAlert.textContent = message;
  popupAlert.classList.remove("hidden");
  alertTimer = window.setTimeout(() => popupAlert.classList.add("hidden"), 6_000);
}

function clearAlert(): void {
  window.clearTimeout(alertTimer);
  popupAlert.classList.add("hidden");
  popupAlert.textContent = "";
}

function showConnectError(message: string): void {
  connectError.textContent = message;
  connectError.classList.remove("hidden");
}

function clearConnectError(): void {
  connectError.textContent = "";
  connectError.classList.add("hidden");
}

function setConnectBusy(busy: boolean): void {
  connectButton.disabled = busy;
  tokenToggleButton.disabled = busy;
  apiKeyInput.disabled = busy;
  tokenVisibilityButton.disabled = busy;
  connectTokenButton.disabled = busy;
}

function resetConnectionForm(): void {
  setConnectBusy(false);
  connectButton.textContent = "Continue with OpenRouter";
  connectTokenButton.textContent = "Connect with API key";
  apiKeyInput.value = "";
  apiKeyInput.type = "password";
  tokenVisibilityButton.textContent = "Show";
  tokenVisibilityButton.setAttribute("aria-label", "Show API key");
  tokenPanel.classList.add("hidden");
  tokenToggleButton.setAttribute("aria-expanded", "false");
  clearConnectError();
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset["theme"] = resolveTheme(theme);
  themeButton.innerHTML = THEME_ICON[theme];
  const next = nextTheme(theme);
  themeButton.setAttribute("aria-label", `Theme: ${theme}. Switch to ${next}.`);
  themeButton.title = `Theme: ${theme}`;
}

function modelLabel(id: string): string {
  return models.find((model) => model.id === id)?.name ?? id.split("/").pop() ?? id;
}

function renderSelectedModel(): void {
  if (!settings) return;
  if (!settings.model) {
    modelName.textContent = "Choose a model";
    modelId.textContent = "Required before checking";
    return;
  }
  modelName.textContent = modelLabel(settings.model);
  modelId.textContent = settings.model;
}

function modelCost(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "$0";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`;
}

function renderSettings(): void {
  if (!settings) return;
  applyTheme(settings.theme);
  enabledToggle.checked = settings.enabled;
  autoCheckToggle.checked = settings.autoCheck;
  renderSelectedModel();
  siteSetting.classList.toggle("hidden", hostname === null);
  if (hostname) {
    siteTitle.textContent = hostname;
    siteSubtitle.textContent = settings.disabledSites.includes(hostname)
      ? "Grammar is paused here"
      : "Use Grammar on this site";
    siteToggle.checked = !settings.disabledSites.includes(hostname);
  }
  show(settings.connected ? settingsView : connectView);
}

async function updatePreferences(patch: Partial<Preferences>): Promise<boolean> {
  const response = await sendMessage({ type: "SET_SETTINGS", payload: patch });
  if (!response.success) {
    showAlert(`Could not save this setting: ${response.error}`);
    return false;
  }
  clearAlert();
  if (settings) settings = { ...settings, ...patch };
  return true;
}

async function loadModels(): Promise<void> {
  const response = await sendMessage({ type: "FETCH_MODELS" });
  models = response.success && Array.isArray(response.data) ? response.data : [];
  if (!response.success) showAlert(`Could not load the model catalog: ${response.error}`);
  renderSelectedModel();
}

function renderModels(query = ""): void {
  modelList.replaceChildren();
  if (!settings) return;
  const normalized = query.trim().toLowerCase();
  const filtered = models.filter(
    (model) =>
      !normalized ||
      model.name.toLowerCase().includes(normalized) ||
      model.id.toLowerCase().includes(normalized),
  );
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-models";
    empty.textContent = "No models found";
    modelList.appendChild(empty);
    return;
  }

  for (const model of filtered) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "model-item";
    if (model.id === settings.model) item.setAttribute("aria-current", "true");
    const name = document.createElement("strong");
    name.textContent = model.name;
    const id = document.createElement("small");
    id.textContent = model.id;
    const cost = document.createElement("span");
    cost.className = "model-cost";
    cost.textContent = `${modelCost(model.inputCostPerMillion)} in · ${modelCost(
      model.outputCostPerMillion,
    )} out / 1M`;
    item.append(name, id, cost);
    item.addEventListener("click", () => {
      void (async (): Promise<void> => {
        if (!(await updatePreferences({ model: model.id })) || !settings) return;
        renderSettings();
        modelButton.focus();
      })();
    });
    modelList.appendChild(item);
  }
}

themeButton.addEventListener("click", () => {
  if (!settings) return;
  const theme = nextTheme(settings.theme);
  void (async (): Promise<void> => {
    themeButton.disabled = true;
    const saved = await updatePreferences({ theme });
    themeButton.disabled = false;
    if (saved) applyTheme(theme);
  })();
});

connectButton.addEventListener("click", () => {
  void (async (): Promise<void> => {
    setConnectBusy(true);
    connectButton.textContent = "Connecting…";
    clearConnectError();
    const response = await sendMessage({ type: "INITIATE_OAUTH" });
    setConnectBusy(false);
    connectButton.textContent = "Continue with OpenRouter";
    if (!response.success) {
      showConnectError(response.error);
      return;
    }
    apiKeyInput.value = "";
    await initialize();
  })();
});

tokenToggleButton.addEventListener("click", () => {
  const expanded = tokenToggleButton.getAttribute("aria-expanded") === "true";
  tokenToggleButton.setAttribute("aria-expanded", String(!expanded));
  tokenPanel.classList.toggle("hidden", expanded);
  clearConnectError();
  if (!expanded) apiKeyInput.focus();
});

tokenVisibilityButton.addEventListener("click", () => {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  tokenVisibilityButton.textContent = reveal ? "Hide" : "Show";
  tokenVisibilityButton.setAttribute("aria-label", `${reveal ? "Hide" : "Show"} API key`);
  apiKeyInput.focus();
});

tokenPanel.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async (): Promise<void> => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey.length < 8) {
      showConnectError("Enter a valid OpenRouter API key.");
      apiKeyInput.focus();
      return;
    }

    setConnectBusy(true);
    connectTokenButton.textContent = "Verifying…";
    clearConnectError();
    const response = await sendMessage({ type: "CONNECT_API_KEY", payload: { apiKey } });
    setConnectBusy(false);
    connectTokenButton.textContent = "Connect with API key";
    if (!response.success) {
      showConnectError(response.error);
      apiKeyInput.focus();
      return;
    }
    apiKeyInput.value = "";
    await initialize();
  })();
});

disconnectButton.addEventListener("click", () => {
  void (async (): Promise<void> => {
    disconnectButton.disabled = true;
    const response = await sendMessage({ type: "DISCONNECT" });
    disconnectButton.disabled = false;
    if (response.success && settings) {
      clearAlert();
      settings = { ...settings, connected: false };
      resetConnectionForm();
      renderSettings();
    } else if (!response.success) {
      showAlert(`Could not disconnect: ${response.error}`);
    }
  })();
});

enabledToggle.addEventListener("change", () => {
  void (async (): Promise<void> => {
    enabledToggle.disabled = true;
    const saved = await updatePreferences({ enabled: enabledToggle.checked });
    enabledToggle.disabled = false;
    if (!saved) renderSettings();
  })();
});

autoCheckToggle.addEventListener("change", () => {
  void (async (): Promise<void> => {
    autoCheckToggle.disabled = true;
    const saved = await updatePreferences({ autoCheck: autoCheckToggle.checked });
    autoCheckToggle.disabled = false;
    if (!saved) renderSettings();
  })();
});

siteToggle.addEventListener("change", () => {
  if (!hostname || !settings) return;
  const sites = new Set(settings.disabledSites);
  if (siteToggle.checked) sites.delete(hostname);
  else sites.add(hostname);
  const disabledSites = [...sites].sort();
  void (async (): Promise<void> => {
    siteToggle.disabled = true;
    const saved = await updatePreferences({ disabledSites });
    siteToggle.disabled = false;
    renderSettings();
    if (!saved) siteToggle.focus();
  })();
});

modelButton.addEventListener("click", () => {
  modelSearch.value = "";
  renderModels();
  show(modelsView);
  modelSearch.focus();
});

function closeModels(): void {
  renderSettings();
  modelButton.focus();
}

modelsBackButton.addEventListener("click", closeModels);
modelSearch.addEventListener("input", () => renderModels(modelSearch.value));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modelsView.classList.contains("hidden")) {
    event.preventDefault();
    closeModels();
  }
});

window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (settings?.theme === "system") applyTheme("system");
});

async function initialize(): Promise<void> {
  show(loadingView);
  const [settingsResponse, activeSite] = await Promise.all([
    sendMessage({ type: "GET_SETTINGS" }),
    activeHostname(),
  ]);
  hostname = activeSite;
  if (!settingsResponse.success || !isSettingsView(settingsResponse.data)) {
    connectError.textContent = settingsResponse.success
      ? "Invalid settings response."
      : settingsResponse.error;
    connectError.classList.remove("hidden");
    show(connectView);
    return;
  }
  settings = settingsResponse.data;
  applyTheme(settings.theme);
  if (settings.connected) await loadModels();
  renderSettings();
}

void initialize();
