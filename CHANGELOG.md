# Changelog

All notable changes to Localix Grammar are documented here.

## 2.0.2 — Unreleased

### Runtime

- Removed forced `tool_choice` because some tool-capable OpenRouter endpoints reject it; one strict
  report tool remains and its returned call is still validated exactly.
- Removed model-specific provider-routing overrides so OpenRouter can select endpoints using the
  user's account preferences, and removed model preselection so every user makes an explicit
  choice.
- Reworked the in-editor review into a compact batch-first flow with a corrected-text preview,
  Accept all / Reject all controls, optional Git-style diff hunks, and a smaller stable editor
  trigger.
- Closed the review panel after batch decisions and after the final individual decision, while
  keeping it open between pending hunks.
- Replaced direct rich-editor anchoring with rendered-content visual-surface resolution.
  Contenteditable boxes promote only when their painted text escapes the editing host, without
  editor-size thresholds, ancestor-depth limits, hostnames, framework classes, or site selectors.
- Added viewport, nested overflow clipping, visual-viewport, layout-intersection, scroll, and
  resize tracking so the trigger and review panel remain attached through editor and page layout
  changes.
- Replaced model-authored offsets, patch planning, labels, confidence, and explanations with one
  complete corrected-text report. Localix validates it and derives every safe review hunk locally
  with the pinned `diff` library.
- Strengthened the language-agnostic proofreading contract to complete every clear error category,
  infer contextual typing mistakes, preserve intentional terms, and perform a final missed-error
  pass before reporting.
- Reduced the default typing pause to 700 milliseconds and added a bounded, five-minute transient
  result cache so unchanged text is not sent to OpenRouter again across editor sessions.
- Added a 35-second content-side watchdog that cancels an unanswered check and replaces the
  indefinite loading state with an actionable model/timeout error.
- Standardized OpenRouter attribution as `Localix`, `https://localix.ai`, and
  `personal-agent,writing-assistant`.
- Added direct OpenRouter API-key connection with provider-side validation while retaining OAuth
  PKCE as the primary option.
- Replaced the custom OpenRouter chat, model-catalog, and OAuth-exchange clients with the exactly
  pinned official `@openrouter/sdk`.
- Kept the runtime intentionally non-agentic: one structured grammar request does not justify an
  agent framework or its model-registry and tool-execution layers.
- Added schema-constrained grammar reports, retry limits, timeout, cancellation, and privacy-aware
  OpenRouter routing.
- Added a live, tool-capable OpenRouter catalog through the official SDK with a bounded in-memory
  cache, defensive normalization, deduplication, and stale-on-refresh-failure behavior.
- Bundled only tree-shaken official SDK operations into one MV3-compatible service-worker module.
- Added bounded corrected-text validation and rejected blank or unsafe model output.
- Rejected truncated or non-tool model completions instead of presenting partial reports as clean.
- JSON-encoded untrusted writing in the model request and validated language hints.

### Editor integration

- Replaced per-field controllers and page-wide mutation scanning with one delegated writing session
  per frame.
- Moved content injection to `document_start` and contained overlay pointer interactions so host
  pages cannot interpret the first check or apply click as an outside-editor action.
- Kept the writing session attached when a controlled rich editor replaces its DOM node during
  focus, typing, checking, or applying. Retargeting requires one eligible live editor with the
  exact text snapshot and uses no host, product, framework, class, or generated-ID rules.
- Isolated trusted Localix pointer events at the earliest window-capture boundary so host pages
  cannot treat an overlay click as leaving the editor. Actions still commit through native click
  semantics, preserving the first click, keyboard activation, and a stable visual anchor.
- Added debounced automatic checking, bounded model/language-aware caching, stale-response
  rejection, and per-site disablement.
- Cleared the in-memory writing cache on model changes, disconnect, and global/site pauses.
- Cancelled pending automatic checks when focus leaves an eligible editor or auto-check scheduling
  becomes ineligible.
- Limited automatic checks to trusted user input rather than focus alone, and ignored
  script-generated trigger clicks.
- Added sensitive autocomplete, input mode, widget role, read-only, and explicit grammar-tool
  exclusions. Native `spellcheck="false"` remains supported for rich editors that disable only the
  browser checker.
- Added conservative password, OTP, payment, PIN, and identity label heuristics for sites that omit
  correct autocomplete metadata.
- Made those opt-outs inherit through composed Shadow DOM ancestry and protected nested
  `contenteditable="false"` islands and synthetic block boundaries from correction ranges.
- Added native value-setter and DOM `Range` corrections with `beforeinput`, target ranges, input
  events, selection preservation, and rich-text formatting preservation.
- Made edit events cross Shadow DOM boundaries and kept `change` reserved for the page's normal
  commit or blur lifecycle.
- Excluded hidden, inert, template, script, and style subtrees from rich-text extraction and added
  protected mutation barriers around omitted content plus boundaries for table and semantic block
  content.
- Added all-frame support while explicitly excluding the unsupported Google Docs canvas editor.

### Interface

- Flattened the popup into quieter, divider-led sections and added a progressively disclosed API
  key form with show/hide control and accessible validation states.
- Rebuilt the popup and in-page overlay with Localix design tokens, bundled Inter in the popup,
  light/dark/system themes, reduced-motion support, and isolated Shadow DOM.
- Hardened the overlay host against conflicting page CSS, including author `!important` rules.
- Hid the overlay when its editor leaves the viewport and restored the trigger when it returns.
- Added accessible names, dialog relationships, focus restoration, progress/error states, model
  search, automatic checking, and current-site controls.
- Added live-catalog input/output pricing to model choices for cost-transparent selection.
- Removed the unnecessary `tabs` permission.

### Security and privacy

- Separated credentials from preferences and restricted `chrome.storage.local` to trusted extension
  contexts.
- Redacted the disabled-site list from content-script settings while retaining the current
  top-level site's allow/deny decision.
- Replaced direct content-script storage observation with sanitized service-worker notifications.
- Added runtime message validation, popup-only privileged actions, bounded stored values, and
  top-level sender-derived site policy across cross-origin frames.
- Enforced exact top-level and payload keys on every runtime message.
- Serialized concurrent preference patches so independent popup changes cannot overwrite one
  another.
- Scoped cancellation to each tab/frame/document and made OAuth single-flight, with disconnect
  taking precedence over late credential writes.
- Narrowed host/content-script matching from every URL scheme to HTTP(S) pages only.
- Restricted the extension-page network CSP to the packaged runtime and OpenRouter.
- Updated OAuth to OpenRouter PKCE S256 using `chrome.identity`.
- Delegated PKCE generation, authorization URL construction, and code exchange to the official
  OpenRouter SDK while retaining only Chrome's required web-auth adapter and callback validation.
- Updated the privacy policy and Chrome Web Store disclosure guidance.

### Quality

- Added Vitest unit/integration coverage with enforced thresholds.
- Added Playwright E2E that loads the production extension in Chromium and exercises the official
  SDK request contract, caching, cross-origin frame settings, sensitive fields, rich text, themes,
  and popup behavior.
- Added automated axe WCAG A/AA regression scans and optional visual screenshot artifacts.
- Added validated third-party notices and license texts to every production artifact.
- Replaced implicit `public/` copying with an allow-list so unused mobile artwork is absent from the
  Chrome Web Store package.
- Kept the English UI font payload bounded by shipping only Inter Latin and Latin Extended subsets,
  with system fallbacks for other model-name scripts.
- Losslessly optimized both Localix bird SVG variants after rendered visual comparison.
- Added CI, contributor guidance, release checks, troubleshooting, and an evidence-backed
  architecture record.
