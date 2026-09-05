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
