import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAuthAdapter } from "@/lib/authAdapter";
import type { PrismaClient } from "@/generated/prisma/client";

// A third security-critical control alongside crypto.ts and riot/oauth.ts -
// a silent regression here (e.g. from an @auth/prisma-adapter upgrade
// changing linkAccount's shape) would go straight back to storing Discord's
// refresh/access/id tokens in plaintext with nothing catching it.
//
// No real database needed: PrismaAdapter's own linkAccount is just
// `(data) => p.account.create({ data })` (confirmed by reading
// node_modules/@auth/prisma-adapter/index.js directly), so a fake `prisma`
// whose `account.create` hands back exactly what it was given is enough to
// observe precisely what our wrapper actually persists - the real
// stripping logic runs for real, only the database underneath is faked.
function fakePrisma() {
  const create = async ({ data }: { data: Record<string, unknown> }) => data;
  return { account: { create } } as unknown as PrismaClient;
}

const FULL_ACCOUNT = {
  userId: "user-1",
  type: "oauth",
  provider: "discord",
  providerAccountId: "discord-id-123",
  refresh_token: "SHOULD_NOT_BE_STORED",
  access_token: "SHOULD_NOT_BE_STORED",
  id_token: "SHOULD_NOT_BE_STORED",
  session_state: "SHOULD_NOT_BE_STORED",
  expires_at: 1234567890,
  token_type: "Bearer",
  scope: "identify email guilds.join",
};

describe("buildAuthAdapter", () => {
  it("strips the four bearer-credential fields before they reach linkAccount's create call", async () => {
    const adapter = buildAuthAdapter(fakePrisma());
    const stored = (await adapter.linkAccount!(FULL_ACCOUNT as never)) as Record<string, unknown> | null | undefined;

    assert.equal(stored?.refresh_token, undefined);
    assert.equal(stored?.access_token, undefined);
    assert.equal(stored?.id_token, undefined);
    assert.equal(stored?.session_state, undefined);
  });

  it("keeps every non-credential field untouched", async () => {
    const adapter = buildAuthAdapter(fakePrisma());
    const stored = (await adapter.linkAccount!(FULL_ACCOUNT as never)) as Record<string, unknown> | null | undefined;

    assert.equal(stored?.userId, "user-1");
    assert.equal(stored?.type, "oauth");
    assert.equal(stored?.provider, "discord");
    assert.equal(stored?.providerAccountId, "discord-id-123");
    assert.equal(stored?.expires_at, 1234567890);
    assert.equal(stored?.token_type, "Bearer");
    assert.equal(stored?.scope, "identify email guilds.join");
  });

  it("leaves every other adapter method wired to the real PrismaAdapter, untouched", () => {
    // Regression guard for the wrapping technique itself: PrismaAdapter
    // returns a plain object of closures (not methods relying on `this`),
    // confirmed by reading its source - so spreading it is safe. This just
    // pins that every method the real adapter exposes is still present and
    // still a function after wrapping, not silently dropped.
    const adapter = buildAuthAdapter(fakePrisma());
    for (const method of ["getUser", "getUserByEmail", "getUserByAccount", "createUser", "updateUser", "createSession"]) {
      assert.equal(typeof (adapter as Record<string, unknown>)[method], "function", method);
    }
  });
});
