import {
  MAX_CHECK_TEXT_LENGTH,
  type CheckResult,
  type GrammarError,
  type Message,
  type MessageResponse,
  type SettingsChangedEvent,
  type SettingsView,
} from "../shared/types";
import { DEFAULT_PREFERENCES } from "../shared/utils/storage";
import { correctedText } from "../shared/utils/corrected-text";
import { sendRuntimeMessage } from "../shared/utils/runtime-message";
import { applyReplacement, getElementText, replaceWholeEditableText } from "./apply";
import { resolveEditorAnchor } from "./editor-geometry";
import {
  hasWritingSpace,
  isEligibleElement,
  isSupportedElement,
  languageForElement,
  resolveEditableTarget,
  type SupportedElement,
} from "./input-detector";
import { GrammarOverlay } from "./overlay";

const MIN_AUTO_CHECK_WORDS = 3;
const CACHE_LIMIT = 25;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const RUNTIME_MESSAGE_TIMEOUT_MS = 10_000;
const CHECK_RESPONSE_TIMEOUT_MS = 35_000;
const CHECK_TIMEOUT_ERROR =
  "OpenRouter did not respond within 35 seconds. Try another model or check again.";

function sendMessage(
  message: Message,
  timeoutMs = RUNTIME_MESSAGE_TIMEOUT_MS,
  timeoutError = "Localix Grammar is not responding. Reload the page and try again.",
): Promise<MessageResponse> {
  return sendRuntimeMessage(message, timeoutMs, timeoutError);
}

function isSettingsView(value: unknown): value is SettingsView {
  return (
    !!value &&
    typeof value === "object" &&
    "connected" in value &&
    typeof (value as { connected?: unknown }).connected === "boolean" &&
    "disabledHere" in value &&
    typeof (value as { disabledHere?: unknown }).disabledHere === "boolean"
  );
}

function isCheckResult(value: unknown): value is CheckResult {
  return (
    !!value &&
    typeof value === "object" &&
    "errors" in value &&
    Array.isArray((value as { errors?: unknown }).errors)
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function deepActiveElement(): Element | null {
  let active: Element | null = document.activeElement;
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

function composedLineage(element: Element): Node[] {
  const lineage: Node[] = [element];
  let current: Node = element;
  while (true) {
    if (current instanceof ShadowRoot) {
      current = current.host;
    } else if (current instanceof Element && current.parentElement) {
      current = current.parentElement;
    } else if (current instanceof Element) {
      const root = current.getRootNode();
      if (!(root instanceof ShadowRoot)) break;
      current = root;
    } else {
      break;
    }
    lineage.push(current);
  }
  return lineage;
}

function explicitEditorCandidates(root: ParentNode): SupportedElement[] {
  const candidates = new Set<SupportedElement>();
  const collect = (searchRoot: ParentNode): void => {
    if (searchRoot instanceof Element && isSupportedElement(searchRoot)) {
      candidates.add(searchRoot);
    }
    for (const element of searchRoot.querySelectorAll("input, textarea, [contenteditable]")) {
      if (isSupportedElement(element)) candidates.add(element);
    }
    for (const element of searchRoot.querySelectorAll("*")) {
      if (element instanceof HTMLElement && element.shadowRoot) collect(element.shadowRoot);
    }
  };
  collect(root);
  return [...candidates];
}

function editableTargetForElement(element: Element): SupportedElement | null {
  const event = new Event("input", { composed: true });
  Object.defineProperty(event, "composedPath", { value: () => [element] });
  return resolveEditableTarget(event);
}

export class WritingSession {
  private readonly overlay: GrammarOverlay;
  private readonly cache = new Map<string, { result: CheckResult; storedAt: number }>();
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver | null;
  private readonly mutationObserver: MutationObserver;
  private settings: SettingsView = {
    ...DEFAULT_PREFERENCES,
    connected: false,
    disabledHere: false,
  };
  private active: SupportedElement | null = null;
  private result: CheckResult | null = null;
  private snapshot = "";
  private timer: number | undefined;
  private requestId: string | null = null;
  private positioning = false;
  private visualAnchor: HTMLElement | null = null;
  private activeLineage: Node[] = [];
  private lastKnownText = "";
  private suppressInput = false;
  private autoCheckQueued = false;
  private composing = false;
  private trustedEditUntil = 0;

  constructor() {
    this.overlay = new GrammarOverlay({
      onCheck: (): void => void this.check(true),
      onApply: (error, replacement): void => void this.applyOne(error, replacement),
      onApplyAll: (): void => void this.applyAll(),
      onRejectAll: (): void => this.rejectAll(),
      onIgnore: (error): void => this.ignore(error),
      onClose: (): void => this.overlay.hidePanel(),
    });
    this.resizeObserver = new ResizeObserver(() => this.schedulePosition());
    this.intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(() => this.schedulePosition());
    this.mutationObserver = new MutationObserver(() => {
      this.schedulePosition();
      if (
        this.suppressInput ||
        this.composing ||
        Date.now() > this.trustedEditUntil ||
        !this.active?.isConnected
      )
        return;
      const text = getElementText(this.active);
      if (text !== this.lastKnownText) this.recordTextChange(this.active);
    });
  }

  async start(): Promise<void> {
    document.addEventListener("focusin", this.onFocusIn, true);
    document.addEventListener("input", this.onInput, true);
    document.addEventListener("beforeinput", this.onBeforeInput, true);
    document.addEventListener("compositionstart", this.onCompositionStart, true);
    document.addEventListener("compositionend", this.onCompositionEnd, true);
    document.addEventListener("mousedown", this.onMouseDown, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("scroll", this.onViewportChange, true);
    window.addEventListener("resize", this.onViewportChange);
    window.visualViewport?.addEventListener("scroll", this.onViewportChange);
    window.visualViewport?.addEventListener("resize", this.onViewportChange);
    chrome.runtime.onMessage.addListener(this.onRuntimeMessage);
    await this.refreshSettings();
    const focused = deepActiveElement();
    if (focused) {
      const synthetic = new FocusEvent("focusin");
      Object.defineProperty(synthetic, "composedPath", { value: () => [focused] });
      this.activate(resolveEditableTarget(synthetic));
    }
  }

  destroy(): void {
    this.cancelPending();
    this.autoCheckQueued = false;
    document.removeEventListener("focusin", this.onFocusIn, true);
    document.removeEventListener("input", this.onInput, true);
    document.removeEventListener("beforeinput", this.onBeforeInput, true);
    document.removeEventListener("compositionstart", this.onCompositionStart, true);
    document.removeEventListener("compositionend", this.onCompositionEnd, true);
    document.removeEventListener("mousedown", this.onMouseDown, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("scroll", this.onViewportChange, true);
    window.removeEventListener("resize", this.onViewportChange);
    window.visualViewport?.removeEventListener("scroll", this.onViewportChange);
    window.visualViewport?.removeEventListener("resize", this.onViewportChange);
    chrome.runtime.onMessage.removeListener(this.onRuntimeMessage);
    this.resizeObserver.disconnect();
    this.intersectionObserver?.disconnect();
    this.mutationObserver.disconnect();
    this.overlay.destroy();
  }

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (this.overlay.containsEvent(event)) return;
    const target = resolveEditableTarget(event);
    if (
      target &&
      this.active &&
      !this.active.isConnected &&
      isEligibleElement(target) &&
      getElementText(target) === this.lastKnownText
    ) {
      this.adoptLiveEditor(target);
      this.schedulePosition();
      return;
    }
    if (this.overlay.isInteracting()) return;
    this.activate(target);
  };

  private readonly onInput = (event: Event): void => {
    if (this.suppressInput || !event.isTrusted) return;
    const target = resolveEditableTarget(event);
    if (!target) return;
    this.trustedEditUntil = Date.now() + 500;
    if (target !== this.active) this.activate(target);
    if (target !== this.active) return;
    this.recordTextChange(target);
  };

  private readonly onBeforeInput = (event: InputEvent): void => {
    if (event.isTrusted && resolveEditableTarget(event) === this.active) {
      this.trustedEditUntil = Date.now() + 500;
    }
  };

  private readonly onCompositionStart = (): void => {
    this.composing = true;
    this.cancelPending();
  };

  private readonly onCompositionEnd = (event: CompositionEvent): void => {
    this.composing = false;
    if (event.isTrusted) this.trustedEditUntil = Date.now() + 500;
    const target = resolveEditableTarget(event);
    if (target && target === this.active) this.recordTextChange(target);
  };

  private recordTextChange(target: SupportedElement): void {
    this.cancelPending();
    this.autoCheckQueued = true;
    this.result = null;
    this.snapshot = "";
    this.lastKnownText = getElementText(target);
    this.overlay.setState("idle");
    this.overlay.hidePanel();
    this.schedulePosition();
    this.scheduleAutoCheck();
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.overlay.containsEvent(event)) return;
    const target = resolveEditableTarget(event);
    if (target === this.active) {
      this.schedulePosition();
      return;
    }
    this.activate(target);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.overlay.hidePanel();
    if (
      event.isTrusted &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      (event.key.length === 1 || ["Backspace", "Delete", "Enter"].includes(event.key)) &&
      resolveEditableTarget(event) === this.active
    ) {
      this.trustedEditUntil = Date.now() + 500;
    }
  };

  private readonly onViewportChange = (): void => this.schedulePosition();

  private readonly onRuntimeMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean | void => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "GET_LOCALIX_SITE_CONTEXT"
    ) {
      sendResponse({
        hostname:
          window.location.protocol === "http:" || window.location.protocol === "https:"
            ? window.location.hostname.toLowerCase()
            : null,
      });
      return false;
    }
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      (message as SettingsChangedEvent).type === "SETTINGS_CHANGED"
    ) {
      void this.refreshSettings();
    }
  };

  private activate(element: SupportedElement | null): void {
    if (element === this.active) {
      this.overlay.position();
      return;
    }
    this.cancelPending();
    this.autoCheckQueued = false;
    this.trustedEditUntil = 0;
    this.resizeObserver.disconnect();
    this.intersectionObserver?.disconnect();
    this.mutationObserver.disconnect();
    this.visualAnchor = null;
    this.activeLineage = [];
    this.lastKnownText = "";
    this.active =
      element && isEligibleElement(element) && hasWritingSpace(element) ? element : null;
    this.result = null;
    this.snapshot = "";
    this.overlay.hidePanel();
    if (!this.active || !this.isEnabledHere()) {
      this.overlay.setTarget(null);
      return;
    }
    this.activeLineage = composedLineage(this.active);
    this.lastKnownText = getElementText(this.active);
    this.observeActiveMutations();
    this.syncGeometryObservers();
    this.overlay.setTarget(this.active);
    this.overlay.setState("idle");
  }

  private isEnabledHere(): boolean {
    return this.settings.enabled && !this.settings.disabledHere;
  }

  private async refreshSettings(): Promise<void> {
    const response = await sendMessage({ type: "GET_SETTINGS" });
    if (!response.success || !isSettingsView(response.data)) return;
    const modelChanged = this.settings.model !== response.data.model;
    this.settings = response.data;
    this.overlay.setTheme(this.settings.theme);
    if (modelChanged) {
      this.cancelPending();
      this.autoCheckQueued = false;
      this.cache.clear();
      this.result = null;
      this.snapshot = "";
      this.overlay.setState("idle");
      this.overlay.hidePanel();
    }
    if (!this.settings.connected) {
      this.cancelPending();
      this.autoCheckQueued = false;
      this.cache.clear();
    }
    if (!this.isEnabledHere()) {
      this.cancelPending();
      this.autoCheckQueued = false;
      this.cache.clear();
      this.overlay.setTarget(null);
    } else if (this.active) {
      this.overlay.setTarget(this.active);
      this.scheduleAutoCheck();
    }
  }

  private scheduleAutoCheck(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.autoCheckQueued) return;
    if (
      !this.active ||
      !this.active.isConnected ||
      !this.settings.autoCheck ||
      !this.settings.connected ||
      !this.settings.model ||
      this.composing ||
      !document.hasFocus()
    ) {
      this.autoCheckQueued = false;
      return;
    }
    const text = getElementText(this.active);
    if (countWords(text) < MIN_AUTO_CHECK_WORDS) {
      this.autoCheckQueued = false;
      return;
    }
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      this.autoCheckQueued = false;
      void this.check(false);
    }, this.settings.checkDelayMs);
  }

  private async check(manual: boolean): Promise<void> {
    if (!this.active || !this.isEnabledHere()) return;
    if (manual) {
      this.cancelPending();
      this.autoCheckQueued = false;
    }
    const liveElement = this.liveEditorForText(
      manual && this.active.isConnected ? getElementText(this.active) : this.lastKnownText,
    );
    if (!liveElement) {
      this.activate(null);
      return;
    }
    const element = liveElement;
    const text = getElementText(element);
    this.lastKnownText = text;
    if (!text.trim()) return;
    if (text.length > MAX_CHECK_TEXT_LENGTH) {
      this.overlay.showError(
        `Text is too long. Localix Grammar supports up to ${MAX_CHECK_TEXT_LENGTH} characters.`,
      );
      return;
    }
    if (
      !manual &&
      (this.composing || !document.hasFocus() || countWords(text) < MIN_AUTO_CHECK_WORDS)
    )
      return;
    if (!this.settings.connected) {
      this.overlay.showError("Connect OpenRouter from the extension popup.");
      return;
    }
    if (!this.settings.model) {
      this.overlay.showError("Choose a model from the Localix Grammar popup.");
      return;
    }
    const language = languageForElement(element);
    const cacheKey = this.cacheKey(text, language);
    const cached = this.cachedResult(cacheKey);
    if (cached) {
      this.result = cached;
      this.snapshot = text;
      this.overlay.showResult(cached);
      return;
    }

    this.cancelPending();
    const requestId = crypto.randomUUID();
    this.requestId = requestId;
    this.snapshot = text;
    this.overlay.showChecking();
    const response = await sendMessage(
      {
        type: "CHECK_TEXT",
        payload: {
          requestId,
          text,
          ...(language ? { language } : {}),
        },
      },
      CHECK_RESPONSE_TIMEOUT_MS,
      CHECK_TIMEOUT_ERROR,
    );
    if (this.requestId !== requestId) return;
    this.requestId = null;
    if (!response.success && response.error === CHECK_TIMEOUT_ERROR) {
      void sendMessage({ type: "CANCEL_CHECK", payload: { requestId } });
    }
    const currentElement = this.liveEditorForText(text);
    if (!currentElement || getElementText(currentElement) !== text) {
      this.overlay.setState("idle");
      this.overlay.hidePanel();
      return;
    }
    if (!response.success || !isCheckResult(response.data)) {
      if (!response.success && !/abort/iu.test(response.error))
        this.overlay.showError(response.error);
      return;
    }
    this.result = response.data;
    this.snapshot = text;
    this.cacheResult(cacheKey, response.data);
    this.overlay.showResult(response.data);
  }

  private async applyOne(error: GrammarError, replacement: string): Promise<void> {
    if (!this.active || !this.result) {
      this.invalidateStaleResult();
      return;
    }
    const element = this.liveEditorForText(this.snapshot);
    if (!element) {
      this.invalidateStaleResult();
      return;
    }
    const expected =
      this.snapshot.slice(0, error.offset) +
      replacement +
      this.snapshot.slice(error.offset + error.length);
    this.suppressInput = true;
    try {
      applyReplacement(element, error, replacement);
      const live = await this.settleLiveEditor(expected);
      if (!live || getElementText(live) !== expected) {
        this.overlay.showError(
          "This editor did not accept the change. You can copy the corrected text.",
          correctedText(this.result),
        );
        return;
      }
      const delta = replacement.length - error.length;
      const errors = this.result.errors
        .filter((candidate) => candidate.id !== error.id)
        .map((candidate) =>
          candidate.offset > error.offset
            ? { ...candidate, offset: candidate.offset + delta }
            : candidate,
        );
      this.snapshot = expected;
      this.lastKnownText = expected;
      this.result = { ...this.result, originalText: expected, errors };
      this.cacheResult(this.cacheKey(expected, languageForElement(this.active)), this.result);
      this.overlay.showResult(this.result);
      if (errors.length === 0) this.overlay.hidePanel();
    } finally {
      this.suppressInput = false;
      this.trustedEditUntil = 0;
    }
  }

  private async applyAll(): Promise<void> {
    if (!this.active || !this.result) {
      this.invalidateStaleResult();
      return;
    }
    let element = this.liveEditorForText(this.snapshot);
    if (!element) {
      this.invalidateStaleResult();
      return;
    }
    this.suppressInput = true;
    try {
      let text = this.snapshot;
      let appliedCount = 0;
      const applicable = this.result.errors.filter((error) => error.replacements[0] !== undefined);
      const corrected = correctedText(this.result);
      if (
        applicable.length > 1 &&
        !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
      ) {
        replaceWholeEditableText(element, corrected);
        const wholeEditor = await this.settleLiveEditor(corrected);
        if (wholeEditor && getElementText(wholeEditor) === corrected) {
          this.snapshot = corrected;
          this.lastKnownText = corrected;
          this.result = { ...this.result, originalText: corrected, errors: [] };
          this.cacheResult(this.cacheKey(corrected, languageForElement(wholeEditor)), this.result);
          this.overlay.showResult(this.result);
          this.overlay.hidePanel();
          return;
        }
        if (this.active?.isConnected && getElementText(this.active) !== text) {
          this.overlay.showError("This editor did not accept all changes.", corrected);
          return;
        }
      }
      for (const error of [...applicable].sort((a, b) => b.offset - a.offset)) {
        const replacement = error.replacements[0];
        if (replacement === undefined) continue;
        const end = error.offset + error.length;
        if (text.slice(error.offset, end) !== error.original) continue;
        const expected = text.slice(0, error.offset) + replacement + text.slice(end);
        applyReplacement(element, error, replacement);
        const live = await this.settleLiveEditor(expected);
        if (!live || getElementText(live) !== expected) continue;
        element = live;
        text = expected;
        appliedCount += 1;
      }
      if (appliedCount !== applicable.length || applicable.length === 0) {
        const copyText = correctedText(this.result);
        this.result = null;
        this.snapshot = "";
        this.overlay.showError(
          "This editor did not accept every change. You can copy the corrected text.",
          copyText,
        );
        return;
      }
      this.snapshot = text;
      this.lastKnownText = text;
      this.result = { ...this.result, originalText: text, errors: [] };
      this.cacheResult(this.cacheKey(text, languageForElement(this.active)), this.result);
      this.overlay.showResult(this.result);
      this.overlay.hidePanel();
    } finally {
      this.suppressInput = false;
      this.trustedEditUntil = 0;
    }
  }

  private ignore(error: GrammarError): void {
    if (!this.result) return;
    this.result = {
      ...this.result,
      errors: this.result.errors.filter((candidate) => candidate.id !== error.id),
    };
    this.cacheResult(
      this.cacheKey(this.snapshot, this.active ? languageForElement(this.active) : undefined),
      this.result,
    );
    this.overlay.showResult(this.result);
    if (this.result.errors.length === 0) this.overlay.hidePanel();
  }

  private rejectAll(): void {
    if (!this.active || !this.result || getElementText(this.active) !== this.snapshot) {
      this.invalidateStaleResult();
      return;
    }
    this.result = { ...this.result, errors: [] };
    this.cacheResult(this.cacheKey(this.snapshot, languageForElement(this.active)), this.result);
    this.overlay.showResult(this.result);
    this.overlay.hidePanel();
  }

  private invalidateStaleResult(): void {
    this.result = null;
    this.snapshot = "";
    this.overlay.setState("idle");
    this.overlay.hidePanel();
  }

  private cacheKey(text: string, language?: string): string {
    return `${this.settings.model}\u0000${language ?? ""}\u0000${text}`;
  }

  private cacheResult(key: string, result: CheckResult): void {
    this.cache.delete(key);
    this.cache.set(key, { result, storedAt: Date.now() });
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (typeof oldest !== "string") break;
      this.cache.delete(oldest);
    }
  }

  private cachedResult(key: string): CheckResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.storedAt >= CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  private cancelPending(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.requestId) {
      void sendMessage({ type: "CANCEL_CHECK", payload: { requestId: this.requestId } });
      this.requestId = null;
    }
  }

  private schedulePosition(): void {
    if (this.positioning) return;
    this.positioning = true;
    requestAnimationFrame(() => {
      this.positioning = false;
      if (this.active && !this.active.isConnected) {
        this.liveEditorForText(this.lastKnownText);
      }
      if (this.active?.isConnected && !hasWritingSpace(this.active)) {
        this.activate(null);
        return;
      }
      this.syncGeometryObservers();
      this.overlay.position();
    });
  }

  private syncGeometryObservers(): void {
    if (!this.active || !this.active.isConnected) return;
    const visualAnchor = resolveEditorAnchor(this.active);
    if (visualAnchor === this.visualAnchor) return;
    this.resizeObserver.disconnect();
    this.intersectionObserver?.disconnect();
    this.resizeObserver.observe(this.active);
    if (visualAnchor !== this.active) this.resizeObserver.observe(visualAnchor);
    this.intersectionObserver?.observe(visualAnchor);
    this.visualAnchor = visualAnchor;
  }

  private observeActiveMutations(): void {
    this.mutationObserver.disconnect();
    if (!this.active) return;
    this.mutationObserver.observe(this.active, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    for (const node of this.activeLineage.slice(1, 5)) {
      if (!node.isConnected || !(node instanceof Element || node instanceof ShadowRoot)) continue;
      this.mutationObserver.observe(node, { childList: true });
    }
  }

  private adoptLiveEditor(element: SupportedElement): SupportedElement {
    if (element === this.active) return element;
    this.resizeObserver.disconnect();
    this.intersectionObserver?.disconnect();
    this.mutationObserver.disconnect();
    this.active = element;
    this.visualAnchor = null;
    this.activeLineage = composedLineage(element);
    this.lastKnownText = getElementText(element);
    this.observeActiveMutations();
    this.syncGeometryObservers();
    this.overlay.setTarget(element);
    return element;
  }

  private liveEditorForText(expectedText: string): SupportedElement | null {
    if (
      this.active?.isConnected &&
      isEligibleElement(this.active) &&
      getElementText(this.active) === expectedText
    ) {
      return this.active;
    }

    const focused = deepActiveElement();
    if (focused) {
      const focusedEditor = editableTargetForElement(focused);
      if (
        focusedEditor?.isConnected &&
        isEligibleElement(focusedEditor) &&
        getElementText(focusedEditor) === expectedText
      ) {
        return this.adoptLiveEditor(focusedEditor);
      }
    }

    for (const node of this.activeLineage.slice(1)) {
      if (!node.isConnected || !(node instanceof Element || node instanceof ShadowRoot)) {
        continue;
      }
      const matches = explicitEditorCandidates(node).filter(
        (candidate) =>
          candidate !== this.active &&
          candidate.isConnected &&
          isEligibleElement(candidate) &&
          getElementText(candidate) === expectedText,
      );
      if (matches.length === 1) return this.adoptLiveEditor(matches[0]!);
      if (matches.length > 1) return null;
    }
    return null;
  }

  private async settleLiveEditor(expectedText: string): Promise<SupportedElement | null> {
    await Promise.resolve();
    const immediate = this.liveEditorForText(expectedText);
    if (immediate) return immediate;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const afterPaint = this.liveEditorForText(expectedText);
    if (afterPaint) return afterPaint;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
    return this.liveEditorForText(expectedText);
  }
}
