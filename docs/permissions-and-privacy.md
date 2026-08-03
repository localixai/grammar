# Permissions and privacy rationale

## Single purpose

Localix Grammar has one purpose: review and correct writing in supported web editors using a model
selected through the user's OpenRouter account.

## Manifest permissions

| Permission                    | Why it is required                                                          | Data exposed                                         |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `storage`                     | Stores preferences and the OAuth-issued or manually supplied OpenRouter key | Extension-owned settings and credential              |
| `identity`                    | Runs OpenRouter PKCE through `chrome.identity.launchWebAuthFlow`            | OAuth callback code                                  |
| `https://openrouter.ai/*`     | Lets the service worker call the selected OpenRouter model                  | Text submitted for a check and OpenRouter credential |
| HTTP(S) content-script access | Shows the writing UI in supported editors across websites and frames        | Text in an eligible active editor when a check runs  |

The extension does **not** request `tabs`, browsing history, cookies, clipboard, downloads,
notifications, geolocation, or background page access.

The extension-page Content Security Policy allows scripts, styles, fonts, and images only from the
packaged extension and narrows outbound `connect-src` to `https://openrouter.ai`. The build
validator rejects a broader policy.

Content-script access is broad because the product works in editors across websites and frames.
Background network host access is separately restricted to `https://openrouter.ai/*`. Runtime
field policy narrows actual processing to supported prose editors and excludes sensitive,
read-only, and opted-out controls. Focusing alone does not submit text: automatic checks require a
trusted user input event, and script-generated input or trigger clicks are ignored. Chrome-internal
pages, extension pages, and local `file://` documents are not matched.

## Data-flow boundaries

```text
eligible editor
  └─ text + language ─► isolated content script
       └─ typed CHECK_TEXT message ─► service worker
            ├─ top-level hostname: derived from Chrome's sender metadata for local policy
            ├─ API key: read from trusted extension storage
            └─ text + language ─► OpenRouter / selected provider
```

The API key never enters a content script. `chrome.storage.local` is set to
`TRUSTED_CONTEXTS`, and preference/auth changes are announced to frames with a key-free
`SETTINGS_CHANGED` event. Content frames receive only the current site's `disabledHere` decision;
the full disabled-site preference list remains available only to the internal popup.

The service worker waits for Chrome to confirm that storage access level before it handles
settings, OAuth, model, or grammar messages. Failure is closed: no credential is read or written.
Errors returned across the extension message boundary are length-bounded and defensively redact
OpenRouter-style keys and bearer values.

Cancellation identifiers are scoped with Chrome's tab, frame, and document metadata. A page frame
can cancel only its own active check, even if another frame happens to reuse the same request ID.
Credential writes are coordinated separately: concurrent OAuth attempts share one flow, a direct
key supersedes an unfinished OAuth attempt, and disconnect invalidates any result that arrives
late.

## Stored locally

- OpenRouter API key
- selected model
- global and automatic-check switches
- check delay
- disabled hostname list
- theme

Grammar results and submitted writing are kept only in bounded, in-memory caches in the content
script and extension service worker. Entries expire after five minutes; all entries are transient,
are cleared on disconnect, and are never written to Chrome storage.

For grammar checks, the hostname is not accepted from page or frame message data. The service
worker derives the top-level tab hostname from Chrome's trusted sender metadata, so one per-site
choice applies to same-origin and cross-origin editor frames alike. To label the popup's current-site
switch without `tabs` or broad network host permission, the popup asks the packaged isolated
content script in frame zero for its hostname. Webpage scripts cannot receive or answer that
extension-internal message.

## Network behavior

The service worker contacts OpenRouter for OAuth, direct-key validation, the model catalog, and
explicit/automatic grammar checks. The catalog is requested through the official SDK only after a
connection exists and the popup needs model choices; it contains model metadata, not editor text.
Chat, catalog, key-validation, and OAuth-exchange protocol handling all use the exactly pinned
official SDK. OpenRouter applies the provider and privacy preferences configured in the user's
OpenRouter account.

OpenRouter and the selected provider remain third-party processors. Their policies govern their
retention and handling.

## Chrome Web Store disclosure mapping

- **Website content:** processed only for the user-facing grammar function.
- **Authentication information:** OpenRouter key stored locally and used only for API requests.
- **Web history:** not collected. A hostname is evaluated locally for the per-site switch and is
  not retained as browsing history.
- **Analytics/advertising:** none.
- **Sale or unrelated use:** none.
- **Remote code:** none; all executable code is bundled.

This document explains implementation behavior and should be kept aligned with
[`PRIVACY_POLICY.md`](../PRIVACY_POLICY.md) and the store's current disclosure form.
