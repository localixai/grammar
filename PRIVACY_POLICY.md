# Privacy Policy — Localix Grammar

_Last updated: July 31, 2026_

## Overview

Localix Grammar is a Chrome extension that checks grammar, spelling, punctuation, and style using
AI models available through OpenRouter. Localix does not operate a proxy, analytics service, or text
database for the extension.

## Data processed

### Writing submitted for checking

When you request a check, or when **Check while typing** runs after a pause, the text in the active
eligible editor is sent from the extension service worker to OpenRouter and the selected model.
Localix does not receive that text on a Localix server. To avoid submitting unchanged writing
again, the extension keeps the text and result in bounded, transient memory for up to five minutes.
This cache is never written to Chrome storage and is cleared when you disconnect.

Focusing an editor alone does not submit its text. Automatic checking is scheduled only after a
trusted user input event; script-generated input and script-generated clicks on the Grammar trigger
are ignored.

The extension excludes password controls, one-time codes, payment-related autocomplete fields,
read-only fields, and regions that opt out of spellchecking. You can disable automatic checks,
disable Grammar globally, or pause it for the current site.

### OpenRouter API key

You can authorize through OpenRouter's OAuth PKCE flow or supply an existing OpenRouter inference
API key. A supplied key is sent directly to OpenRouter once for validation before storage. It is
stored in `chrome.storage.local`, with access restricted to trusted extension contexts, and is used
only to authenticate OpenRouter requests. The key is never sent to webpage content scripts or
returned in the extension's settings messages. Disconnecting removes it.

### Preferences

The selected model, theme, enabled state, automatic-check setting, delay, and disabled-site list
are stored locally in `chrome.storage.local`. The current hostname is used locally to enforce the
per-site setting; it is not included in the model prompt.

### Model catalog

After you connect OpenRouter and open the popup, the extension requests OpenRouter's current
tool-capable model catalog so it can show model names and prices. This metadata request contains no
editor text. Chat, model-catalog, key-validation, and OAuth-exchange requests use the official
OpenRouter SDK.

## Data we do not collect

- We do not collect account profiles, email addresses, or names.
- We do not run analytics, advertising, telemetry, or crash reporting.
- We do not maintain browsing-history or keystroke logs.
- We do not store submitted writing on Localix servers.
- We do not sell or rent data.

## Chrome Web Store Limited Use

The use of information received from Google APIs by Localix Grammar adheres to the Chrome Web Store
User Data Policy, including the Limited Use requirements.

Website content, form data, and the current hostname are handled only when strictly necessary to
provide the disclosed grammar-checking purpose. Submitted writing is transferred only to
OpenRouter and the selected model provider to deliver that feature. Localix does not use it for
advertising, credit decisions, data brokerage, analytics, or an unrelated product purpose, and
Localix personnel do not read submitted writing.

## Third-party processing

[OpenRouter](https://openrouter.ai/privacy) receives the submitted text and routes it to the model
provider you select. Their policies and the selected provider's policies govern that processing.
Grammar requests ask OpenRouter to deny providers that require data collection, but this preference
does not replace reviewing those third-party policies.

## Retention and deletion

Local settings remain on your device until changed or until the extension is uninstalled.
Disconnecting removes the OpenRouter key. OpenRouter and the selected model provider control their
own retention according to their policies.

## Changes

If data handling changes, the date above will be updated and the change will be proactively
disclosed in the product and store listing before the new practice takes effect.

## Contact

Questions can be opened at
[github.com/localixai/grammar/issues](https://github.com/localixai/grammar/issues).
