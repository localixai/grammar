import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

let context: BrowserContext;
let profile = "";
let extensionId: string;
let grammarRequestCount = 0;
let lastGrammarRequest = "";
let lastGrammarHeaders: Record<string, string> = {};
let modelRequestCount = 0;
let lastModelRequest = "";
let lastModelHeaders: Record<string, string> = {};
let lastKeyAuthorization = "";
let lastKeyHeaders: Record<string, string> = {};
let unhandledBrowserErrors: string[] = [];

test.describe.configure({ mode: "serial" });

function submittedText(requestBody: string): string {
  try {
    const payload = JSON.parse(requestBody) as {
      messages?: Array<{ role?: unknown; content?: unknown }>;
    };
    const content = payload.messages?.find((message) => message.role === "user")?.content;
    if (typeof content !== "string") return "";
    const jsonLine = content.slice(content.lastIndexOf("\n") + 1);
    const value = JSON.parse(jsonLine) as { text?: unknown };
    return typeof value.text === "string" ? value.text : "";
  } catch {
    return "";
  }
}

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
  expect(serious).toEqual([]);
}

async function captureUi(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (process.env["LOCALIX_CAPTURE_UI"] !== "1") return;
  const path = testInfo.outputPath(`${name}.png`);
  if (name.startsWith("grammar-popup")) {
    await page.locator(".shell").screenshot({ path });
  } else {
    await page.screenshot({ path });
  }
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), "localix-grammar-"));
  const extensionPath = resolve("dist");
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  context.on("weberror", (webError) => {
    const location = webError.location();
    unhandledBrowserErrors.push(`${location.url}:${location.line}:${webError.error().message}`);
  });
  await context.route("https://openrouter.ai/api/v1/key", async (route) => {
    lastKeyHeaders = route.request().headers();
    lastKeyAuthorization = lastKeyHeaders["authorization"] ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          byok_usage: 0,
          byok_usage_daily: 0,
          byok_usage_monthly: 0,
          byok_usage_weekly: 0,
          creator_user_id: "e2e-user",
          expires_at: null,
          include_byok_in_limit: false,
          is_free_tier: false,
          is_management_key: false,
          is_provisioning_key: false,
          label: "Localix E2E",
          limit: null,
          limit_remaining: null,
          limit_reset: null,
          rate_limit: { interval: "10s", note: "", requests: -1 },
          usage: 0,
          usage_daily: 0,
          usage_monthly: 0,
          usage_weekly: 0,
        },
      }),
    });
  });
  await context.route(/https:\/\/openrouter\.ai\/api\/v1\/models(?:\?.*)?$/u, async (route) => {
    modelRequestCount += 1;
    lastModelRequest = route.request().url();
    lastModelHeaders = route.request().headers();
    const model = (id: string, name: string, prompt: string, completion: string) => ({
      id,
      canonical_slug: id,
      name,
      created: 0,
      description: "E2E model fixture",
      context_length: 400_000,
      architecture: {
        modality: "text->text",
        input_modalities: ["text"],
        output_modalities: ["text"],
      },
      pricing: { prompt, completion },
      top_provider: {
        context_length: 400_000,
        max_completion_tokens: 128_000,
        is_moderated: false,
      },
      per_request_limits: null,
      supported_parameters: ["tools", "tool_choice", "max_completion_tokens"],
      default_parameters: null,
      supported_voices: null,
      links: { details: `https://openrouter.ai/${id}` },
    });
    const data = [
      model(
        "deepseek/deepseek-v4-flash-0731",
        "DeepSeek: DeepSeek V4 Flash",
        "0.00000009",
        "0.00000018",
      ),
      model("openai/gpt-5.4-mini", "OpenAI: GPT-5.4 Mini", "0.00000075", "0.0000045"),
      model("openai/gpt-5.4-nano", "OpenAI: GPT-5.4 Nano", "0.0000002", "0.00000125"),
      model("openai/gpt-5.4", "OpenAI: GPT-5.4", "0.0000025", "0.000015"),
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, links: { next: null }, total_count: data.length }),
    });
  });
  await context.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
    grammarRequestCount += 1;
    lastGrammarRequest = route.request().postData() ?? "";
    lastGrammarHeaders = route.request().headers();
    const text = submittedText(lastGrammarRequest);
    if (text.includes("Provider failure")) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: 404, message: "No compatible OpenRouter endpoint is available." },
        }),
      });
      return;
    }
    const offset = text.indexOf("are");
    const correctedText =
      text === "helo how are you what are you doing ?"
        ? "Hello, how are you? What are you doing?"
        : offset === -1
          ? text
          : `${text.slice(0, offset)}is${text.slice(offset + 3)}`;
    const argumentsJson = JSON.stringify({ correctedText });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "grammar-e2e",
        object: "chat.completion",
        created: 0,
        model: "openai/gpt-5.4-mini",
        system_fingerprint: null,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "grammar-report",
                  type: "function",
                  function: {
                    name: "report_corrected_text",
                    arguments: argumentsJson,
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    });
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  extensionId = new URL(worker.url()).host;
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      openrouterApiKey: "e2e-placeholder",
      preferences: {
        model: "",
        enabled: true,
        autoCheck: false,
        checkDelayMs: 1200,
        disabledSites: [],
        theme: "dark",
      },
    });
  });
});

test.beforeEach(() => {
  unhandledBrowserErrors = [];
});

test.afterEach(() => {
  expect(unhandledBrowserErrors).toEqual([]);
});

test.afterAll(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});

test("runs OpenRouter SDK checks, caches decisions, preserves rich text, and skips sensitive fields", async ({}, testInfo) => {
  grammarRequestCount = 0;
  lastGrammarRequest = "";
  lastGrammarHeaders = {};
  modelRequestCount = 0;
  lastModelRequest = "";
  const page = await context.newPage();
  await page.goto("/editor.html");
  await page.locator("#editor").focus();
  const root = page.locator("localix-grammar-root");
  await expect(root).toHaveCount(1);
  await expect(root.locator(".trigger")).toBeVisible();
  await expect(root.locator(".trigger")).toHaveCSS("width", "24px");
  await expect(root.locator(".trigger")).toHaveCSS("height", "24px");

  await page.evaluate(() => {
    document
      .querySelector("localix-grammar-root")
      ?.shadowRoot?.querySelector<HTMLButtonElement>(".trigger")
      ?.click();
  });
  await page.waitForTimeout(100);
  expect(grammarRequestCount).toBe(0);
  await expect(root.locator(".panel")).toBeHidden();

  await root.locator(".trigger").click();
  await expect(root.getByText("Choose a model from the Localix Grammar popup.")).toBeVisible();
  expect(grammarRequestCount).toBe(0);

  const setupPopup = await context.newPage();
  await setupPopup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await expect(setupPopup.locator("#modelName")).toHaveText("Choose a model");
  await expect(setupPopup.locator("#modelId")).toHaveText("Required before checking");
  await setupPopup.locator("#modelButton").click();
  await setupPopup.locator("#modelSearch").fill("openai/gpt-5.4-mini");
  await setupPopup.locator(".model-item", { hasText: "openai/gpt-5.4-mini" }).click();
  await setupPopup.close();

  await root.locator(".trigger").click();
  await expect(root.getByText("1 improvement", { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-overlay");
  expect(grammarRequestCount).toBe(1);
  expect(lastGrammarRequest).toContain("The expected language is en.");
  const requestPayload = JSON.parse(lastGrammarRequest) as {
    model?: unknown;
    stream?: unknown;
    max_completion_tokens?: unknown;
    tools?: Array<{
      function?: { name?: unknown; strict?: unknown; parameters?: Record<string, unknown> };
    }>;
  };
  expect(requestPayload).toMatchObject({
    model: "openai/gpt-5.4-mini",
    stream: false,
    max_completion_tokens: 2_000,
  });
  expect(requestPayload).not.toHaveProperty("parallel_tool_calls");
  expect(requestPayload).not.toHaveProperty("provider");
  expect(requestPayload.tools?.[0]?.function?.name).toBe("report_corrected_text");
  expect(requestPayload.tools?.[0]?.function?.strict).toBe(true);
  expect(requestPayload.tools?.[0]?.function?.parameters?.["additionalProperties"]).toBe(false);
  expect(requestPayload).not.toHaveProperty("tool_choice");
  expect(lastGrammarHeaders["authorization"]).toBe("Bearer e2e-placeholder");
  expect(lastGrammarHeaders["http-referer"]).toBe("https://localix.ai");
  expect(lastGrammarHeaders["x-openrouter-title"]).toBe("Localix");
  expect(lastGrammarHeaders["x-openrouter-categories"]).toBe("personal-agent,writing-assistant");
  expect(lastGrammarRequest).not.toContain("127.0.0.1");
  expect(lastGrammarRequest).not.toContain("e2e-placeholder");

  const duplicatePage = await context.newPage();
  await duplicatePage.goto("/editor.html");
  await duplicatePage.locator("#editor").focus();
  const duplicateRoot = duplicatePage.locator("localix-grammar-root");
  await duplicateRoot.locator(".trigger").click();
  await expect(duplicateRoot.getByText("1 improvement", { exact: true })).toBeVisible();
  expect(grammarRequestCount).toBe(1);
  await duplicatePage.close();

  const themePopup = await context.newPage();
  await themePopup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await expect.poll(() => modelRequestCount).toBe(1);
  const modelRequestUrl = new URL(lastModelRequest);
  expect(modelRequestUrl.searchParams.get("limit")).toBe("1000");
  expect(modelRequestUrl.searchParams.get("output_modalities")).toBe("text");
  expect(modelRequestUrl.searchParams.get("supported_parameters")).toBe("tools");
  expect(lastModelHeaders["http-referer"]).toBe("https://localix.ai");
  expect(lastModelHeaders["x-openrouter-title"]).toBe("Localix");
  expect(lastModelHeaders["x-openrouter-categories"]).toBe("personal-agent,writing-assistant");
  await themePopup.locator("#themeButton").click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-overlay-light");
  await themePopup.locator("#themeButton").click();
  await themePopup.locator("#themeButton").click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await themePopup.close();

  await root.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(page.locator("#editor")).toHaveValue("This is a test sentence.");
  await expect(root.locator(".panel")).toBeHidden();
  await root.locator(".trigger").click();
  await expect(root.getByText("No clear issues found")).toBeVisible();
  expect(grammarRequestCount).toBe(1);

  await page.locator("#rich").focus();
  await expect(root.locator(".panel")).toBeHidden();
  await root.locator(".trigger").click();
  await expect(root.getByText("1 improvement", { exact: true })).toBeVisible();
  expect(grammarRequestCount).toBe(2);
  await root.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(page.locator("#rich")).toHaveText("This is rich text.");
  await expect(page.locator("#rich strong")).toHaveText("This");
  await expect(root.locator(".panel")).toBeHidden();
  await root.locator(".trigger").click();
  await expect(root.getByText("No clear issues found")).toBeVisible();
  expect(grammarRequestCount).toBe(2);

  const frame = page.frameLocator("#frame");
  await frame.locator("#frame-editor").focus();
  const frameRoot = frame.locator("localix-grammar-root");
  await expect(frameRoot).toHaveCount(1);
  await expect(frameRoot.locator(".trigger")).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  const concurrentPreferences = await popup.evaluate(
    () =>
      new Promise<{ checkDelayMs?: number; theme?: string }>((resolve, reject) => {
        const send = (payload: Record<string, unknown>): Promise<void> =>
          new Promise((resolveMessage, rejectMessage) => {
            chrome.runtime.sendMessage(
              { type: "SET_SETTINGS", payload },
              (response: { success?: boolean; error?: string } | undefined) => {
                if (chrome.runtime.lastError) {
                  rejectMessage(new Error(chrome.runtime.lastError.message));
                } else if (!response?.success) {
                  rejectMessage(new Error(response?.error ?? "Could not save preferences"));
                } else {
                  resolveMessage();
                }
              },
            );
          });
        void Promise.all([send({ checkDelayMs: 700 }), send({ theme: "light" })])
          .then(async () => {
            const stored = await chrome.storage.local.get("preferences");
            const preferences = stored["preferences"] as {
              checkDelayMs?: number;
              theme?: string;
            };
            await send({ checkDelayMs: 1_200, theme: "dark" });
            resolve(preferences);
          })
          .catch(reject);
      }),
  );
  expect(concurrentPreferences).toMatchObject({ checkDelayMs: 700, theme: "light" });
  await popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const fixtureTab = tabs.find((tab) => tab.url?.includes("127.0.0.1:4179/editor.html"));
    if (fixtureTab?.id === undefined) throw new Error("Editor fixture tab was not found");
    await chrome.tabs.update(fixtureTab.id, { active: true });
  });
  await popup.reload();
  await expect(popup.locator("#siteSetting")).toBeVisible();
  await expect(popup.locator("#siteTitle")).toHaveText("127.0.0.1");
  await expectNoSeriousAccessibilityViolations(popup);
  await captureUi(popup, testInfo, "grammar-popup-site");
  await popup.locator("#siteToggle").uncheck();
  await expect(root.locator(".trigger")).toBeHidden();
  await expect(frameRoot.locator(".trigger")).toBeHidden();
  await popup.locator("#siteToggle").check();
  await expect(root.locator(".trigger")).toBeVisible();
  await expect(frameRoot.locator(".trigger")).toBeVisible();

  await popup.locator("#enabledToggle").uncheck();
  await expect(frameRoot.locator(".trigger")).toBeHidden();
  await popup.locator("#enabledToggle").check();
  await expect(frameRoot.locator(".trigger")).toBeVisible();

  await popup.locator("#modelButton").click();
  await popup.locator("#modelSearch").fill("openai/gpt-5.4-nano");
  await popup.locator(".model-item", { hasText: "openai/gpt-5.4-nano" }).click();
  await page.locator("#rich").focus();
  await expect(root.locator(".panel")).toBeHidden();
  await root.locator(".trigger").click();
  await expect(root.getByText("No clear issues found")).toBeVisible();
  expect(grammarRequestCount).toBe(3);

  await popup.locator("#modelButton").click();
  await popup.locator("#modelSearch").fill("openai/gpt-5.4-mini");
  await popup.locator(".model-item", { hasText: "openai/gpt-5.4-mini" }).click();
  await popup.locator("#autoCheckToggle").check();
  await popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const fixtureTab = tabs.find((tab) => tab.url?.includes("127.0.0.1:4179/editor.html"));
    if (fixtureTab?.id === undefined) throw new Error("Editor fixture tab was not found");
    await chrome.tabs.update(fixtureTab.id, { active: true });
  });

  await page.locator("#rich").fill("This are automatic text.");
  await expect(root.getByText("1 improvement", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  expect(grammarRequestCount).toBe(4);
  await root.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(page.locator("#rich")).toHaveText("This is automatic text.");
  await expect(root.locator(".panel")).toBeHidden();

  const requestsBeforeSyntheticInput = grammarRequestCount;
  await page.locator("#rich").evaluate((element) => {
    element.textContent = "This are script-generated text.";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  });
  await page.waitForTimeout(1_400);
  expect(grammarRequestCount).toBe(requestsBeforeSyntheticInput);

  await page.locator("#rich").fill("This are cancelled automatic text.");
  const requestsBeforeAutoOff = grammarRequestCount;
  await popup.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "SET_SETTINGS", payload: { autoCheck: false } },
          (response: { success?: boolean; error?: string } | undefined) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response?.success) {
              reject(new Error(response?.error ?? "Could not disable automatic checking"));
            } else {
              resolve();
            }
          },
        );
      }),
  );
  await page.waitForTimeout(1_400);
  expect(grammarRequestCount).toBe(requestsBeforeAutoOff);
  await popup.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "SET_SETTINGS", payload: { autoCheck: true } },
          (response: { success?: boolean; error?: string } | undefined) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response?.success) {
              reject(new Error(response?.error ?? "Could not enable automatic checking"));
            } else {
              resolve();
            }
          },
        );
      }),
  );
  await popup.locator("#modelButton").click();
  await popup.locator("#modelSearch").fill("openai/gpt-5.4-mini");
  await popup.locator(".model-item", { hasText: "openai/gpt-5.4-mini" }).click();
  await popup.close();

  await page.locator("#rich").fill("This are pending text.");
  const requestsBeforeBlur = grammarRequestCount;
  await page.locator("h1").click();
  await expect(root.locator(".trigger")).toBeHidden();
  await page.waitForTimeout(1_400);
  expect(grammarRequestCount).toBe(requestsBeforeBlur);

  await page.locator("#secret").focus();
  await expect(root.locator(".trigger")).toBeHidden();

  await page.locator("#editor").fill("word ".repeat(4_001));
  await page.locator("#editor").focus();
  const requestsBeforeOversizedCheck = grammarRequestCount;
  await root.locator(".trigger").click();
  await expect(root.getByText("Text is too long", { exact: false })).toBeVisible();
  expect(grammarRequestCount).toBe(requestsBeforeOversizedCheck);

  const shadowEditor = page.locator("#shadow-editor-host").locator("textarea");
  await shadowEditor.focus();
  await expect(root.locator(".trigger")).toBeVisible();
  await root.locator(".trigger").click();
  await expect(root.getByText("1 improvement", { exact: true })).toBeVisible();
  expect(grammarRequestCount).toBe(5);
  await root.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(shadowEditor).toHaveValue("This is shadow text.");
  await expect(root.locator(".panel")).toBeHidden();

  await page.locator("#blocked-shadow-host").locator("textarea").focus();
  await expect(root.locator(".trigger")).toBeHidden();

  await page.locator("#rich").focus();
  await expect(root.locator(".trigger")).toBeVisible();
  await expect(root).toHaveCount(1);
  await root.locator(".trigger").click();
  await expect(root.locator(".panel")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(root.locator(".trigger")).toBeHidden();
  await expect(root.locator(".panel")).toBeHidden();
  await page.locator("#rich").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(root.locator(".trigger")).toBeVisible();

  await page.locator("#rich").fill("Detached are editor text.");
  const requestsBeforeRemoval = grammarRequestCount;
  await page.locator("#rich").evaluate((element) => element.remove());
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect(root.locator(".trigger")).toBeHidden();
  await page.waitForTimeout(1_400);
  expect(grammarRequestCount).toBe(requestsBeforeRemoval);
  await page.close();
});

test("renders the connected popup with the OpenRouter model catalog", async ({}, testInfo) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await expect(page.getByText("OpenRouter connected")).toBeVisible();
  await expect(page.getByText("Direct connection")).toBeVisible();
  await expect(page.locator("#modelId")).toHaveText("openai/gpt-5.4-mini");
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-popup");

  await page.locator("#themeButton").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-popup-light");

  await page.locator("#modelButton").click();
  await expect(page.getByRole("region", { name: "Available models" })).toBeVisible();
  await expect(page.locator("#modelSearch")).toBeFocused();
  await expect(page.locator(".model-item").first().locator(".model-cost")).toContainText("/ 1M");
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-popup-models");
  await page.locator("#modelSearch").fill("openai/gpt-5.4-nano");
  await page.locator(".model-item", { hasText: "openai/gpt-5.4-nano" }).click();
  await expect(page.locator("#modelId")).toHaveText("openai/gpt-5.4-nano");
  await expect(page.locator("#modelButton")).toBeFocused();

  await page.locator("#modelButton").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settingsView")).toBeVisible();
  await expect(page.locator("#modelButton")).toBeFocused();
  await page.locator("#modelButton").click();
  await page.locator("#modelSearch").fill("openai/gpt-5.4-mini");
  await page.locator(".model-item", { hasText: "openai/gpt-5.4-mini" }).click();
  await page.locator("#themeButton").click();
  await page.locator("#themeButton").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.close();
});

test("applies spelling and punctuation as one complete batch", async ({}, testInfo) => {
  const page = await context.newPage();
  await page.goto("/editor.html");
  const editor = page.locator("#editor");
  await editor.fill("helo how are you what are you doing ?");
  await editor.focus();
  const root = page.locator("localix-grammar-root");
  await root.locator(".trigger").click();

  await expect(root.getByText("3 improvements", { exact: true })).toBeVisible();
  await expect(root.locator(".corrected-preview")).toHaveText(
    "Hello, how are you? What are you doing?",
  );
  await expect(root.locator(".correction")).toHaveCount(2);
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-overlay-batch");
  const requestsAfterCheck = grammarRequestCount;
  await root.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(editor).toHaveValue("Hello, how are you? What are you doing?");
  await expect(root.locator(".panel")).toBeHidden();

  await root.locator(".trigger").click();
  await expect(root.getByText("No clear issues found")).toBeVisible();
  expect(grammarRequestCount).toBe(requestsAfterCheck);
  await page.close();
});

test("retargets a controlled rich editor across check, apply, and repeated input", async () => {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error("Extension service worker is unavailable");
  await worker.evaluate(async () => {
    const stored = await chrome.storage.local.get("preferences");
    const preferences = (stored["preferences"] ?? {}) as Record<string, unknown>;
    await chrome.storage.local.set({
      preferences: { ...preferences, model: "openai/gpt-5.4-mini" },
    });
  });
  const page = await context.newPage();
  await page.goto("/editor.html");
  const editor = page.locator("#reactive-editor");
  const root = page.locator("localix-grammar-root");
  await editor.focus();
  await page.evaluate(() => {
    (
      window as Window & {
        replaceReactiveEditor?: () => HTMLElement | null;
      }
    ).replaceReactiveEditor?.();
  });
  await expect(root.locator(".trigger")).toBeVisible();
  const triggerBefore = await root.locator(".trigger").boundingBox();

  await root.locator(".trigger").click();

  await expect(root.getByText("1 improvement", { exact: true })).toBeVisible();
  await expect(editor).toHaveCount(1);
  const triggerAfter = await root.locator(".trigger").boundingBox();
  expect(triggerBefore).not.toBeNull();
  expect(triggerAfter).not.toBeNull();
  expect(Math.abs(triggerAfter!.x - triggerBefore!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(triggerAfter!.y - triggerBefore!.y)).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { reactiveEditorReplacements?: number }).reactiveEditorReplacements ||
        0,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { reactiveEditorPointerLeaks?: number }).reactiveEditorPointerLeaks ||
        0,
    ),
  ).toBe(0);
  await root.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(editor).toHaveText("This is reactive text.");
  await expect(root.locator(".panel")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { reactiveEditorReplacements?: number }).reactiveEditorReplacements ||
        0,
    ),
  ).toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { reactiveEditorPointerLeaks?: number }).reactiveEditorPointerLeaks ||
        0,
    ),
  ).toBe(0);

  await editor.fill("This are repeated text.");
  await expect(root.locator(".trigger")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { reactiveEditorReplacements?: number }).reactiveEditorReplacements ||
        0,
    ),
  ).toBe(3);
  await root.locator(".trigger").click();
  await expect(root.getByText("1 improvement", { exact: true })).toBeVisible();

  const spellcheckOff = page.locator("#browser-spellcheck-off");
  await spellcheckOff.focus();
  await expect(root.locator(".trigger")).toBeVisible();
  await page.close();
});

test("anchors painted content to its clipped visual surface without editor-specific rules", async ({}, testInfo) => {
  const page = await context.newPage();
  await page.goto("/editor.html");
  const editor = page.locator("#complex-editor");
  const scroller = page.locator("#complex-editor-scroll");
  const root = page.locator("localix-grammar-root");
  await editor.focus();
  await expect(root.locator(".trigger")).toBeVisible();

  const alignment = async (): Promise<{ rightGap: number; bottomGap: number }> =>
    page.evaluate(() => {
      const trigger = document
        .querySelector("localix-grammar-root")
        ?.shadowRoot?.querySelector<HTMLElement>(".trigger");
      const surface = document.querySelector<HTMLElement>("#complex-editor-surface");
      const clip = document.querySelector<HTMLElement>("#complex-editor-scroll");
      if (!trigger || !surface || !clip) throw new Error("Nested editor fixture is unavailable");
      const triggerRect = trigger.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      const clipRect = clip.getBoundingClientRect();
      return {
        rightGap: Math.min(surfaceRect.right, clipRect.right) - triggerRect.right,
        bottomGap: Math.min(surfaceRect.bottom, clipRect.bottom) - triggerRect.bottom,
      };
    });

  await expect.poll(alignment).toEqual({ rightGap: 6, bottomGap: 6 });
  await scroller.evaluate((element) => {
    element.scrollTop = 90;
  });
  await expect.poll(alignment).toEqual({ rightGap: 6, bottomGap: 6 });

  await root.locator(".trigger").click();
  await expect(root.getByText("1 improvement", { exact: true })).toBeVisible();
  const panel = await root.locator(".panel").boundingBox();
  const viewport = page.viewportSize();
  expect(panel).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(panel!.x).toBeGreaterThanOrEqual(8);
  expect(panel!.y).toBeGreaterThanOrEqual(8);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport!.width - 8);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport!.height - 8);
  await captureUi(page, testInfo, "grammar-overlay-complex-editor");
  await page.close();
});

test("always leaves the checking state when OpenRouter rejects a model request", async () => {
  const page = await context.newPage();
  await page.goto("/editor.html");
  await page.locator("#editor").fill("Provider failure test.");
  await page.locator("#editor").focus();
  const root = page.locator("localix-grammar-root");
  await root.locator(".trigger").click();

  await expect(root.getByText("Could not check this text")).toBeVisible();
  await expect(root.getByText("No compatible OpenRouter endpoint is available.")).toBeVisible();
  await expect(root.getByText("Checking your writing…")).toBeHidden();
  await expect(root.locator(".trigger")).toBeEnabled();
  await page.close();
});

test("disconnects and reconnects with a manually supplied API key", async ({}, testInfo) => {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error("Extension service worker is unavailable");

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await expect(page.getByText("OpenRouter connected")).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("heading", { name: "Your model. Your writing." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with OpenRouter" })).toBeVisible();
  await expect(page.getByText("Localix runs no proxy and stores no writing.")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Localix Grammar" })).toBeVisible();
  await expect(page.locator("#themeButton")).toBeVisible();
  await expect(page.locator("#apiKeyInput")).toBeHidden();
  const storedKey = await worker.evaluate(
    async () => (await chrome.storage.local.get("openrouterApiKey"))["openrouterApiKey"],
  );
  expect(storedKey).toBeUndefined();
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-popup-connect");

  await page.getByRole("button", { name: "Use API key" }).click();
  const apiKeyInput = page.getByLabel("OpenRouter API key");
  await expect(apiKeyInput).toBeFocused();
  await expect(apiKeyInput).toHaveAttribute("type", "password");
  await expectNoSeriousAccessibilityViolations(page);
  await captureUi(page, testInfo, "grammar-popup-token");
  await page.getByRole("button", { name: "Show API key" }).click();
  await expect(apiKeyInput).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide API key" }).click();
  await apiKeyInput.fill("sk-or-v1-e2e-manual-key");
  await page.getByRole("button", { name: "Connect with API key" }).click();
  await expect(page.getByText("OpenRouter connected")).toBeVisible();
  expect(lastKeyAuthorization).toBe("Bearer sk-or-v1-e2e-manual-key");
  expect(lastKeyHeaders["http-referer"]).toBe("https://localix.ai");
  expect(lastKeyHeaders["x-openrouter-title"]).toBe("Localix");
  expect(lastKeyHeaders["x-openrouter-categories"]).toBe("personal-agent,writing-assistant");
  await expect
    .poll(() =>
      worker.evaluate(
        async () => (await chrome.storage.local.get("openrouterApiKey"))["openrouterApiKey"],
      ),
    )
    .toBe("sk-or-v1-e2e-manual-key");
  await expectNoSeriousAccessibilityViolations(page);
  await page.close();

  await worker.evaluate(() => chrome.storage.local.set({ openrouterApiKey: "e2e-placeholder" }));
});
