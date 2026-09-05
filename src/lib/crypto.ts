import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM encryption for Riot session cookies at rest, per
// docs/ARCHITECTURE.md's security notes and CLAUDE.md's non-negotiables.
// GCM (not CBC) because it's authenticated: tampering with stored ciphertext
// fails loudly on decrypt instead of silently yielding garbage plaintext that
// then gets sent to Riot.
//
// Nothing in this file may ever log or throw plaintext. Errors below are
// deliberately vague about *what* failed to decrypt - a decrypt error that
// echoed the value would defeat the point of encrypting it.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce - the size GCM is defined for; 16 would be silently reduced
const TAG_BYTES = 16;

let cachedKey: Buffer | undefined;

// Exported so src/scripts/rotateEncryptionKey.ts can validate an arbitrary
// key string (the old and new keys, neither of which is the live
// RIOT_TOKEN_ENCRYPTION_KEY) the exact same way getKey() validates the env
// one, rather than a second, possibly-drifting copy of this check.
export function parseKey(raw: string): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    // Fail loudly rather than padding/hashing a short key into shape - a
    // silently-weakened key is worse than a startup crash.
    throw new Error(`Key must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`);
  }
  return key;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.RIOT_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("RIOT_TOKEN_ENCRYPTION_KEY is not set - refusing to handle Riot session data without it");
  }

  try {
    cachedKey = parseKey(raw);
  } catch (err) {
    throw new Error(`RIOT_TOKEN_ENCRYPTION_KEY: ${(err as Error).message}`);
  }
  return cachedKey;
}

// Returns "v1.<iv>.<tag>.<ciphertext>", all base64url. The version prefix is
// cheap now and makes a future key rotation or algorithm change detectable
// instead of ambiguous.
//
// `key` defaults to the cached RIOT_TOKEN_ENCRYPTION_KEY and is what every
// existing call site keeps using unmodified. The explicit override exists
// for src/scripts/rotateEncryptionKey.ts, which needs to hold both an old
// and a new key live in one process - something the env-cached default
// can't do, since it's one process-wide value.
export function encryptSecret(plaintext: string, key: Buffer = getKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(encoded: string, key: Buffer = getKey()): string {
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed encrypted value");
  }

  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Malformed encrypted value");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // decipher.final() throws if the auth tag doesn't verify - that's the
  // tamper detection, and it must not be caught-and-ignored by callers.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Constant-time compare for any place a stored secret is checked against a
// supplied one (e.g. the cron trigger's shared secret). Plain === leaks
// timing information about how many leading characters matched.
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, which itself leaks length -
  // unavoidable, and length alone isn't the sensitive part here.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
