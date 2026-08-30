"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";

// Deliberately the ONLY mutation in this file. Actually linking a Riot
// account means handling a live login handshake (username/password, 2FA,
// CAPTCHA) against Riot's unofficial internal endpoints, plus encrypting
// and refreshing the resulting session token - the security-sensitive,
// judgment-heavy part of the app docs/ROADMAP.md explicitly flags for a
// model switch (Opus) before it gets written, not Sonnet. See the "Coming
// soon" section of /account for what's built instead. Unlinking has none of
// that risk - it's a plain delete of a row this user owns, which is exactly
// what RISKS.md requires regardless ("have a clean path for a user to
// unlink their account and have their token deleted"), so it's safe to ship
// now even though nothing can create a LinkedRiotAccount row yet.
export async function unlinkRiotAccount(linkedAccountId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const account = await prisma.linkedRiotAccount.findUnique({
    where: { id: linkedAccountId },
    select: { userId: true },
  });
  if (!account || account.userId !== userId) throw new Error("Linked account not found");

  await prisma.linkedRiotAccount.delete({ where: { id: linkedAccountId } });
  revalidatePath("/account");
}
