import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, safeEqual } from "@/lib/crypto";

// First real tests in the repo - CLAUDE.md's bar for adding a runner is
// "real logic worth testing", and encrypting other people's Riot session
// credentials at rest clears it. Uses node:test so this costs zero new
// dependencies. Run with `npm test`.

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value", () => {
    const secret = "ssid-cookie-value-12345";
    assert.equal(decryptSecret(encryptSecret(secret)), secret);
  });

  it("round-trips unicode and long values", () => {
    const secret = "🔐 " + "a".repeat(5000) + " ünïcode";
    assert.equal(decryptSecret(encryptSecret(secret)), secret);
  });

  it("round-trips an empty string", () => {
    assert.equal(decryptSecret(encryptSecret("")), "");
  });

  it("produces different ciphertext each time (random IV)", () => {
    const secret = "same-input-every-time";
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    assert.notEqual(a, b, "identical ciphertext means the IV is not random - catastrophic for GCM");
    // Both must still decrypt back to the same plaintext.
    assert.equal(decryptSecret(a), secret);
    assert.equal(decryptSecret(b), secret);
  });

  it("does not leak plaintext into the encoded output", () => {
    const secret = "SUPERSECRETCOOKIE";
    assert.ok(!encryptSecret(secret).includes(secret));
  });

  // Tamper at the BYTE level, not by editing a base64url character. A first
  // version of these tests flipped the last character of a segment and the
  // auth-tag case failed to detect anything: a 16-byte tag encodes to 22
  // base64url chars, where the final char carries only 2 significant bits and
  // 4 bits of padding - so 'A' -> 'B' decoded to byte-identical output and
  // nothing was actually tampered with. Decoding, flipping a byte, and
  // re-encoding is the only way to be sure the test exercises what it claims.
  function tamperSegment(segment: string): string {
    const buf = Buffer.from(segment, "base64url");
    buf[0] ^= 0xff;
    return buf.toString("base64url");
  }

  it("rejects a tampered ciphertext body", () => {
    const parts = encryptSecret("tamper-me").split(".");
    parts[3] = tamperSegment(parts[3]);
    assert.throws(() => decryptSecret(parts.join(".")));
  });

  it("rejects a tampered auth tag", () => {
    const parts = encryptSecret("tamper-my-tag").split(".");
    parts[2] = tamperSegment(parts[2]);
    assert.throws(() => decryptSecret(parts.join(".")));
  });

  it("rejects a tampered IV", () => {
    const parts = encryptSecret("tamper-my-iv").split(".");
    parts[1] = tamperSegment(parts[1]);
    assert.throws(() => decryptSecret(parts.join(".")));
  });

  it("rejects malformed input", () => {
    assert.throws(() => decryptSecret("not-encrypted-at-all"));
    assert.throws(() => decryptSecret("v1.only.three"));
    assert.throws(() => decryptSecret("v2.aaaa.bbbb.cccc"), /Malformed/);
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    assert.equal(safeEqual("abc123", "abc123"), true);
  });

  it("rejects different strings of equal length", () => {
    assert.equal(safeEqual("abc123", "abc124"), false);
  });

  it("rejects different lengths without throwing", () => {
    assert.equal(safeEqual("short", "much-longer-value"), false);
  });
});
