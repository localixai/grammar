# Research and architecture record

This document records the evidence used for the Localix Grammar 2.0 rewrite. The goal is
traceability: each borrowed pattern is tied to a source, a product decision, and a verification
path. No source code was copied into Localix Grammar.

## Material reviewed

The public repositories below were inspected at the recorded revisions.

| Source                                                                        | Revision reviewed | Relevant evidence                                                                                                                   |
| ----------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [OpenRouter TypeScript SDK](https://github.com/OpenRouterTeam/typescript-sdk) | npm `1.3.21`      | Official typed chat, model-catalog and OAuth operations, response validation, retries, timeout, and abort signals                   |
| [pi](https://github.com/earendil-works/pi)                                    | `3cd39163cbaa`    | Evaluated agent/runtime abstraction and browser model support; rejected for this product's single constrained inference             |
| [Harper](https://github.com/Automattic/harper)                                | `cf9ed268391d`    | Browser-extension E2E, iframe handling, one-lint suggestion popover, `beforeinput`, DOM `Range` replacement, selection preservation |
| [Correctly](https://github.com/iamaamir/Correctly)                            | `922e3f89b8dd`    | Sensitive-field exclusions, debouncing, unchanged-text suppression, stale-generation rejection, dismissible UI                      |
| [Nuxt UI](https://github.com/nuxt/ui)                                         | GitHub reviewed   | Complete corrected-text output with explicit preservation of source formatting                                                      |
| [Word GPT Plus](https://github.com/Kuingsmile/word-GPT-Plus)                  | GitHub reviewed   | Meticulous proofreading role, complete spelling/punctuation coverage, and a constrained corrected-text response                     |
| [Typlx Grammar Fix](https://github.com/typlx/chrome-grammar-fix-extension)    | `b5d421981b1f`    | Shadow DOM isolation, settings tests, and a five-minute bounded background result cache                                             |
| [Writing Helper](https://github.com/ravigadgil/writing-helper)                | `909fcae57fa3`    | Bounded text-result cache and skipping debounce when work is already cached or in flight                                            |
| [AI Grammar](https://github.com/nucleartux/ai-grammar)                        | `d0fcf458c076`    | Alternative MV3 packaging and grammar request flow                                                                                  |
| [Floating UI](https://github.com/floating-ui/floating-ui)                     | docs reviewed     | Overflow-aware placement, collision handling, and auto-update inputs for floating UI                                                |
| [Read Frog](https://github.com/mengxi-ream/read-frog)                         | `main` reviewed   | Visual-viewport-aware extension toolbar geometry and explicit offscreen/invalid measurements                                        |

Primary implementation paths inspected included:

- OpenRouter SDK standalone chat, models, and OAuth operations plus generated request/response
  schemas;
- `pi/packages/ai/src/models.ts`, `providers/openrouter.ts`, compatibility and browser docs, as a
  rejected-abstraction comparison;
- `harper/packages/lint-framework/src/lint/computeLintBoxes/index.ts`;
- `harper/packages/chrome-plugin/tests/` and `src/contentScript/index.ts`;
- `correctly/content/content.js`;
- Correctly's three proofreading prompt levels plus Nuxt UI and Word GPT Plus grammar prompts;
- `typlx-grammar/content/content.js` and `tests/e2e/`;
- AI Grammar's Floating UI integration and Read Frog's selection-toolbar positioning tests.

## Decision matrix

| Observed pattern                                                                                                                                                             | Decision in Grammar 2.0                                                                                                                                                                                                                                                                                                                                                          | Verification                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Harper uses `beforeinput`, DOM ranges, and selection restoration instead of replacing an editor's whole HTML.                                                                | Plain controls use their native value setter; rich editors use a text-node map and `Range`. Controlled editors can handle a cancelled `beforeinput` themselves.                                                                                                                                                                                                                  | `src/content/apply.test.ts`                                      |
| Correctly excludes password, OTP, payment, and contact autocomplete fields and respects explicit grammar-tool opt-outs.                                                      | Centralized, inherited eligibility policy rejects non-prose and sensitive controls before any text is read. Native `spellcheck=false` remains eligible because composed rich editors commonly use it to disable only the browser checker.                                                                                                                                        | `src/content/input-detector.test.ts`, browser E2E                |
| Harper tests the unpacked extension in a persistent browser context, including frames and special editors.                                                                   | Playwright starts Chromium with `dist/` loaded as an MV3 extension and tests the service worker, page injection, and popup.                                                                                                                                                                                                                                                      | `tests/e2e/extension.spec.ts`                                    |
| Typlx isolates extension UI using Shadow DOM.                                                                                                                                | One semantic custom element and one shadow root per frame own all Grammar UI.                                                                                                                                                                                                                                                                                                    | Browser E2E asserts one root                                     |
| Correctly debounces while-typing checks.                                                                                                                                     | A single delegated writing session schedules only after trusted user input, debounces the active editor, keeps a bounded LRU cache, cancels stale work, and validates the text snapshot before rendering/applying.                                                                                                                                                               | Session architecture plus service abort controller               |
| Modern controlled editors can replace their editing host during focus and input while preserving the visible document.                                                       | The active session observes only its composed lineage and retargets a disconnected host to one eligible focused or nearby editor with the exact prior text snapshot. Localix pointer events are contained at window capture before host-page listeners, while actions retain native click semantics. No product, framework, class, or generated-ID selector participates.        | Controlled-editor production browser E2E                         |
| Correctly suppresses unchanged checks, Typlx keeps a five-minute background LRU, and Writing Helper skips already handled work before debounce.                              | Grammar uses both a per-frame LRU and a transient service-worker LRU keyed by model, language, and exact text. A successful unchanged check returns without another OpenRouter request.                                                                                                                                                                                          | Cache unit tests and cross-page browser E2E                      |
| Correctly performs a completeness review over a full corrected result; Nuxt UI and Word GPT Plus ask for the complete corrected text and keep formatting/output constrained. | Grammar asks for one complete corrected text after an internal second proofreading pass, validates it, and computes every review hunk locally. The prompt explicitly covers missed contextual typos without adding language-specific dictionaries or rules.                                                                                                                      | Grammar contract tests, local diff tests, and browser E2E        |
| Harper tracks scrollable ancestors; Floating UI auto-update accounts for overflow, resize, layout shift, and viewport changes; Read Frog measures the visual viewport.       | Grammar compares the editing host with its rendered text ranges, promotes escaped content to its nearest containing surface, intersects that surface with viewport and clipping ancestors, and observes resize, intersection, page scroll, nested scroll, and visual-viewport changes. No editor-size threshold, ancestor-depth limit, site, or framework selector participates. | Geometry unit tests and production browser E2E                   |
| Harper keeps individual lint details close to their action; GitHub MCP review patterns expose bulk apply while separating pending, applied, dismissed, and stale states.     | Grammar defaults to a compact corrected-text preview with Accept all / Reject all. Individual Git-style diff hunks expose Accept / Reject behind Review changes.                                                                                                                                                                                                                 | Overlay unit tests, screenshots, and axe E2E                     |
| A deterministic local diff supports whole-change and per-hunk decisions without trusting model-authored offsets.                                                             | The model returns one complete corrected text. Grammar validates it and derives review spans locally with exactly pinned `diff@9.0.0`, leaving the model no offset, uniqueness, or patch-planning work.                                                                                                                                                                          | Corrected-text/diff unit tests, DOM apply tests, and browser E2E |
| Mature extensions support per-site disablement.                                                                                                                              | A normalized deny-list and current-site switch use the top-level hostname from Chrome's sender metadata, so cross-origin frames cannot diverge.                                                                                                                                                                                                                                  | Storage, sender-context, and browser E2E tests                   |
| A single constrained request does not require an agent runtime.                                                                                                              | Grammar uses the official `@openrouter/sdk` directly. An agent framework would add unused loop, tool execution, and registry abstractions and previously required MV3-specific workarounds.                                                                                                                                                                                      | Grammar/model/OAuth tests and dist validator                     |
| A neutral OKLCH palette, monochrome focus ring, and bounded Inter subsets keep the English UI consistent.                                                                    | Popup and overlay share the same visual vocabulary and do not depend on network fonts. The popup ships the same bounded Inter subsets, retains system fallbacks, and contrast-hardens small model metadata.                                                                                                                                                                      | Production build, screenshots, and axe E2E                       |

## Standards and platform evidence

Repository patterns were checked against primary platform documentation before implementation:

| Primary source                                                                                                                                                            | Constraint or recommendation                                                                                                                                    | Product consequence                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage/)                                                                                 | `storage.local` is exposed to content scripts by default and can be restricted with `setAccessLevel`.                                                           | Startup sets `TRUSTED_CONTEXTS`; the service worker returns only a redacted settings view.                                               |
| [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)                                                                   | Content scripts run in an isolated world; declarative `all_frames` injection covers matching child frames.                                                      | UI is isolated in Shadow DOM inside each frame, while settings changes are broadcast to every injected frame.                            |
| [Extension service worker basics](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics)                                                   | An MV3 background worker can be a module, but dynamic `import()` is unsupported and remotely hosted code is prohibited.                                         | The production background is one statically bundled module containing tree-shaken official SDK operations and no remote executable code. |
| [Chrome identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)                                                                                | `launchWebAuthFlow` supports non-Google providers and completes on a URL generated by `getRedirectURL`.                                                         | The browser-only adapter validates the returned origin/path before exchanging the code; OAuth starts only from an explicit user act.     |
| [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)                                                                                            | S256 PKCE is recommended; the returned code and verifier are exchanged for a user-controlled API key.                                                           | The SDK's Web Crypto helper creates the challenge and the verifier remains in memory for the interactive flow.                           |
| [OpenRouter TypeScript SDK](https://openrouter.ai/docs/client-sdks/typescript/overview)                                                                                   | The official SDK exposes typed operations, validation, retries, timeout, and cancellation without requiring a handwritten protocol client.                      | Exactly pinned standalone operations handle chat, model listing, and OAuth exchange while keeping the MV3 bundle tree-shakeable.         |
| [OpenRouter model listing](https://openrouter.ai/docs/client-sdks/typescript/api-reference/models/models)                                                                 | The official catalog can filter model capabilities and output modalities.                                                                                       | The popup requests tool-capable text models after connection and uses a bounded, stale-on-error in-memory cache.                         |
| [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)                                                                               | OpenRouter owns endpoint selection and applies the user's account-level provider and privacy preferences.                                                       | Grammar avoids model-specific routing overrides and sends the same narrow tool contract for every selected model.                        |
| [Input Events Level 2](https://w3c.github.io/input-events/) and [HTML form event behavior](https://html.spec.whatwg.org/multipage/input.html#common-input-element-events) | Spell-check replacement is `insertReplacementText`; edits use composed `beforeinput` then `input`, while `change` belongs to commit or blur.                    | Corrections expose exact target ranges across Shadow DOM and do not synthesize premature form commits.                                   |
| [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) and [axe Playwright integration](https://github.com/dequelabs/axe-core-npm)                           | Controls need programmatic names, keyboard access, visible focus, meaningful roles/state, and usable status messages; automated scans complement manual review. | Popup and overlay expose names/state, restore focus, support Escape, and run axe A/AA scans against the production extension.            |
| [Chrome Web Store quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines/)                                                    | An extension needs one narrow, understandable purpose, and persistent UI should complement the current task with minimal distraction.                           | Grammar remains the only purpose; one small trigger appears only beside the active eligible editor.                                      |
| [July 2026 Chrome Web Store policy update](https://developer.chrome.com/blog/cws-policy-updates-2026)                                                                     | From August 1, 2026, all collected data must be strictly necessary to the disclosed single purpose and all collection must be prominently disclosed.            | The pre-OAuth screen names manual and pause-triggered transfer; connecting is the affirmative action, and Limited Use is documented.     |
| [Chrome Web Store image guidance](https://developer.chrome.com/docs/webstore/images/)                                                                                     | Listing screenshots must show the actual experience at 1280×800 or 640×400, full bleed.                                                                         | Visual E2E captures the production overlay at 1280×800 with synthetic writing and no credentials.                                        |

Automated accessibility checks are treated as a regression gate, not proof of complete WCAG
conformance. Keyboard, zoom, contrast, reduced-motion, and screen-reader behavior remain explicit
items in the manual release matrix.

## Live catalog release check

On July 31, 2026, the same pinned SDK catalog operation confirmed that tool-capable models were
available. The production picker does not preselect or rely on a dated model entry: it queries and
filters the current official catalog after connection and requires an explicit user choice.

## Why the official SDK, not pi or raw fetch

Grammar checking is a single constrained inference, not an autonomous tool loop. The extension
sends one request with a single, strictly described `report_corrected_text` tool and then validates
the report against the exact editor snapshot. Pi was investigated as an agent/runtime option, but
even its smaller AI layer brought an additional model abstraction and browser-bundling
accommodations that do not create product value here.

The exactly pinned official OpenRouter SDK now owns:

- chat, live model-catalog, and OAuth-exchange HTTP protocol details;
- outbound and inbound API schema mapping;
- retries, timeout, cancellation, application headers, and session identifier;
- OpenRouter routing and model-capability query parameters.

There is no duplicate raw chat or catalog client and no agent framework. Grammar still owns the
plain JSON Schema tool definition and domain contract because a provider SDK cannot safely mutate
page DOM. The validator bounds the complete corrected result, rejects unsafe control characters
and invalid blank output, and never trusts model-authored offsets. The corrected text is converted
to UTF-16 review spans locally with `diffChars`. The DOM layer
additionally rejects spans that cross synthetic block boundaries or nested non-editable nodes, and
reports partial batch mutations instead of claiming the editor is clean.

## Browser/auth boundary

A Chrome extension must initiate OAuth through `chrome.identity.launchWebAuthFlow`, so a small
browser adapter obtains Chrome's redirect URL, launches the SDK-built authorization URL, and
validates the callback origin and path. The official SDK creates the PKCE verifier/challenge and
performs the authorization-code exchange; the adapter implements no OpenRouter HTTP protocol. The
key is stored separately from preferences. The background credential coordinator makes the
interactive flow single-flight and ensures a disconnect invalidates and clears any late result,
including one that races with Chrome storage.

Standalone SDK operation imports were chosen over the full aggregate client so Vite can tree-shake
unrelated API groups. The production validator rejects dynamic imports, Node built-ins, remote
code, or an unpinned SDK version.

OpenRouter's documented flow returns an authorization `code` and does not document echoing an OAuth
`state` parameter. PKCE binds that code to the in-memory verifier, so the extension does not require
an unsupported state echo.

## Deliberate exclusions

- Google Docs' canvas editor is excluded. Supporting it correctly requires a dedicated bridge and
  editor-specific accessibility mapping, as Harper's implementation demonstrates; pretending it
  is a normal `contenteditable` would be unsafe.
- The model list comes from OpenRouter's official SDK only after a connection exists. It is inert
  metadata, cached for 15 minutes in worker memory, normalized defensively, and never executed.
- No page-wide `MutationObserver` scans every node. Delegated composed events discover the active
  editor, including editors created after injection, with constant listener count.
- `chrome.storage.local` is restricted to `TRUSTED_CONTEXTS`; the API key is never sent to a
  content script or returned by `GET_SETTINGS`. Preference/auth changes reach page frames through a
  key-free service-worker event.

## Quality strategy

The test pyramid mirrors the failure surface:

1. Pure tests verify hostile model output, exact patch application, and local UTF-16 diff spans.
2. DOM tests verify sensitive-field policy and rich-text-safe application.
3. Storage tests verify normalization and secret redaction.
4. Coordinator tests force cancellation, OAuth, and storage races with deterministic deferred
   promises.
5. Production-build E2E loads the real manifest, service worker, popup, content script, and Shadow
   DOM in Chromium.

Coverage thresholds are enforced in `vitest.config.ts`; the MV3 path is separately enforced by
Playwright because a DOM simulator cannot validate Chrome extension wiring. The browser suite also
proves global and per-site settings propagation across the top document and iframe, model-aware
cache invalidation, automatic checking, sensitive-field exclusion, and the real official SDK
request contract. It also replaces an active rich-editor node during overlay interaction and
trusted typing, proving that check, apply, and repeated-input retargeting stay attached without a
site-specific adapter. Set `LOCALIX_CAPTURE_UI=1` to attach reviewable popup and overlay
screenshots.

CI uses the current supported major versions documented by GitHub for checkout and Node setup, and
uploads Playwright screenshots/traces as short-lived workflow artifacts so browser failures can be
reviewed rather than reproduced blindly.
