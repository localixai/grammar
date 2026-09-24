import { checkGrammar } from "./grammar-service";
import { GrammarResultCache } from "./grammar-cache";
import { CredentialCoordinator } from "./credential-coordinator";
import { isMessage } from "./message-validator";
import { listModels } from "./models-service";
import { validateOpenRouterApiKey } from "./openrouter-key";
import { publicErrorMessage } from "./public-error";
import { isExtensionPage, scopedRequestId, topLevelHostname } from "./sender-context";
import { authorizeOpenRouter } from "../shared/utils/openrouter-auth";
import { PENDING_SELECTION_KEY } from "../shared/utils/pending-selection";
import {
  clearApiKey,
  getSettings,
  savePreferences,
  setApiKey,
  toSettingsView,
} from "../shared/utils/storage";
import type { Message, MessageResponse, Preferences, SettingsChangedEvent } from "../shared/types";
import { MAX_CHECK_TEXT_LENGTH } from "../shared/types";

const CHECK_SELECTION_MENU_ID = "localix-check-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CHECK_SELECTION_MENU_ID,
      title: "Correct selected text with Localix Grammar",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CHECK_SELECTION_MENU_ID || !info.selectionText?.trim()) return;
  void (async (): Promise<void> => {
    const popupOpened = chrome.action
      .openPopup(tab?.windowId === undefined ? undefined : { windowId: tab.windowId })
      .then(
        () => true,
        () => false,
      );
    await chrome.storage.session.set({
      [PENDING_SELECTION_KEY]: {
        id: crypto.randomUUID(),
        text: info.selectionText!.slice(0, MAX_CHECK_TEXT_LENGTH),
        createdAt: Date.now(),
        truncated: info.selectionText!.length > MAX_CHECK_TEXT_LENGTH,
      },
    });
    if (!(await popupOpened)) {
      await chrome.windows.create({
        url: chrome.runtime.getURL("src/popup/index.html"),
        type: "popup",
        width: 380,
        height: 530,
      });
    }
  })();
});

const activeChecks = new Map<string, AbortController>();
const grammarCache = new GrammarResultCache();
const credentials = new CredentialCoordinator(authorizeOpenRouter, setApiKey, clearApiKey);
let preferenceWriteQueue: Promise<void> = Promise.resolve();

let storageAccessError: Error | null = null;
const storageReady = chrome.storage.local
  .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  .catch(() => {
    storageAccessError = new Error("Localix Grammar could not secure extension storage.");
  });

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse: (response: MessageResponse) => void) => {
    if (!isMessage(message)) {
      sendResponse({ success: false, error: "Invalid Localix Grammar message." });
      return false;
    }
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ success: false, error: publicErrorMessage(error) });
      });
    return true;
  },
);

async function notifySettingsChanged(): Promise<void> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  const event: SettingsChangedEvent = { type: "SETTINGS_CHANGED" };
  await Promise.allSettled(
    tabs.flatMap((tab) => (tab.id === undefined ? [] : [chrome.tabs.sendMessage(tab.id, event)])),
  );
}

async function savePreferencesSerially(patch: Partial<Preferences>): Promise<void> {
  const operation = preferenceWriteQueue.then(async () => {
    await savePreferences(patch);
  });
  preferenceWriteQueue = operation.catch(() => undefined);
  await operation;
}

async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  await storageReady;
  if (storageAccessError) throw storageAccessError;
  if (
    (message.type === "SET_SETTINGS" ||
      message.type === "FETCH_MODELS" ||
      message.type === "INITIATE_OAUTH" ||
      message.type === "CONNECT_API_KEY" ||
      message.type === "DISCONNECT") &&
    !isExtensionPage(sender)
  ) {
    return { success: false, error: "This action is available only from the extension popup." };
  }

  switch (message.type) {
    case "CHECK_TEXT": {
      const hostname = topLevelHostname(sender);
      const extensionPage = isExtensionPage(sender);
      if (!hostname && !extensionPage) {
        return { success: false, error: "Grammar checks must originate from a website editor." };
      }
      const settings = await getSettings();
      if (!settings.apiKey) {
        return { success: false, error: "Connect OpenRouter from the Localix Grammar popup." };
      }
      if (!settings.model) {
        return { success: false, error: "Choose a model from the Localix Grammar popup." };
      }
      if (!extensionPage && !settings.enabled)
        return { success: false, error: "Localix Grammar is disabled." };
      if (!extensionPage && hostname && settings.disabledSites.includes(hostname)) {
        return { success: false, error: "Localix Grammar is disabled on this site." };
      }
      const cached = grammarCache.get(settings.model, message.payload);
      if (cached) return { success: true, data: cached };

      const requestId = scopedRequestId(sender, message.payload.requestId);
      if (!requestId) {
        return { success: false, error: "Grammar checks must originate from a website editor." };
      }
      activeChecks.get(requestId)?.abort();
      const controller = new AbortController();
      activeChecks.set(requestId, controller);
      try {
        const result = await checkGrammar(
          message.payload,
          settings.apiKey,
          settings.model,
          controller.signal,
        );
        grammarCache.set(settings.model, message.payload, result);
        return { success: true, data: result };
      } finally {
        if (activeChecks.get(requestId) === controller) {
          activeChecks.delete(requestId);
        }
      }
    }

    case "CANCEL_CHECK": {
      const requestId = scopedRequestId(sender, message.payload.requestId);
      if (requestId) activeChecks.get(requestId)?.abort();
      if (requestId) activeChecks.delete(requestId);
      return { success: true, data: null };
    }

    case "GET_SETTINGS":
      return {
        success: true,
        data: toSettingsView(
          await getSettings(),
          topLevelHostname(sender),
          isExtensionPage(sender),
        ),
      };

    case "SET_SETTINGS": {
      await savePreferencesSerially(message.payload);
      await notifySettingsChanged();
      return { success: true, data: null };
    }

    case "FETCH_MODELS":
      return { success: true, data: await listModels() };

    case "INITIATE_OAUTH":
      await credentials.connect();
      await notifySettingsChanged();
      return { success: true, data: null };

    case "CONNECT_API_KEY":
      await credentials.connectCredential(message.payload.apiKey, validateOpenRouterApiKey);
      grammarCache.clear();
      await notifySettingsChanged();
      return { success: true, data: null };

    case "DISCONNECT":
      await credentials.disconnect();
      grammarCache.clear();
      await notifySettingsChanged();
      return { success: true, data: null };
  }
}
