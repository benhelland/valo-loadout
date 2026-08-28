// Thin client for valorant-api.com (unofficial, community-maintained).
// Schema confirmed against the live API on 2026-08-28 - see docs/ARCHITECTURE.md.
// Re-verify field names if this hasn't been touched in a while; it's unversioned.

const BASE_URL = process.env.VALORANT_API_BASE_URL ?? "https://valorant-api.com/v1";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}?language=en-US`);
  if (!res.ok) {
    throw new Error(`valorant-api.com request failed: ${path} -> ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { status: number; data: T };
  return body.data;
}

export interface ApiSkinLevel {
  uuid: string;
  displayName: string;
  levelItem: string | null;
  displayIcon: string | null;
  streamedVideo: string | null;
}

export interface ApiSkinChroma {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
  fullRender: string | null;
  swatch: string | null;
  streamedVideo: string | null;
}

export interface ApiSkin {
  uuid: string;
  displayName: string;
  themeUuid: string | null;
  contentTierUuid: string | null;
  displayIcon: string | null;
  chromas: ApiSkinChroma[];
  levels: ApiSkinLevel[];
}

export interface ApiWeapon {
  uuid: string;
  displayName: string;
  category: string | null;
  displayIcon: string | null;
  skins: ApiSkin[];
}

export interface ApiContentTier {
  uuid: string;
  displayName: string;
  devName: string;
  rank: number;
  highlightColor: string | null;
  displayIcon: string | null;
}

export interface ApiTheme {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
}

export interface ApiBuddyLevel {
  uuid: string;
  charmLevel: number;
  displayName: string;
  displayIcon: string | null;
}

export interface ApiBuddy {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
  levels: ApiBuddyLevel[];
}

export const valorantApi = {
  getWeapons: () => getJson<ApiWeapon[]>("/weapons"),
  getContentTiers: () => getJson<ApiContentTier[]>("/contenttiers"),
  getThemes: () => getJson<ApiTheme[]>("/themes"),
  getBuddies: () => getJson<ApiBuddy[]>("/buddies"),
};

// Raw API enum strings look like "EEquippableCategory::Heavy" or
// "EEquippableSkinLevelItem::SoundEffects" - strip the prefix for display.
export function stripEnumPrefix(value: string | null): string | null {
  if (!value) return value;
  const idx = value.lastIndexOf("::");
  return idx === -1 ? value : value.slice(idx + 2);
}
