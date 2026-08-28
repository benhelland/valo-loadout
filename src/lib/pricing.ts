// valorant-api.com has no price data at all (confirmed by direct probing -
// see docs/ARCHITECTURE.md). Prices are a static, well-known-in-the-community
// estimate per rarity tier, not synced data. Labeled as an estimate in the UI.
// Real prices from an authenticated Riot session are a Phase 4 stretch goal.
const TIER_PRICE_VP: Record<string, number> = {
  Select: 875,
  Deluxe: 1275,
  Premium: 1775,
  Ultra: 2475,
  Exclusive: 2895,
};

export function estimatePriceVp(tierDevName: string | null | undefined): number | null {
  if (!tierDevName) return null;
  return TIER_PRICE_VP[tierDevName] ?? null;
}
