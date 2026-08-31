import { RiotError } from "@/riot/errors";
import { riotFetch } from "@/riot/http";
import type { RiotSession } from "@/riot/auth";

// Data minimization (docs/ARCHITECTURE.md): this reads the daily skin
// rotation and nothing else. The storefront response also contains bundles,
// the night market, accessories and Radianite offers - all deliberately
// ignored and never persisted, because no feature needs them yet.

export interface DailyShop {
  /**
   * The four rotating offers. These are skin *level* UUIDs, not skin UUIDs -
   * mapping them to skins is the caller's job (see src/store-check/), which
   * keeps this module free of any database dependency.
   */
  offerIds: string[];
  /** Seconds until this rotation is replaced. Drives nextPollAt. */
  resetInSeconds: number;
}

// Identifies the caller as the PC client. Same accepted tradeoff as the User-
// Agent in http.ts - required to speak the endpoint's protocol, not an extra
// evasion measure.
const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: "PC",
    platformOS: "Windows",
    platformOSVersion: "10.0.19042.1.256.64bit",
    platformChipset: "Unknown",
  }),
).toString("base64");

// X-Riot-ClientVersion has to be roughly current or the endpoint rejects the
// call. Hardcoding it guarantees a silent breakage every patch, so it's
// pulled from valorant-api.com - which this project already depends on for
// the catalog, so it's not a new dependency. Cached per process; a stale-but-
// working value is much better than failing the whole shop check because the
// version lookup blipped.
let cachedClientVersion: string | null = null;

async function getClientVersion(): Promise<string> {
  if (cachedClientVersion) return cachedClientVersion;

  const base = process.env.VALORANT_API_BASE_URL ?? "https://valorant-api.com/v1";
  try {
    const response = await fetch(`${base}/version`, { signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
      const body = (await response.json()) as { data?: { riotClientVersion?: string } };
      if (body.data?.riotClientVersion) {
        cachedClientVersion = body.data.riotClientVersion;
        return cachedClientVersion;
      }
    }
  } catch {
    // fall through to the error below
  }

  throw new RiotError("UNAVAILABLE", "Could not determine the current VALORANT client version.");
}

export async function fetchDailyShop(session: RiotSession): Promise<DailyShop> {
  const clientVersion = await getClientVersion();
  const url = `https://pd.${session.region}.a.pvp.net/store/v3/storefront/${session.puuid}`;

  // v3 is a POST with an empty body (v2 was a GET). Confirmed against the
  // SkinPeek reference implementation - the community API docs still describe
  // the older v2 GET shape, which no longer works.
  const response = await riotFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "X-Riot-Entitlements-JWT": session.entitlementsToken,
      "X-Riot-ClientPlatform": CLIENT_PLATFORM,
      "X-Riot-ClientVersion": clientVersion,
    },
    body: {},
  });

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    // Tokens are minted fresh immediately before this call, so a rejection
    // here means the session itself is no longer good.
    throw new RiotError("EXPIRED", "Riot rejected the session when reading your shop. Link your account again.");
  }
  if (!response.ok) {
    throw new RiotError("UNEXPECTED", `Could not read your shop (${response.status}).`);
  }

  const body = (await response.json()) as {
    SkinsPanelLayout?: {
      SingleItemOffers?: unknown;
      SingleItemOffersRemainingDurationInSeconds?: unknown;
    };
  };

  const panel = body.SkinsPanelLayout;
  const offers = panel?.SingleItemOffers;
  const reset = panel?.SingleItemOffersRemainingDurationInSeconds;

  if (!Array.isArray(offers) || !offers.every((id): id is string => typeof id === "string")) {
    throw new RiotError("UNEXPECTED", "Riot's shop response didn't contain a readable rotation.");
  }

  return {
    offerIds: offers,
    // Fall back to ~24h rather than failing the whole check if only the
    // countdown is missing - a slightly-off next poll beats no shop data.
    resetInSeconds: typeof reset === "number" && reset > 0 ? reset : 24 * 60 * 60,
  };
}
