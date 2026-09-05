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

// Every id packed into a combo link is a valorant-api.com UUID. Decoded
// values are checked against that shape rather than trusted, because
// base64 decoding is not itself a validation step:
// `Buffer.from(x, "base64")` silently *ignores* invalid characters instead
// of throwing, so the try/catch below never fires for junk input - it just
// yields arbitrary bytes. Those bytes reached a Prisma lookup, and any NUL
// among them made Postgres reject the query outright (`invalid byte
// sequence for encoding "UTF8": 0x00`), turning a garbled share link into a
// 500 rather than the intended 404.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalId(value: string | undefined): string | null | undefined {
  if (!value) return null;
  // `undefined` signals "present but malformed" so the caller can reject the
  // whole token, rather than silently dropping one field of it.
  return UUID.test(value) ? value : undefined;
}

export function decodeCombo(encoded: string): ComboSelection | null {
  try {
    const raw = fromBase64Url(encoded);
    const parts = raw.split("|");
    // Exactly the four fields encodeCombo writes. A different count means
    // this wasn't produced by us.
    if (parts.length !== 4) return null;

    const [skinId, levelId, chromaId, buddyId] = parts;
    if (!UUID.test(skinId ?? "")) return null;

    const level = optionalId(levelId);
    const chroma = optionalId(chromaId);
    const buddy = optionalId(buddyId);
    if (level === undefined || chroma === undefined || buddy === undefined) return null;

    return { skinId, levelId: level, chromaId: chroma, buddyId: buddy };
  } catch {
    return null;
  }
}
