import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { verifyEnvironment, isEnvironmentMismatch, EnvironmentMismatchError } from "@/lib/verifyEnvironment";
import type { PrismaClient } from "@/generated/prisma/client";

// The whole point of this check is catching "pointed at the wrong
// database" - so these tests exist to prove the failure path genuinely
// throws (not just logs) and that success/missing-marker never do, without
// needing a real database to create a real mismatch in.

function fakePrisma(marker: { name: string } | null): Pick<PrismaClient, "environmentMarker"> {
  return { environmentMarker: { findFirst: async () => marker } } as unknown as Pick<PrismaClient, "environmentMarker">;
}

describe("verifyEnvironment", () => {
  it("passes silently when the marker matches a development process", async () => {
    await assert.doesNotReject(() =>
      verifyEnvironment({ prisma: fakePrisma({ name: "development" }), nodeEnv: "development" }),
    );
  });

  it("passes silently when the marker matches a real production deployment", async () => {
    await assert.doesNotReject(() =>
      verifyEnvironment({
        prisma: fakePrisma({ name: "production" }),
        nodeEnv: "production",
        vercelEnv: "production",
      }),
    );
  });

  // NODE_ENV=production off a deployment means "optimized build", not
  // "production database" - `next build` and `next start` set it on a
  // developer machine too, so it must not on its own grant access to the
  // production database.
  it("throws when a LOCAL production build reaches the production database", async () => {
    await assert.rejects(
      () =>
        verifyEnvironment({
          prisma: fakePrisma({ name: "production" }),
          nodeEnv: "production",
          vercelEnv: undefined,
        }),
      /local process reached the production database/,
    );
  });

  it("names the actual cause rather than a generic mismatch", async () => {
    // The generic "expected development" wording would send you hunting a
    // wrong connection string instead of the env file that supplied it.
    await assert.rejects(
      () =>
        verifyEnvironment({
          prisma: fakePrisma({ name: "production" }),
          nodeEnv: "production",
          vercelEnv: undefined,
        }),
      /ALLOW_PRODUCTION_DB_LOCALLY/,
    );
  });

  it("keeps the development database usable while the opt-in is set", async () => {
    // The opt-in must WIDEN what is acceptable, not replace it. If it made
    // "production" the expected marker, then setting it once - the natural
    // thing to do for a local job that talks to production - would make every
    // ordinary `npm run dev` against the development database fail, with an
    // error blaming a DATABASE_URL that is in fact correct.
    await assert.doesNotReject(() =>
      verifyEnvironment({
        prisma: fakePrisma({ name: "development" }),
        nodeEnv: "development",
        vercelEnv: undefined,
        allowProductionDbLocally: true,
      }),
    );
  });

  it("allows a local production connection only with the explicit opt-in", async () => {
    await assert.doesNotReject(() =>
      verifyEnvironment({
        prisma: fakePrisma({ name: "production" }),
        nodeEnv: "production",
        vercelEnv: undefined,
        allowProductionDbLocally: true,
      }),
    );
  });

  it("still permits a local build against the development database", async () => {
    // The ordinary case - `npm run build` on a laptop must keep working.
    await assert.doesNotReject(() =>
      verifyEnvironment({
        prisma: fakePrisma({ name: "development" }),
        nodeEnv: "production",
        vercelEnv: undefined,
      }),
    );
  });

  it("throws when a development process reads a production marker", async () => {
    await assert.rejects(
      () => verifyEnvironment({ prisma: fakePrisma({ name: "production" }), nodeEnv: "development" }),
      /Environment mismatch/,
    );
  });

  it("throws when a real deployment reads a development marker", async () => {
    // The actual dangerous direction: a real deployment accidentally
    // pointed at the dev database. VERCEL_ENV is what makes it a deployment;
    // without it this is just a local build, which legitimately uses dev.
    await assert.rejects(
      () =>
        verifyEnvironment({
          prisma: fakePrisma({ name: "development" }),
          nodeEnv: "production",
          vercelEnv: "production",
        }),
      /Environment mismatch/,
    );
  });

  // Vercel sets NODE_ENV=production for preview builds as well as real ones,
  // so VERCEL_ENV is the only signal that separates them. These cover the
  // deployment matrix that distinction exists for.

  it("expects the development marker on a preview deployment", async () => {
    // NODE_ENV is "production" here, exactly as Vercel sets it for previews.
    await assert.doesNotReject(() =>
      verifyEnvironment({
        prisma: fakePrisma({ name: "development" }),
        nodeEnv: "production",
        vercelEnv: "preview",
      }),
    );
  });

  it("throws when a preview deployment reads the production marker", async () => {
    // The mistake this newly catches: a feature branch wired to the real
    // database, where a preview would write to live user data.
    await assert.rejects(
      () =>
        verifyEnvironment({
          prisma: fakePrisma({ name: "production" }),
          nodeEnv: "production",
          vercelEnv: "preview",
        }),
      /Environment mismatch/,
    );
  });

  it("still expects the production marker on a production deployment", async () => {
    await assert.doesNotReject(() =>
      verifyEnvironment({
        prisma: fakePrisma({ name: "production" }),
        nodeEnv: "production",
        vercelEnv: "production",
      }),
    );
  });

  it("throws when a production deployment reads the development marker", async () => {
    await assert.rejects(
      () =>
        verifyEnvironment({
          prisma: fakePrisma({ name: "development" }),
          nodeEnv: "production",
          vercelEnv: "production",
        }),
      /Environment mismatch/,
    );
  });

  it("expects the development database whenever VERCEL_ENV is absent", async () => {
    // Local dev, local builds and CI all run with no VERCEL_ENV, and all of
    // them belong on the development database.
    //
    // NODE_ENV must not be able to select the production database on its
    // own: treating it as the fallback signal would let any local build
    // holding production credentials pass this check instead of failing it.
    for (const nodeEnv of ["development", "production", "test", undefined]) {
      await assert.doesNotReject(
        () =>
          verifyEnvironment({
            prisma: fakePrisma({ name: "development" }),
            nodeEnv,
            vercelEnv: undefined,
          }),
        `development marker should be accepted with NODE_ENV=${nodeEnv}`,
      );
    }
  });

  // The error must be identifiable by type, not by message. src/app/sitemap.ts
  // deliberately swallows database errors (an unreachable database should not
  // fail a build), so without a distinguishable type that catch would reduce
  // the guard to a log line in a build that still exits 0.
  it("throws a typed error both catchers and callers can distinguish", async () => {
    for (const deps of [
      { prisma: fakePrisma({ name: "production" }), nodeEnv: "production", vercelEnv: undefined },
      { prisma: fakePrisma({ name: "development" }), nodeEnv: "production", vercelEnv: "production" },
    ]) {
      const err = await verifyEnvironment(deps).then(
        () => null,
        (e: unknown) => e,
      );
      assert.ok(err instanceof EnvironmentMismatchError, "must be an EnvironmentMismatchError");
      assert.ok(isEnvironmentMismatch(err), "isEnvironmentMismatch must recognise it");
    }
  });

  it("does not mistake an ordinary database error for an environment mismatch", async () => {
    // A bare `catch` must still be free to swallow a genuine outage.
    assert.equal(isEnvironmentMismatch(new Error("connection refused")), false);
    assert.equal(isEnvironmentMismatch(undefined), false);
    assert.equal(isEnvironmentMismatch({ name: "EnvironmentMismatchError" }), false);
  });

  it("does not throw when no marker exists yet (fresh database)", async () => {
    const warn = mock.method(console, "warn", () => {});
    try {
      await assert.doesNotReject(() => verifyEnvironment({ prisma: fakePrisma(null), nodeEnv: "development" }));
      assert.equal(warn.mock.callCount(), 1);
    } finally {
      warn.mock.restore();
    }
  });

  it("never logs anything but the marker's own name and the fixed vocabulary - no connection info exists to leak", async () => {
    // Guards the actual security property, not just behaviour: greps every
    // logged string for a URL/host shape, which nothing here should ever
    // produce because the function has no way to read DATABASE_URL at all.
    const messages: string[] = [];
    const error = mock.method(console, "error", (...args: unknown[]) => {
      messages.push(args.map(String).join(" "));
    });
    try {
      await assert.rejects(() => verifyEnvironment({ prisma: fakePrisma({ name: "production" }), nodeEnv: "development" }));
      const joined = messages.join("\n");
      assert.doesNotMatch(joined, /:\/\//, "logged a URL-shaped string");
      assert.doesNotMatch(joined, /\.neon\.tech|\.aws\./, "logged a hostname fragment");
    } finally {
      error.mock.restore();
    }
  });
});
