# Troubleshooting

## The Localix button does not appear

Check the following:

1. **Grammar everywhere** is enabled in the popup.
2. Grammar is enabled for the current site.
3. The field is a textarea, text/search input, or standard rich-text editor.
4. The field is not read-only and does not use an explicit grammar-tool opt-out.
5. The field is not an authentication, payment, identity, contact, numeric, or widget control.
6. Reload the page after installing or updating an unpacked extension.

Google Docs is intentionally unsupported because its document surface is canvas-based.

## OpenRouter connection fails

- Confirm that Chrome allows the OpenRouter authorization page to open.
- Complete the flow in the same browser profile as the extension.
- If the flow was left open for a long time, close it and choose **Continue with OpenRouter** again.
- Disconnect and reconnect if OpenRouter revoked the generated key.
- Corporate filters must allow `https://openrouter.ai`.

Alternatively, choose **Use API key** and enter an OpenRouter inference key. Localix verifies the
key with OpenRouter before storing it; management keys are intentionally rejected.

## A model returns no suggestions or an error

Different OpenRouter models vary in structured-tool support and proofreading quality. Try the
same text with another tool-capable model from the live catalog. Localix intentionally does not
preselect or recommend a provider-specific model.

Localix rejects:

- prose instead of the required structured report;
- text that does not exactly occur in the editor;
- overlapping changes;
- empty or no-op replacements;
- low-confidence or malformed output.

An editor longer than 20,000 JavaScript UTF-16 characters is also rejected rather than partially
checked, because partial proofreading could present a misleading clean result.

An empty result can therefore mean either that the writing is clean or that unsafe suggestions
were discarded.

## A correction is not applied

Localix will not apply a suggestion if the editor changed after the check. Run the check again.

Some custom canvas, code, and framework editors implement private mutation protocols. Standard
`beforeinput`, native setters, and DOM `Range` are supported; an editor that rejects all of those
cannot be modified safely.

Controlled rich editors that replace their DOM node during focus or input are supported when the
replacement remains an eligible editor with the same text. Localix deliberately refuses an
ambiguous retarget if multiple nearby editors contain the exact snapshot.

## Automatic checking is too frequent

Disable **Check while typing** and use manual checks. The internal delay is normalized between 500
and 5,000 milliseconds; the default pause is 700 milliseconds.

## Reset local state

1. Use **Disconnect** to delete the OpenRouter key.
2. Restore global and per-site switches in the popup.
3. If necessary, remove and reinstall the extension. Uninstalling removes its local preferences.

Never paste an API key, private writing, or an OAuth callback URL into a public issue.

## Development diagnostics

For an unpacked development build:

```bash
npm run check
npm run test:coverage
npm run test:e2e
```

Inspect the service worker from `chrome://extensions` for provider/network errors. Do not log or
share request headers because they contain the OpenRouter credential.
