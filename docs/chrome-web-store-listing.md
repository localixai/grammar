# Chrome Web Store listing draft

## Name

Localix Grammar

## Short description

Precise AI grammar, spelling, punctuation, and style checks inside supported web editors.

## Detailed description

Write with confidence without leaving the page.

Localix Grammar reviews text in supported website editors and returns focused grammar, spelling,
punctuation, and clarity suggestions. Preview the corrected text, accept or reject individual
Git-style changes, or decide on all changes at once.

### Built for real web editors

- Works with textareas, prose inputs, rich text, and frames
- Preserves links, emphasis, paragraphs, and surrounding formatting
- Rejects stale or model-invented corrections before changing the page
- Cancels obsolete checks while you continue typing

### Your model choice

Connect your own OpenRouter account with secure PKCE—or use an existing inference API key—and
choose a model from OpenRouter's live catalog. Copying a key is optional.

### Controls that stay out of the way

- Manual or check-while-typing modes
- Global and per-site switches
- Accept/Reject all and individual Git-style changes
- Searchable model picker
- Dark, light, and system themes
- Keyboard navigation and reduced-motion support

### Privacy-aware by design

Localix operates no grammar proxy or text database. The OpenRouter key is stored in trusted Chrome
extension storage and never sent to webpage scripts. Password, authentication-code, payment,
identity, and read-only fields are excluded.

Text selected for a grammar check is sent through OpenRouter to the model you choose. OpenRouter and
the selected provider's policies apply.

Before connection, the popup explains that active-editor text is sent for manual checks and, when
enabled, after a typing pause. Choosing **Continue with OpenRouter** or submitting an API key is the
affirmative action that follows this disclosure; no writing is submitted before a connection
exists.

Focusing an editor alone does not send text. Automatic checks require trusted user input, and
page-script-generated input or trigger clicks are ignored.

## Category

Productivity

## Language

English listing; the grammar engine detects multilingual writing and receives the editor's valid
language hint when available.

## Permission justifications

### storage

Required to save the selected model, theme, enable/automatic-check settings, disabled-site list,
and the OAuth-issued or manually supplied OpenRouter key. Credential access is restricted to
trusted extension contexts.

### identity

Required to complete OpenRouter's OAuth PKCE authorization through Chrome's managed web-auth flow.

### Host access on all sites

Required for the extension's single purpose: show the Localix control in supported web editors
across HTTP(S) websites and frames. Chrome-internal and local file pages are not matched. Text is
read only from the active eligible editor when a manual or automatic check runs. Sensitive and
opt-out fields are excluded.

## Data disclosure notes

- Website content is processed for the grammar feature.
- Authentication information is stored locally for OpenRouter requests.
- No analytics, advertising, browsing-history collection, sale, or unrelated data use.
- No remotely hosted executable code.
- Link the listing to `PRIVACY_POLICY.md` published at a stable HTTPS URL.
- Confirm the Limited Use declaration and prominent pre-OAuth disclosure against the current
  Chrome Web Store dashboard form.

## Suggested screenshots and captions

1. **Review writing in place** — issue panel next to a rich-text editor with one clear replacement.
2. **Keep formatting intact** — before/after correction showing preserved emphasis and links.
3. **Choose your model** — searchable live OpenRouter model catalog.
4. **Control where checks run** — global, automatic, and current-site settings.
5. **Your writing boundary** — privacy panel explaining excluded sensitive fields and local key
   storage.

Store screenshots should use current production UI, contain no real personal writing or API keys,
and use Chrome Web Store's documented 1280×800 or 640×400 full-bleed dimensions. The automated
overlay captures use 1280×800; inspect and select them rather than publishing a test artifact
blindly.

## Support

- Homepage: `https://localix.ai`
- Source and issues: `https://github.com/localixai/grammar`
- Privacy policy: publish the repository privacy policy at a stable public HTTPS URL
