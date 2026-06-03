import { saveSettings } from "./storage";

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function computeS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }

  const { key } = (await res.json()) as { key: string };
  return key;
}

export async function initiateOAuth(): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await computeS256Challenge(verifier);
  const redirectUrl = chrome.identity.getRedirectURL("openrouter");

  const authUrl = `https://openrouter.ai/auth?${new URLSearchParams({
    callback_url: redirectUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString()}`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!responseUrl) throw new Error("OAuth cancelled");

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("No authorization code in response");

  const apiKey = await exchangeCode(code, verifier);
  await saveSettings({ apiKey });
}
