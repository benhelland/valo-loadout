import { RiotError } from "@/riot/errors";
import { riotFetch, AUTH_ORIGIN } from "@/riot/http";
import { exchangeCodeForTokens, refreshTokens, type OAuthTokens } from "@/riot/oauth";

// Builds a usable VALORANT session out of OAuth tokens. This subsystem never
// accepts, transmits, or stores a Riot password - see docs/ARCHITECTURE.md
// "Store-check subsystem detail" for why the documented password flow was
// abandoned (it now requires an hCaptcha token, which this project will not
// solve) and why OAuth replaced the interim ssid-cookie approach.

export interface RiotSession {
  accessToken: string;
  entitlementsToken: string;
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  region: string;
  /**
   * Riot rotates the refresh token on every use, so this is always a NEW
   * value that must replace the stored one. Failing to persist it means the
   * next refresh gets `invalid_grant` and the link dies.
   */
  refreshToken: string;
}

/** First-time link: trade the authorization code for a session. */
export async function createSessionFromCode(code: string): Promise<RiotSession> {
  return buildSession(await exchangeCodeForTokens(code));
}

/** Subsequent polls: trade the stored refresh token for a fresh session. */
export async function createSessionFromRefreshToken(refreshToken: string): Promise<RiotSession> {
  return buildSession(await refreshTokens(refreshToken));
}

async function buildSession(tokens: OAuthTokens): Promise<RiotSession> {
  const [{ puuid, gameName, tagLine }, entitlementsToken, region] = await Promise.all([
    fetchUserInfo(tokens.accessToken),
    fetchEntitlementsToken(tokens.accessToken),
    fetchRegion(tokens.accessToken, tokens.idToken),
  ]);

  return {
    accessToken: tokens.accessToken,
    entitlementsToken,
    puuid,
    gameName,
    tagLine,
    region,
    refreshToken: tokens.refreshToken,
  };
}

async function fetchUserInfo(accessToken: string): Promise<{ puuid: string; gameName: string | null; tagLine: string | null }> {
  const response = await riotFetch(`${AUTH_ORIGIN}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new RiotError("UNEXPECTED", `Could not read account info from Riot (${response.status}).`);
  }

  const data = (await response.json()) as { sub?: string; acct?: { game_name?: string; tag_line?: string } };
  if (!data.sub) {
    throw new RiotError("UNEXPECTED", "Riot's account info response was missing an account id.");
  }

  return {
    puuid: data.sub,
    gameName: data.acct?.game_name ?? null,
    tagLine: data.acct?.tag_line ?? null,
  };
}

async function fetchEntitlementsToken(accessToken: string): Promise<string> {
  const response = await riotFetch("https://entitlements.auth.riotgames.com/api/token/v1", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {},
  });
  if (!response.ok) {
    throw new RiotError("UNEXPECTED", `Riot refused to issue an entitlements token (${response.status}).`);
  }

  const data = (await response.json()) as { entitlements_token?: string };
  if (!data.entitlements_token) {
    throw new RiotError("UNEXPECTED", "Riot's entitlements response was missing a token.");
  }
  return data.entitlements_token;
}

// The storefront endpoint is shard-specific, so the account's live affinity
// has to be resolved before it can be called.
async function fetchRegion(accessToken: string, idToken: string): Promise<string> {
  const response = await riotFetch("https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { id_token: idToken },
  });
  if (!response.ok) {
    throw new RiotError("UNEXPECTED", `Could not determine your account's region (${response.status}).`);
  }

  const data = (await response.json()) as { affinities?: { live?: string } };
  const region = data.affinities?.live;
  if (!region) {
    throw new RiotError("UNEXPECTED", "Riot did not report a region for this account.");
  }
  return region;
}
