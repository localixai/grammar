import { checkGrammar } from "./grammar-service";
import { getSettings, saveSettings } from "../shared/utils/storage";
import { initiateOAuth } from "../shared/utils/openrouter-auth";
import { fetchModels } from "./models-service";
import type { Message, MessageResponse } from "../shared/types";

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: MessageResponse) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : "Unknown error";
        sendResponse({ success: false, error });
      });
    return true; // keep channel open for async response
  },
);

async function handleMessage(message: Message): Promise<MessageResponse> {
  switch (message.type) {
    case "CHECK_TEXT": {
      const settings = await getSettings();
      if (!settings.apiKey) {
        return { success: false, error: "Not connected. Click the extension icon to connect." };
      }
      if (!settings.enabled) {
        return { success: false, error: "Extension is disabled." };
      }
      const result = await checkGrammar(message.payload, settings.apiKey, settings.model);
      return { success: true, data: result };
    }

    case "GET_API_KEY": {
      const { apiKey } = await getSettings();
      return { success: true, data: { apiKey: apiKey || null } };
    }

    case "GET_SETTINGS": {
      const settings = await getSettings();
      return { success: true, data: settings };
    }

    case "SET_SETTINGS": {
      await saveSettings(message.payload);
      return { success: true, data: null };
    }

    case "FETCH_MODELS": {
      const settings = await getSettings();
      const models = await fetchModels(settings.apiKey || undefined);
      return { success: true, data: models };
    }

    case "INITIATE_OAUTH": {
      await initiateOAuth();
      return { success: true, data: null };
    }

    case "DISCONNECT": {
      await saveSettings({ apiKey: "" });
      return { success: true, data: null };
    }
  }
}
