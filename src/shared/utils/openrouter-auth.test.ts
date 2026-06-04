import { beforeEach, describe, expect, test, vi } from "vitest";

import { authorizeOpenRouter } from "./openrouter-auth";

const values = new Map<string, unknown>();
let launchedUrl = "";

beforeEach(() => {
  values.clear();
  launchedUrl = "";
  const local = {
    get(key: string): Promise<Record<string, unknown>> {
      return Promise.resolve({ [key]: values.get(key) });
    },
    set(record: Record<string, unknown>): Promise<void> {
      for (const [key, value] of Object.entries(record)) values.set(key, value);
      return Promise.resolve();
    },
  };
  globalThis.chrome = {
    storage: { local },
    identity: {
      getRedirectURL: () => "https://extension-id.chromiumapp.org/openrouter",
      launchWebAuthFlow: ({ url }: { url: string }) => {
        launchedUrl = url;
        return Promise.resolve("https://extension-id.chromiumapp.org/openrouter?code=auth-code");
      },
    },
  } as unknown as typeof chrome;
});

describe("OpenRouter browser OAuth adapter", () => {
  test("uses PKCE S256 and returns the exchanged key", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      if (!(input instanceof Request)) throw new Error("Expected an SDK Request");
      const body = (await input.clone().json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        code: "auth-code",
        code_challenge_method: "S256",
      });
      expect(body["code_verifier"]).toEqual(expect.any(String));
      expect(input.url).toBe("https://openrouter.ai/api/v1/auth/keys");
      expect(input.method).toBe("POST");
      expect(input.headers.get("accept")).toBe("application/json");
      expect(input.headers.get("content-type")).toBe("application/json");
      expect(input.headers.get("http-referer")).toBe("https://localix.ai");
      expect(input.headers.get("x-openrouter-title")).toBe("Localix");
      expect(input.headers.get("x-openrouter-categories")).toBe("personal-agent,writing-assistant");
      expect(input.headers.has("authorization")).toBe(false);
      expect(input.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ key: "sk-test", user_id: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authorizeOpenRouter()).resolves.toBe("sk-test");

    const authorize = new URL(launchedUrl);
    expect(authorize.origin + authorize.pathname).toBe("https://openrouter.ai/auth");
    expect(authorize.searchParams.get("callback_url")).toBe(
      "https://extension-id.chromiumapp.org/openrouter",
    );
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/u);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("surfaces an authorization denial without calling the exchange endpoint", async () => {
    chrome.identity.launchWebAuthFlow = (): Promise<string> =>
      Promise.resolve(
        "https://extension-id.chromiumapp.org/openrouter?error=access_denied&error_description=No",
      );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(authorizeOpenRouter()).rejects.toThrow("No");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects a malformed successful exchange through SDK validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))),
    );

    await expect(authorizeOpenRouter()).rejects.toThrow();
  });

  test("surfaces a structured key-exchange error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: "Code expired" } }), {
            status: 403,
          }),
        ),
      ),
    );

    await expect(authorizeOpenRouter()).rejects.toThrow("Code expired");
  });

  test("rejects a callback without an authorization code", async () => {
    chrome.identity.launchWebAuthFlow = (): Promise<string> =>
      Promise.resolve("https://extension-id.chromiumapp.org/openrouter");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(authorizeOpenRouter()).rejects.toThrow("No authorization code");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects a callback outside the Chrome identity redirect", async () => {
    chrome.identity.launchWebAuthFlow = (): Promise<string> =>
      Promise.resolve("https://attacker.example/openrouter?code=auth-code");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(authorizeOpenRouter()).rejects.toThrow("unexpected OAuth callback");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects an oversized authorization code before the exchange", async () => {
    chrome.identity.launchWebAuthFlow = (): Promise<string> =>
      Promise.resolve(`https://extension-id.chromiumapp.org/openrouter?code=${"x".repeat(4_097)}`);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(authorizeOpenRouter()).rejects.toThrow("invalid authorization code");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
