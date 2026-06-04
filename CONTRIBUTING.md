# Contributing to Localix Grammar

Thank you for improving Localix Grammar. This repository is a Chrome Manifest V3 extension, so a
change is complete only when it works in the production bundle loaded by Chrome—not only in a DOM
test.

## Requirements

- Node.js 22.19 or newer
- npm
- Chrome or the Playwright-managed Chromium build

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run verify
```

## Architecture boundaries

Keep these invariants intact:

1. **The official SDK owns OpenRouter protocol concerns.** Chat transport, model catalog, OAuth
   exchange, response parsing, retry, timeout, and cancellation belong to the exactly pinned
   `@openrouter/sdk`. Do not add a raw duplicate HTTP client or an agent framework for this single
   constrained inference path. Review the browser bundle whenever Dependabot proposes an update.
2. **The service worker owns credentials.** The OpenRouter key must remain in trusted
   `chrome.storage.local`. Content scripts receive only sanitized settings.
3. **Model output is untrusted.** Every span must be checked against the original UTF-16 string
   before it reaches the DOM.
4. **Page DOM is user data.** Do not replace `innerHTML` to apply a correction. Use native control
   setters or DOM `Range`, preserve selections, and emit input semantics.
5. **Sensitive controls are out of scope.** New field-detection behavior must preserve password,
   OTP, payment, identity, read-only, and explicit opt-out exclusions.
6. **One overlay per frame.** Avoid page-wide scanners and per-field controllers. The delegated
   writing session is the lifecycle owner.
7. **No remote executable code.** All JavaScript, CSS, and fonts ship in the extension package.
   Model metadata may arrive as inert JSON from OpenRouter's official catalog endpoint.

## Where changes belong

| Concern                                 | Location                            |
| --------------------------------------- | ----------------------------------- |
| Provider request and report validation  | `src/background/grammar-service.ts` |
| MV3 messages, credentials, cancellation | `src/background/index.ts`           |
| Active-editor lifecycle and caching     | `src/content/writing-session.ts`    |
| Editor eligibility and language         | `src/content/input-detector.ts`     |
| Plain/rich text mutation                | `src/content/apply.ts`              |
| In-page UI                              | `src/content/overlay.ts`            |
| User settings                           | `src/popup/`                        |
| Message and storage contracts           | `src/shared/`                       |

## Testing expectations

- Add a pure Vitest case for validation, detection, storage, or DOM mutation behavior.
- Add or update Playwright when a change touches the manifest, service worker, OpenRouter SDK path,
  content-script isolation, popup, or cross-context messaging.
- Keep the axe WCAG A/AA checks free of serious and critical violations.
- Run `LOCALIX_CAPTURE_UI=1 npm run test:e2e` when changing popup or overlay visuals and inspect the
  attached screenshots in `test-results/`.
- Test both success and rejection paths for anything that processes provider output or credentials.
- A test using `happy-dom` is not evidence that MV3 wiring works. Keep the unpacked-extension E2E
  green.
- Do not lower coverage thresholds to land a feature.

## Pull request checklist

- [ ] The change has one clear user-facing purpose.
- [ ] No new credential or personal-data path was introduced.
- [ ] Permissions are unchanged, or the new permission has a documented necessity.
- [ ] Keyboard and screen-reader behavior was considered.
- [ ] Stale requests and stale text cannot apply a correction.
- [ ] `npm run check` passes.
- [ ] `npm run test:coverage` passes.
- [ ] `npm run test:e2e` passes.
- [ ] `npm audit` reports no known vulnerabilities.
- [ ] User, privacy, store, and architecture documentation is updated where relevant.

## Reporting security issues

Do not include API keys, private writing, or OAuth callback URLs in a public issue. Contact the
Localix maintainers privately through [`SECURITY.md`](SECURITY.md).
