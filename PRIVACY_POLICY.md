# Privacy Policy — Localix Grammar

_Last updated: June 4, 2026_

## Overview

Localix Grammar is a Chrome extension that checks grammar, spelling, and style on any webpage using AI models via the OpenRouter API. This policy explains what data is collected, how it is used, and with whom it is shared.

## Data We Collect

### Text You Submit for Checking
When you select text on a webpage and request a grammar check, that selected text is sent to the OpenRouter API to generate a correction. This text may contain website content you have highlighted.

### Authentication Token
When you connect your OpenRouter account via OAuth, an access token is stored locally in Chrome's `storage.local`. This token is used solely to authenticate API requests on your behalf.

### Extension Settings
Your preferences (enabled/disabled state, selected AI model) are stored locally in Chrome's `storage.local` and never leave your device.

## Data We Do Not Collect

- We do not collect your name, email address, or any personally identifiable information.
- We do not track your browsing history or the pages you visit.
- We do not log keystrokes or monitor your activity beyond the text you explicitly select for checking.
- We do not store any submitted text on our servers — text is sent directly from your browser to OpenRouter's API.

## Third-Party Services

**OpenRouter (openrouter.ai)** — selected text is transmitted to OpenRouter's API for AI processing. OpenRouter's own privacy policy governs how they handle this data: https://openrouter.ai/privacy

We have no other third-party integrations. We do not use analytics, advertising networks, or crash reporting services.

## Data Sharing

We do not sell, rent, or share your data with any third parties other than OpenRouter as described above, and only for the purpose of processing your grammar check request.

## Data Storage and Retention

All locally stored data (auth token, settings) remains on your device and can be removed at any time by disconnecting from OpenRouter in the extension popup or by uninstalling the extension.

## Changes to This Policy

If we update this policy, we will revise the "Last updated" date above. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Contact

If you have questions about this privacy policy, please open an issue at:  
https://github.com/localixai/grammar/issues
