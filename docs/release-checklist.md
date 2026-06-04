# Release checklist

## Product and scope

- [ ] The release still has one grammar-assistant purpose.
- [ ] Supported and intentionally unsupported editors are documented.
- [ ] Sensitive-field exclusions have regression coverage.
- [ ] A fresh install has no selected model, clearly asks for one, and sends no check until the
      user explicitly selects a tool-capable catalog entry.
- [ ] Any `@openrouter/sdk` update was reviewed against its generated schemas, browser bundle,
      changelog, and the chat/models/OAuth contract tests.

## Version and metadata

- [ ] `package.json`, `package-lock.json`, and `manifest.json` use the same version.
- [ ] `CHANGELOG.md` has a dated release section.
- [ ] Manifest name, description, minimum Chrome version, icons, permissions, and CSP are correct.
- [ ] Store description, permission justifications, privacy disclosures, and screenshots match the
      shipped behavior.
- [ ] The pre-connection disclosure and Limited Use statement satisfy the Chrome Web Store policy
      enforced from August 1, 2026.

## Automated gates

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run verify
npm run zip
```

- [ ] Formatting, lint, and TypeScript pass.
- [ ] Unit/integration tests and coverage thresholds pass.
- [ ] Production unpacked-extension E2E passes.
- [ ] Automated axe WCAG A/AA checks have no serious or critical violations.
- [ ] Audit reports no known vulnerabilities.
- [ ] CI browser screenshots were inspected for popup settings, model search, and the in-page
      overlay in dark and light themes.
- [ ] The archive contains `manifest.json`, one background module, one content bundle, popup files,
      fonts, icons, and third-party license texts—but no source maps, test output, credentials, or
      development files.

## Manual browser matrix

- [ ] Install the generated `dist/` in current stable Chrome.
- [ ] Fresh disconnected popup explains OpenRouter clearly.
- [ ] OAuth and API-key connect, validation, cancel, failure, reconnect, and disconnect states
      behave correctly.
- [ ] Manual check, automatic check, individual Accept/Reject, Accept all/Reject all, and clean
      result.
- [ ] Plain textarea, search/text input, multi-node rich text, and an iframe.
- [ ] Controlled rich editor that replaces its DOM node during check, apply, and repeated input.
- [ ] Rich editor with native `spellcheck="false"` and no Localix opt-out.
- [ ] Password, OTP, payment autocomplete, numeric input mode, read-only, and explicit
      grammar-tool opt-out.
- [ ] Edit text while a request is running; stale result is not shown or applied.
- [ ] Change models; old result/cache is not reused.
- [ ] Disable globally and per site; all open frames update.
- [ ] Dark, light, system, zoom, narrow viewport, keyboard-only, and reduced motion.
- [ ] No API key or writing appears in console output, storage visible to content scripts, or build
      artifacts.

## Publication

- [ ] Privacy policy is available at a stable HTTPS URL.
- [ ] Support and issue links work.
- [ ] Store data-use answers were reviewed against `docs/permissions-and-privacy.md`.
- [ ] Upload the ZIP, inspect the store's permission warning, and resolve unexpected warnings.
- [ ] Tag the exact tested commit and attach the same ZIP/checksum to the release.
- [ ] After rollout, install the store build in a clean profile and repeat the critical smoke test.
