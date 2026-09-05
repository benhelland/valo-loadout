import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { verifyEnvironment } from "@/lib/verifyEnvironment";
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

  it("passes silently when the marker matches a production process", async () => {
    await assert.doesNotReject(() =>
      verifyEnvironment({ prisma: fakePrisma({ name: "production" }), nodeEnv: "production" }),
    );
  });

  it("throws when a development process reads a production marker", async () => {
    await assert.rejects(
      () => verifyEnvironment({ prisma: fakePrisma({ name: "production" }), nodeEnv: "development" }),
      /Environment mismatch/,
    );
  });

  it("throws when a production process reads a development marker", async () => {
    // The actual dangerous direction: a real deployment accidentally
    // pointed at the dev database.
    await assert.rejects(
      () => verifyEnvironment({ prisma: fakePrisma({ name: "development" }), nodeEnv: "production" }),
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

  it("falls back to NODE_ENV when VERCEL_ENV is absent", async () => {
    // Local dev, CI, and `npm run check-shops` all run with no VERCEL_ENV.
    await assert.rejects(
      () => verifyEnvironment({ prisma: fakePrisma({ name: "development" }), nodeEnv: "production", vercelEnv: undefined }),
      /Environment mismatch/,
    );
    await assert.doesNotReject(() =>
      verifyEnvironment({ prisma: fakePrisma({ name: "development" }), nodeEnv: "development", vercelEnv: undefined }),
    );
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
