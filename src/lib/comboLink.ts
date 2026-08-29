// Stateless combo-link codec - see docs/ARCHITECTURE.md "Sharing".
// Packs a skin + optional level/chroma/buddy selection into a single opaque,
// URL-safe path segment. No DB row, nothing to revoke: the route just decodes
// this string and re-fetches the referenced catalog rows.
//
// Works in both server and client components (base64url via Buffer on the
// server, via btoa/atob in the browser) - all packed values are plain ASCII
// (UUIDs from valorant-api.com), so no unicode handling is needed either way.

export interface ComboSelection {
  skinId: string;
  levelId?: string | null;
  chromaId?: string | null;
  buddyId?: string | null;
}

function toBase64Url(str: string): string {
  const b64 = typeof window === "undefined" ? Buffer.from(str, "utf8").toString("base64") : btoa(str);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const b64 = padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "=");
  return typeof window === "undefined" ? Buffer.from(b64, "base64").toString("utf8") : atob(b64);
}

export function encodeCombo(selection: ComboSelection): string {
  const raw = [selection.skinId, selection.levelId ?? "", selection.chromaId ?? "", selection.buddyId ?? ""].join("|");
  return toBase64Url(raw);
}

export function decodeCombo(encoded: string): ComboSelection | null {
  try {
    const raw = fromBase64Url(encoded);
    const [skinId, levelId, chromaId, buddyId] = raw.split("|");
    if (!skinId) return null;
    return {
      skinId,
      levelId: levelId || null,
      chromaId: chromaId || null,
      buddyId: buddyId || null,
    };
  } catch {
    return null;
  }
}
