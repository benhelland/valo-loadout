import { prisma } from "@/lib/db";

// TEMPORARY - Phase 2 mock auth. Real auth (Auth.js + Discord OAuth per
// docs/ARCHITECTURE.md) hasn't been built yet; the loadout builder needs a
// concept of "the current user" to exist first, so this stands in for it.
// getCurrentUserId() is the single place that reads "who is logged in" -
// every loadout query/action calls this instead of touching a session
// directly, so swapping in a real Auth.js session lookup later is a
// one-function change, not a hunt through the codebase.
const MOCK_USER_EMAIL = "dev@valo-loadout.local";

export async function getCurrentUserId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: MOCK_USER_EMAIL },
    update: {},
    create: { email: MOCK_USER_EMAIL, name: "Dev User" },
  });
  return user.id;
}
