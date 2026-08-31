import { RiotError } from "@/riot/errors";
import { riotFetch, AUTH_ORIGIN } from "@/riot/http";

// Cookie reauth only. This subsystem never accepts, transmits, or stores a
// Riot password - see docs/ARCHITECTURE.md "Riot account linking" for why the
// password flow was abandoned (it now requires an hCaptcha token, which this
// project will not solve). CLAUDE.md already named this the better option:
// "use cookie/token-based re-auth so the password is never touched by our
// servers at all".

// Matches the redirect the web client uses. `nonce=1` mirrors the reference
// implementations; nothing here depends on its unpredictability.
const REAUTH_URL =
  `${AUTH_ORIGIN}/authorize` +
  `?redirect_uri=${encodeURIComponent("https://playvalorant.com/opt_in")}` +
  `&client_id=play-valorant-web-prod` +
  `&response_type=${encodeURIComponent("token id_token")}` +
  `&nonce=1` +
  `&scope=${encodeURIComponent("account openid")}`;

export interface RiotSession {
  accessToken: string;
  idToken: string;
  entitlementsToken: string;
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  region: string;
  /**
   * Riot sometimes issues a fresh `ssid` on reauth. When it does, persisting
   * the new value rolls the session forward instead of letting the original
   * age out - the difference between re-linking every week and staying linked.
   * Null when Riot didn't rotate it.
   */
  refreshedSsid: string | null;
}

/**
 * Exchanges a stored `ssid` cookie for a full set of short-lived tokens.
 * Throws RiotError with an actionable `kind` on every failure path.
 */
export async function createSessionFromSsid(ssid: string): Promise<RiotSession> {
  const { accessToken, idToken, refreshedSsid } = await reauth(ssid);
  const [{ puuid, gameName, tagLine }, entitlementsToken, region] = await Promise.all([
    fetchUserInfo(accessToken),
    fetchEntitlementsToken(accessToken),
    fetchRegion(accessToken, idToken),
  ]);

  return { accessToken, idToken, entitlementsToken, puuid, gameName, tagLine, region, refreshedSsid };
}

async function reauth(ssid: string): Promise<{ accessToken: string; idToken: string; refreshedSsid: string | null }> {
  const response = await riotFetch(REAUTH_URL, {
    cookie: `ssid=${ssid}`,
    redirect: "manual",
  });

  const location = response.headers.get("location");
  if (!location) {
    throw new RiotError(
      "UNEXPECTED",
      "Riot's login service responded in a way we didn't recognise. This usually means their API changed.",
    );
  }

  // Riot signals "this session is dead" by redirecting to the login page
  // instead of back to the redirect_uri with tokens attached.
  if (location.includes("authenticate.riotgames.com") || location.includes("/login")) {
    throw new RiotError("EXPIRED", "Your Riot session has expired. Link your account again to keep shop checks running.");
  }

  // Tokens arrive in the URL *fragment*, not the query string. Never log this
  // value - see redactUrl() in http.ts.
  let fragment: string;
  try {
    fragment = new URL(location).hash.slice(1);
  } catch {
    throw new RiotError("UNEXPECTED", "Riot's login service returned an unreadable redirect.");
  }

  const params = new URLSearchParams(fragment);
  const accessToken = params.get("access_token");
  const idToken = params.get("id_token");

  if (!accessToken || !idToken) {
    // An error code can legitimately appear here; it's Riot's own short slug
    // (e.g. "access_denied"), never a credential, so it's safe to surface.
    const error = params.get("error");
    if (error) {
      throw new RiotError("EXPIRED", `Riot rejected the stored session (${error}). Link your account again.`);
    }
    throw new RiotError("EXPIRED", "Riot did not return a usable session. Link your account again.");
  }

  return { accessToken, idToken, refreshedSsid: extractSsid(response) };
}

// getSetCookie() returns each Set-Cookie separately; a plain get() would
// collapse them and mangle any cookie whose value contains a comma.
function extractSsid(response: Response): string | null {
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== "ssid") continue;

    const value = pair.slice(separator + 1).trim();
    // Riot clears a cookie by setting it to an empty/placeholder value on
    // logout; treat that as "nothing to roll forward", not a new session.
    if (value && value !== "deleted") return value;
  }
  return null;
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
