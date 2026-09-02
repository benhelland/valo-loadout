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
  /**
   * Real VP prices observed in this response, keyed by skin level id -
   * from the daily panel *and* whatever bundles are currently featured.
   *
   * Riot removed the endpoint that returned the full catalogue price list
   * (`GET /store/v1/offers/`, used by SkinPeek; now 404 at every version
   * while `/store/v1/wallet` still works, so it was withdrawn rather than
   * merely re-versioned). Harvesting from a response we already fetch is
   * therefore the only remaining route to real prices, and it costs no extra
   * calls - this data was previously parsed and thrown away.
   */
  prices: Map<string, number>;
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

async function authHeaders(session: RiotSession): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Riot-Entitlements-JWT": session.entitlementsToken,
    "X-Riot-ClientPlatform": CLIENT_PLATFORM,
    "X-Riot-ClientVersion": await getClientVersion(),
  };
}

// Riot's own VP currency id. Offers are priced in a currency map rather than
// a scalar, because the same payload also quotes Radianite and Kingdom
// Credits - we read VP and ignore the rest.
const VP_CURRENCY_ID = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";

// One offer, in the shape both the daily panel and bundle item lists use.
interface RawOffer {
  OfferID?: unknown;
  Cost?: Record<string, unknown>;
  Rewards?: { ItemID?: unknown }[];
}

/**
 * Pulls VP costs out of any offer list, keyed by the skin *level* id the
 * offer actually grants.
 *
 * `Rewards[0].ItemID` is preferred over `OfferID`: for the daily panel they
 * happen to match, but bundle item offers use a bundle-scoped offer id that
 * is NOT a skin level, so keying on OfferID silently loses every bundle
 * price. Anything unparseable is skipped rather than throwing - a
 * Radianite-priced or non-skin entry in these lists is normal, not an error.
 */
function collectVpPrices(offers: RawOffer[] | undefined, into: Map<string, number>): void {
  for (const offer of offers ?? []) {
    const id = offer.Rewards?.[0]?.ItemID ?? offer.OfferID;
    const cost = offer.Cost?.[VP_CURRENCY_ID];
    if (typeof id === "string" && typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
      into.set(id, cost);
    }
  }
}

export async function fetchDailyShop(session: RiotSession): Promise<DailyShop> {
  const url = `https://pd.${session.region}.a.pvp.net/store/v3/storefront/${session.puuid}`;

  // v3 is a POST with an empty body (v2 was a GET). Confirmed against the
  // SkinPeek reference implementation - the community API docs still describe
  // the older v2 GET shape, which no longer works.
  const response = await riotFetch(url, {
    method: "POST",
    headers: await authHeaders(session),
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
      SingleItemStoreOffers?: RawOffer[];
      SingleItemOffersRemainingDurationInSeconds?: unknown;
    };
    FeaturedBundle?: {
      Bundle?: { ItemOffers?: { Offer?: RawOffer }[] };
      Bundles?: { ItemOffers?: { Offer?: RawOffer }[] }[];
    };
  };

  const panel = body.SkinsPanelLayout;
  const offers = panel?.SingleItemOffers;
  const reset = panel?.SingleItemOffersRemainingDurationInSeconds;

  if (!Array.isArray(offers) || !offers.every((id): id is string => typeof id === "string")) {
    throw new RiotError("UNEXPECTED", "Riot's shop response didn't contain a readable rotation.");
  }

  // Prices are additive and best-effort: a malformed bundle must never fail a
  // shop check, whose actual job is the rotation above.
  const prices = new Map<string, number>();
  collectVpPrices(panel?.SingleItemStoreOffers, prices);
  for (const bundle of [body.FeaturedBundle?.Bundle, ...(body.FeaturedBundle?.Bundles ?? [])]) {
    collectVpPrices(
      bundle?.ItemOffers?.map((entry) => entry.Offer ?? {}),
      prices,
    );
  }

  return {
    offerIds: offers,
    // Fall back to ~24h rather than failing the whole check if only the
    // countdown is missing - a slightly-off next poll beats no shop data.
    resetInSeconds: typeof reset === "number" && reset > 0 ? reset : 24 * 60 * 60,
    prices,
  };
}
