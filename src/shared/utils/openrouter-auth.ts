import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { oAuthCreateAuthorizationUrl } from "@openrouter/sdk/funcs/oAuthCreateAuthorizationUrl.js";
import { oAuthCreateSHA256CodeChallenge } from "@openrouter/sdk/funcs/oAuthCreateSHA256CodeChallenge.js";
import { oAuthExchangeAuthCodeForAPIKey } from "@openrouter/sdk/funcs/oAuthExchangeAuthCodeForAPIKey.js";

import { OPENROUTER_APP } from "./openrouter-app";

const TOKEN_EXCHANGE_TIMEOUT_MS = 30_000;

function oauthClient(): OpenRouterCore {
  return new OpenRouterCore({
    ...OPENROUTER_APP,
    retryConfig: { strategy: "none" },
    timeoutMs: TOKEN_EXCHANGE_TIMEOUT_MS,
  });
}

async function exchangeCode(
  client: OpenRouterCore,
  code: string,
  verifier: string,
): Promise<string> {
  const result = await oAuthExchangeAuthCodeForAPIKey(client, {
    requestBody: {
      code,
      codeVerifier: verifier,
      codeChallengeMethod: "S256",
    },
  });
  if (!result.ok) {
    const message =
      result.error instanceof Error && result.error.message
        ? result.error.message
        : "OpenRouter key exchange failed.";
    throw new Error(message);
  }
  return result.value.key;
}

export async function authorizeOpenRouter(): Promise<string> {
  const client = oauthClient();
  const pkce = await oAuthCreateSHA256CodeChallenge();
  if (!pkce.ok) throw new Error("OpenRouter could not create a secure PKCE challenge.");

  const redirectUrl = chrome.identity.getRedirectURL("openrouter");
  const authorization = oAuthCreateAuthorizationUrl(client, {
    callbackUrl: redirectUrl,
    codeChallenge: pkce.value.codeChallenge,
    codeChallengeMethod: "S256",
  });
  if (!authorization.ok) throw new Error("OpenRouter could not create an authorization URL.");

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authorization.value,
    interactive: true,
  });

  if (!responseUrl) throw new Error("OAuth cancelled");

  const callback = new URL(responseUrl);
  const expectedCallback = new URL(redirectUrl);
  if (
    callback.origin !== expectedCallback.origin ||
    callback.pathname !== expectedCallback.pathname
  ) {
    throw new Error("OpenRouter returned an unexpected OAuth callback");
  }
  const params = callback.searchParams;
  const oauthError = params.get("error");
  if (oauthError) {
    throw new Error(params.get("error_description") ?? oauthError);
  }
  const code = params.get("code");
  if (!code) throw new Error("No authorization code in response");
  if (code.length > 4_096) throw new Error("OpenRouter returned an invalid authorization code");

  return exchangeCode(client, code, pkce.value.codeVerifier);
}
