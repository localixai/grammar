import { getSettings, saveSettings } from "../shared/utils/storage";
import { DEFAULT_MODEL } from "../shared/types";
import type { Message, MessageResponse, ModelInfo } from "../shared/types";

// ── Messaging ──────────────────────────────────────────────────────

function sendMessage(msg: Message): Promise<MessageResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r: MessageResponse) => resolve(r));
  });
}

// ── Theme ──────────────────────────────────────────────────────────

function applyTheme(theme: string, btn: HTMLElement): void {
  document.documentElement.dataset["theme"] = theme;
  btn.textContent = theme === "dark" ? "☀︎" : "☾";
}

// ── Init ───────────────────────────────────────────────────────────

async function init(): Promise<void> {
  let settings = await getSettings();
  let loadedModels: ModelInfo[] = [];

  // DOM elements
  const notConnected = document.getElementById("notConnected")!;
  const connected = document.getElementById("connected")!;
  const modelSelectScreen = document.getElementById("modelSelectScreen")!;
  const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
  const connectError = document.getElementById("connectError")!;
  const disconnectBtn = document.getElementById("disconnectBtn")!;
  const enabledToggle = document.getElementById("enabled") as HTMLInputElement;
  const themeBtn = document.getElementById("themeBtn")!;

  const modelTriggerBtn = document.getElementById("modelTriggerBtn") as HTMLButtonElement;
  const currentModelName = document.getElementById("currentModelName")!;
  const modelBackBtn = document.getElementById("modelBackBtn")!;
  const modelSearchInput = document.getElementById("modelSearchInput") as HTMLInputElement;
  const modelList = document.getElementById("modelList")!;

  // ── Theme setup ──────────────────────────────────────────────

  const savedTheme = localStorage.getItem("localix-theme") ?? "dark";
  applyTheme(savedTheme, themeBtn);

  themeBtn.addEventListener("click", (): void => {
    const current = document.documentElement.dataset["theme"] ?? "dark";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("localix-theme", next);
    applyTheme(next, themeBtn);
  });

  // ── View rendering ──────────────────────────────────────────

  function render(hasKey: boolean): void {
    notConnected.classList.toggle("hidden", hasKey);
    connected.classList.toggle("hidden", !hasKey);
    modelSelectScreen.classList.add("hidden"); // back to settings screen on render change

    if (hasKey) {
      void loadModels(settings.model);
    }
  }

  // Pre-fill model name from settings
  updateCurrentModelLabel(settings.model);

  render(!!settings.apiKey);
  enabledToggle.checked = settings.enabled;

  // ── Screen navigation ────────────────────────────────────────

  modelTriggerBtn.addEventListener("click", (): void => {
    connected.classList.add("hidden");
    modelSelectScreen.classList.remove("hidden");
    modelSearchInput.value = "";
    filterAndRenderModels("");
    modelSearchInput.focus();
  });

  modelBackBtn.addEventListener("click", (): void => {
    modelSelectScreen.classList.add("hidden");
    connected.classList.remove("hidden");
  });

  // ── Search Input ────────────────────────────────────────────

  modelSearchInput.addEventListener("input", (): void => {
    filterAndRenderModels(modelSearchInput.value);
  });

  // ── Connect button ──────────────────────────────────────────

  const connectIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>`;

  connectBtn.addEventListener("click", (): void => {
    void (async (): Promise<void> => {
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting…";

      const res = await sendMessage({ type: "INITIATE_OAUTH" });
      if (res.success) {
        connectError.classList.add("hidden");
        settings = await getSettings();
        render(!!settings.apiKey);
      } else {
        connectError.textContent = res.error ?? "Connection failed. Please try again.";
        connectError.classList.remove("hidden");
      }

      connectBtn.disabled = false;
      connectBtn.innerHTML = `${connectIcon} Connect with OpenRouter`;
    })();
  });

  // ── Disconnect button ───────────────────────────────────────

  disconnectBtn.addEventListener("click", (): void => {
    void (async (): Promise<void> => {
      await sendMessage({ type: "DISCONNECT" });
      render(false);
    })();
  });

  // ── Toggle ──────────────────────────────────────────────────

  enabledToggle.addEventListener("change", (): void => {
    void saveSettings({ enabled: enabledToggle.checked });
  });

  // ── Model helpers ───────────────────────────────────────────

  function updateCurrentModelLabel(modelId: string): void {
    // Find the loaded model name if available, otherwise format the ID
    const found = loadedModels.find((m) => m.id === modelId);
    if (found) {
      currentModelName.textContent = found.name;
    } else {
      const name = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
      currentModelName.textContent = name;
    }
  }

  async function loadModels(currentModel: string): Promise<void> {
    modelList.innerHTML = "";
    const loadingEl = document.createElement("div");
    loadingEl.style.cssText = "padding:16px;text-align:center;color:var(--text-faint);";
    loadingEl.textContent = "Loading models…";
    modelList.appendChild(loadingEl);

    const response = await sendMessage({ type: "FETCH_MODELS" });

    if (response.success) {
      loadedModels = (response as { success: true; data: ModelInfo[] }).data;
    } else {
      loadedModels = [];
    }

    // Ensure currently selected model is at least in fallback list if not fetched
    if (loadedModels.length === 0) {
      loadedModels = [{ id: currentModel, name: currentModel.includes("/") ? currentModel.split("/").pop()! : currentModel }];
    }

    // Sort: default always is openai/gpt-5.4-mini, make sure it is at the very top if present
    loadedModels.sort((a, b) => {
      if (a.id === DEFAULT_MODEL) return -1;
      if (b.id === DEFAULT_MODEL) return 1;
      return 0; // maintain background sort order (by created timestamp descending)
    });

    updateCurrentModelLabel(settings.model);
    filterAndRenderModels("");
  }

  function filterAndRenderModels(query: string): void {
    modelList.innerHTML = "";
    const trimmed = query.trim().toLowerCase();
    const filtered = loadedModels.filter((m) =>
      m.name.toLowerCase().includes(trimmed) || m.id.toLowerCase().includes(trimmed)
    );

    if (filtered.length === 0) {
      const noResults = document.createElement("div");
      noResults.style.cssText = "padding:16px;text-align:center;color:var(--text-faint);";
      noResults.textContent = "No models found";
      modelList.appendChild(noResults);
      return;
    }

    for (const model of filtered) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "model-item";
      if (model.id === settings.model) {
        item.classList.add("selected");
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "model-item-name";
      nameSpan.textContent = model.name;

      const idSpan = document.createElement("span");
      idSpan.className = "model-item-id";
      idSpan.textContent = model.id;

      item.appendChild(nameSpan);
      item.appendChild(idSpan);

      item.addEventListener("click", (): void => {
        settings.model = model.id;
        void saveSettings({ model: model.id });
        updateCurrentModelLabel(model.id);
        modelSelectScreen.classList.add("hidden");
        connected.classList.remove("hidden");
      });

      modelList.appendChild(item);
    }
  }
}

void init();
