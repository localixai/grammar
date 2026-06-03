/**
 * OAuth callback page handler.
 *
 * This page is shown if the OAuth flow redirects here.
 * With chrome.identity.launchWebAuthFlow, the flow is handled
 * automatically, but this serves as a fallback display.
 */
function init(): void {
  const titleEl = document.getElementById("title")!;
  const messageEl = document.getElementById("message")!;

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (!code) {
    titleEl.textContent = "Authorization failed";
    messageEl.innerHTML = '<span class="error">No authorization code found. Please try again.</span>';
    return;
  }

  // The actual code exchange happens in the background service worker
  // via chrome.identity.launchWebAuthFlow. If we reach here, it means
  // the flow completed successfully.
  titleEl.textContent = "Connected!";
  messageEl.textContent = "You can close this tab and start using Localix Grammar.";
  setTimeout(() => window.close(), 2000);
}

init();
