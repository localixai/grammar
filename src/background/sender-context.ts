export function topLevelHostname(sender: chrome.runtime.MessageSender): string | null {
  const tabUrl = sender.tab?.url;
  if (!tabUrl) return null;
  try {
    const url = new URL(tabUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.id || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === "chrome-extension:" && url.hostname === sender.id;
  } catch {
    return false;
  }
}

export function scopedRequestId(
  sender: chrome.runtime.MessageSender,
  requestId: string,
): string | null {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    return isExtensionPage(sender) ? `extension:${sender.url}:${requestId}` : null;
  }
  const frameId = sender.frameId ?? 0;
  const documentId = sender.documentId ?? "";
  return `${tabId}:${frameId}:${documentId}:${requestId}`;
}
