import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeCombo, decodeCombo } from "@/lib/comboLink";

const SKIN = "18609205-4edb-5966-cff8-0fba0230ba1e";
const LEVEL = "b3d3ff38-4202-20d8-2f41-c783477e5636";
const BUDDY = "c960fd07-46ff-1a92-d531-c184f1142bb4";

describe("combo link round-trip", () => {
  it("round-trips a full selection", () => {
    const encoded = encodeCombo({ skinId: SKIN, levelId: LEVEL, chromaId: null, buddyId: BUDDY });
    assert.deepEqual(decodeCombo(encoded), { skinId: SKIN, levelId: LEVEL, chromaId: null, buddyId: BUDDY });
  });

  it("round-trips a skin-only selection", () => {
    const encoded = encodeCombo({ skinId: SKIN });
    assert.deepEqual(decodeCombo(encoded), { skinId: SKIN, levelId: null, chromaId: null, buddyId: null });
  });

  it("produces a URL-safe token", () => {
    assert.match(encodeCombo({ skinId: SKIN, levelId: LEVEL, buddyId: BUDDY }), /^[A-Za-z0-9_-]+$/);
  });
});

describe("decodeCombo rejects tampered tokens", () => {
  it("rejects arbitrary junk", () => {
    // Base64 decoding is NOT validation. Buffer.from(x, "base64") silently
    // ignores invalid characters instead of throwing, so junk decodes to
    // arbitrary bytes that pass a truthiness check and reach Postgres, which
    // rejects the NUL bytes with a 500 rather than the intended 404.
    for (const bad of ["GARBAGE_TOKEN_xxx", "!!!!", "x", ""]) {
      assert.equal(decodeCombo(bad), null, JSON.stringify(bad));
    }
  });

  it("rejects a token whose ids decode cleanly but aren't uuids", () => {
    const forged = Buffer.from("notauuid||||", "utf8").toString("base64url");
    assert.equal(decodeCombo(forged), null);
  });

  it("rejects a token with the wrong field count", () => {
    const tooFew = Buffer.from(`${SKIN}|${LEVEL}`, "utf8").toString("base64url");
    assert.equal(decodeCombo(tooFew), null);
  });

  it("rejects the whole token when one optional id is malformed", () => {
    // Rather than silently dropping the bad field and rendering something
    // subtly different from what the sender shared.
    const badLevel = Buffer.from(`${SKIN}|not-a-uuid||`, "utf8").toString("base64url");
    assert.equal(decodeCombo(badLevel), null);
  });
});
