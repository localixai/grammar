# Localix Grammar user guide

## What it does

Localix Grammar reviews writing directly inside supported website editors. It can identify grammar,
spelling, punctuation, and clear style problems and apply a selected correction without copying
text to another tab.

Text is processed through your OpenRouter account and selected model. Localix does not operate a
text-processing proxy.

## Connect OpenRouter

1. Select the Localix Grammar icon in Chrome.
2. Choose **Continue with OpenRouter** to authorize with OAuth, or **Use API key** to connect an
   existing inference key.
3. Complete authorization or enter the key and choose **Connect with API key**.
4. The connected state and selected model will be shown.

Before the button is selected, the popup explains that active-editor text is sent for manual checks
and—while **Check while typing** is enabled—after a typing pause. No editor text is submitted before
an OpenRouter connection exists.

OAuth uses PKCE. A manually entered key is verified directly with OpenRouter before it is accepted.
In both cases, the key is stored only in trusted extension storage and is never returned to the
popup after connection. Disconnecting removes it.

No model is selected automatically. After connecting, choose any tool-capable model from the live
OpenRouter catalog before the first check.

## Check writing

1. Focus a supported text field or rich-text editor.
2. Select the Localix button at the lower-right edge of the editor.
3. Review the corrected-text preview.
4. Choose **Accept all** or **Reject all**, or open **Review changes** to accept or reject
   individual Git-style diff hunks.

Localix verifies that the reported text still exists at the exact location before applying a
change. If the editor changed while the model was responding, the old result is discarded.
Successful results are cached in memory for five minutes, so the same model, language, and
unchanged text do not create another OpenRouter request. The cache is never persisted and is
cleared on disconnect.

## Check while typing

**Check while typing** is enabled by default. After a 700-millisecond pause, Localix checks editors
containing at least three words. It cancels obsolete requests as you continue writing and reuses a
bounded cache for unchanged text.

Simply focusing an editor does not send its contents. A trusted user input event must occur first;
page-script-generated input and trigger clicks do not start a check.

Disable this setting if you want checks to run only when you select the Localix button.

## Popup settings

| Setting            | Behavior                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| Grammar everywhere | Enables or pauses the extension globally                                   |
| Check while typing | Runs a check after a short typing pause                                    |
| Current site       | Enables or pauses the current hostname                                     |
| Model              | Selects a live OpenRouter model and shows input/output price per 1M tokens |
| Theme button       | Cycles dark, light, and system themes                                      |
| Disconnect         | Deletes the locally stored OpenRouter key                                  |

Changing the model invalidates active results and separates cached decisions by model and language.

## Supported editors

- `<textarea>`
- prose `<input type="text">` and `<input type="search">`
- standard `contenteditable` editors, including formatting split across multiple text nodes
- editors inside same-origin or cross-origin frames where the extension content script is allowed

You can also select text on a page, right-click, and choose **Correct selected text with Localix
Grammar**. The selection opens in the popup checker and is corrected there. Use **Copy text** to
paste it back into editors that do not accept automatic changes.

Rich-text corrections preserve surrounding elements such as links, emphasis, and paragraphs.
One check accepts up to 20,000 JavaScript UTF-16 characters. Longer editors are rejected with an
explicit error rather than silently truncated.

## Intentionally excluded

- passwords and authentication codes;
- payment, identity, address, phone, and contact autocomplete fields;
- numeric/telephone input modes and widget-style controls;
- disabled or read-only fields;
- elements marked `data-localix-grammar-ignore`, `data-grammar-ignore`, or
  `data-enable-grammarly="false"`;
- Google Docs' canvas editor.

Google Docs requires a dedicated accessibility bridge; treating it as ordinary rich text would risk
reading or modifying the wrong content.

## Keyboard and accessibility

- Tab reaches popup controls, the in-page Localix trigger, Accept, Reject, Accept all, Reject all,
  and Close.
- Enter or Space activates the focused control.
- Escape closes the suggestion panel or returns from the model list.
- Focus returns to a stable control when an issue card is removed or the panel closes.
- Status, error, busy, current-model, and issue-count states are exposed to assistive technology.
- Motion is disabled when the operating system requests reduced motion.

## Privacy controls

Only text in the active eligible editor is submitted for a check. The hostname is used locally for
the per-site setting and is not included in the model prompt. See the
[privacy policy](../PRIVACY_POLICY.md) and
[permissions explanation](permissions-and-privacy.md) for the complete data flow.
