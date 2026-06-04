<p align="center">
  <a href="https://localix.ai/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.svg">
      <img src="public/logo-light.svg" width="72" height="72" alt="Localix">
    </picture>
  </a>
</p>

<h1 align="center">Localix Grammar</h1>

<p align="center">
  A precise, privacy-aware writing assistant for Chrome, powered by the official OpenRouter SDK.
</p>

## What changed in 2.0

Localix Grammar was rebuilt around one writing session per frame instead of one controller per
field. Its one constrained inference path now uses the exactly pinned
[`@openrouter/sdk`](https://github.com/OpenRouterTeam/typescript-sdk) for the model catalog,
structured chat request, OAuth exchange, response parsing, retries, timeouts, and cancellation.
An agent/runtime framework would add lifecycle and tool-execution machinery this product does not
need.

The extension-owned code is limited to the Grammar product domain:

- detecting safe prose editors;
- asking for and validating exact grammar spans;
- applying corrections without flattening rich text;
- presenting accessible Localix UI;
- storing extension preferences and the OAuth-issued or user-supplied key.

There is no hand-written chat-completions or model-catalog HTTP client.

## Product behavior

- Checks textareas, prose inputs, and `contenteditable` editors in every frame.
- Ignores passwords, one-time codes, payment/contact autocomplete fields, read-only controls,
  explicit grammar-tool opt-outs, and known unsupported canvas editors. Native
  `spellcheck="false"` remains supported because rich editors commonly use it only to disable the
  browser checker.
- Offers manual checking and debounced check-while-typing.
- Cancels stale requests and rejects stale or model-invented spans.
- Preserves formatting and selection when applying a correction.
- Supports one correction, ignore, apply all, Escape to dismiss, per-site pause, and global pause.
- Uses a single Shadow DOM overlay, isolated from page styles.
- Matches the neutral Localix IDE palette, typography, spacing, and light/dark/system themes.

## Architecture

```text
page editor
    │ focus/input
    ▼
WritingSession ── safe-field policy ── Shadow DOM overlay
    │ CHECK_TEXT (text + request id; never the API key)
    ▼
MV3 service worker
    │
    ├── official OpenRouter model catalog
    ├── official SDK transport / retries / cancellation
    └── strict report tool + span validator
             │
             ▼
          OpenRouter
```

The OpenRouter key stays in `chrome.storage.local`, whose access level is restricted to trusted
extension contexts. Content scripts receive a boolean connection state, not the key. Localix
Grammar has no proxy server or text database; text selected for checking is sent through OpenRouter
to the chosen model. Successful results remain only in bounded transient memory for up to five
minutes so unchanged text is not submitted twice.

The full evidence and decision log is in
[`docs/research-and-architecture.md`](docs/research-and-architecture.md).

## Documentation

- [User guide](docs/user-guide.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Permissions and privacy rationale](docs/permissions-and-privacy.md)
- [Research and architecture record](docs/research-and-architecture.md)
- [Chrome Web Store listing draft](docs/chrome-web-store-listing.md)
- [Release checklist](docs/release-checklist.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Development

Requirements: Node.js 22.19 or newer and Chrome/Chromium 116 or newer.

```bash
npm ci --ignore-scripts
npm run build
```

Load `dist/` from `chrome://extensions` using **Load unpacked**.

Useful commands:

```bash
npm run dev             # rebuild on changes
npm run check           # formatting, lint, types, unit tests, production build
npm run test:coverage   # unit/integration tests with enforced coverage thresholds
npx playwright install chromium
npm run test:e2e        # build and test the unpacked MV3 extension in Chromium
LOCALIX_CAPTURE_UI=1 npm run test:e2e # also save popup/overlay screenshots
npm run verify          # all local automated release gates, including audit
npm run zip             # clean distributable archive + SHA-256 checksum
```

## Source layout

```text
src/
├── background/
│   ├── grammar-service.ts    # official SDK request + strict report validator
│   ├── models-service.ts     # official SDK model catalog + bounded cache
│   ├── credential-coordinator.ts # OAuth/API-key/disconnect race ownership
│   └── index.ts              # MV3 messages, cancellation, settings boundary
├── content/
│   ├── writing-session.ts    # delegated events, debounce, cache, request lifecycle
│   ├── input-detector.ts     # prose/sensitive-field policy
│   ├── apply.ts              # native setters and DOM Range replacements
│   ├── overlay.ts            # isolated Localix UI
│   └── index.ts
├── popup/                    # settings, OAuth/API-key connect, model selector, theme
└── shared/                   # typed messages, normalized storage, Chrome OAuth adapter
tests/e2e/                    # unpacked-extension browser tests
```

## Quality gates

Vitest covers the grammar report boundary, model catalog, credential races, storage normalization,
sender/request isolation, field policy, and plain/rich editor replacement. Coverage thresholds are
enforced for the domain and boundary modules listed in `vitest.config.ts`. Playwright separately
loads the production `dist/` as a real extension and verifies lifecycle wiring, the real official
SDK request path, content-script isolation, iframe and settings propagation, per-site/global
pauses, cache behavior, rich-text preservation, sensitive-field exclusion, and
popup/service-worker integration. Axe scans the production popup and overlay for serious and
critical WCAG A/AA violations.

## License

[MIT](LICENSE)
