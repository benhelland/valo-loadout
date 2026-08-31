import { RiotError } from "@/riot/errors";
import { riotFetch, AUTH_ORIGIN } from "@/riot/http";

// Riot OAuth 2.0 authorization-code flow. This replaced an earlier
// ssid-cookie-replay implementation after finding that the actively-maintained
// SkinPeek fork (github.com/mistralwz/Ministral) had moved to this - it is
// better on every axis that matters here:
//
//   * The user authenticates on Riot's own page and we receive an
//     authorization code, not a live session credential. A code is single-use
//     and expires in minutes, so a mis-paste has a tiny blast radius compared
//     to an `ssid` that stays valid for a week.
//   * `offline_access` yields a refresh token, so a link lasts indefinitely
//     instead of needing to be redone weekly.
//   * It's a standard OAuth grant rather than cookie replay.
//
// Still zero evasion: whatever challenge Riot puts up (CAPTCHA included) is
// solved by the user, on Riot's page, as themselves. We never see a password.

// Riot's own first-party client id, used as a public client (no secret). Same
// accepted tradeoff as the User-Agent in http.ts - it's what's required to
// speak this flow, not an extra evasion measure. See docs/RISKS.md.
const CLIENT_ID = "riot-client";

// The user is redirected here after signing in. Nothing listens on it - it's
// a well-known dead end whose only job is to put the authorization code into
// the address bar where the user can copy it. Standard for this pattern.
const REDIRECT_URI = "http://localhost/redirect";

const SCOPE = "openid link ban lol_region account offline_access";

export interface OAuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

/**
 * The URL to send the user to. `nonce` is caller-supplied so it can be random
 * per attempt rather than a constant.
 */
export function buildAuthorizeUrl(nonce: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    nonce,
  });
  return `${AUTH_ORIGIN}/authorize?${params.toString()}`;
}

// Authorization codes are opaque, but they end up in a POST body and a
// database, so they're constrained rather than trusted. Riot's are URL-safe
// token characters; anything outside that set means the paste is wrong.
const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;

/**
 * Accepts either the whole redirect URL the user landed on, or a bare code.
 * Users reliably paste the former, so parsing it properly is the difference
 * between "it just works" and a confusing failure.
 */
export function extractAuthorizationCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new RiotError("UNEXPECTED", "Paste the full address you were redirected to after signing in.");
  }

  let candidate: string | null = null;

  if (trimmed.includes("code=")) {
    try {
      // Parse against a base so a pasted path-only fragment still works.
      const url = new URL(trimmed, "http://localhost");
      candidate = url.searchParams.get("code");
    } catch {
      candidate = null;
    }
    // Fallback for values that aren't parseable as a URL (a stray space, a
    // truncated paste) but still clearly contain the parameter.
    if (!candidate) {
      candidate = /[?&]code=([^&\s]+)/.exec(trimmed)?.[1] ?? null;
    }
    if (candidate) {
      try {
        candidate = decodeURIComponent(candidate);
      } catch {
        // Leave it as-is; the pattern check below is the real gate.
      }
    }
  } else {
    // Assume the user pasted just the code.
    candidate = trimmed;
  }

  if (!candidate) {
    // A common failure: signing in but copying the *authorize* URL rather than
    // the one landed on. Say so instead of "invalid input".
    throw new RiotError(
      "UNEXPECTED",
      "That address doesn't contain a login code. Make sure you copied the address bar *after* signing in - it should contain `code=`.",
    );
  }

  if (!CODE_PATTERN.test(candidate)) {
    throw new RiotError("UNEXPECTED", "That login code doesn't look valid. Copy the whole address you were redirected to.");
  }

  return candidate;
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  return requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
    }),
    "Riot rejected that login code. Codes expire within a few minutes and can only be used once - start the link again.",
  );
}

export async function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  return requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
    "Your Riot login has expired. Link your account again to resume shop checks.",
  );
}

async function requestTokens(form: URLSearchParams, invalidGrantMessage: string): Promise<OAuthTokens> {
  const response = await riotFetch(`${AUTH_ORIGIN}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    rawBody: form.toString(),
  });

  if (!response.ok) {
    // `invalid_grant` is the definitive "this credential is dead" signal - a
    // consumed/expired code, or a refresh token that's been rotated out from
    // under us. Never retry it; the user has to link again.
    let errorCode: string | null = null;
    try {
      const body = (await response.json()) as { error?: string };
      errorCode = body.error ?? null;
    } catch {
      // Non-JSON error body - fall through to the generic message.
    }

    if (errorCode === "invalid_grant") {
      throw new RiotError("EXPIRED", invalidGrantMessage);
    }
    throw new RiotError("UNEXPECTED", `Riot refused to issue a session (${response.status}).`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
  };

  if (!data.access_token || !data.id_token || !data.refresh_token) {
    throw new RiotError("UNEXPECTED", "Riot's login response was missing expected tokens.");
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    // Riot rotates this on every use. Persisting the new one immediately is
    // mandatory - see the refresh lock in src/store-check/.
    refreshToken: data.refresh_token,
  };
}
