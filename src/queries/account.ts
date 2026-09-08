import { prisma } from "@/lib/db";

// Backs /account: every linked Riot account plus the four most recently
// seen skins for each, grouped so the page only has to map over accounts.

export interface AccountLinkedAccount {
  id: string;
  status: string;
  region: string | null;
  riotGameName: string | null;
  riotTagLine: string | null;
  lastError: string | null;
  lastSyncedAt: Date | null;
}

export interface AccountRecentSighting {
  skinId: string;
  skin: { displayName: string; displayIconUrl: string | null };
}

export interface AccountOverview {
  linkedAccounts: AccountLinkedAccount[];
  recentByAccount: Map<string, AccountRecentSighting[]>;
}

export async function getAccountOverview(userId: string): Promise<AccountOverview> {
  // Named columns rather than the whole row: linked_riot_accounts holds
  // `encryptedRefreshToken`, `puuid`, and other columns this page never
  // renders, and there is no reason for a stored credential to travel into a
  // page render that never reads it (same rule as src/queries/shop.ts).
  const linkedAccounts = await prisma.linkedRiotAccount.findMany({
    where: { userId },
    select: {
      id: true,
      status: true,
      region: true,
      riotGameName: true,
      riotTagLine: true,
      lastError: true,
      lastSyncedAt: true,
    },
  });

  // The four most recently seen skins for each linked account - the visible
  // payoff that a shop check actually ran, and the fastest way to eyeball
  // whether the offer-id -> skin mapping resolved correctly.
  //
  // One query per account rather than one `take: 4 * accounts.length` query
  // ordered globally: a shared take can't guarantee four per account, since
  // an account with more recent activity can fill every slot and leave a
  // quieter account with none. Bounded by MAX_LINKED_RIOT_ACCOUNTS_PER_USER
  // (src/lib/limits.ts), so this is at most a handful of small queries.
  const recentByAccount = new Map<string, AccountRecentSighting[]>();
  await Promise.all(
    linkedAccounts.map(async (account) => {
      const sightings = await prisma.skinSightingStat.findMany({
        where: { linkedRiotAccountId: account.id },
        orderBy: { lastSeenAt: "desc" },
        take: 4,
        select: { skinId: true, skin: { select: { displayName: true, displayIconUrl: true } } },
      });
      recentByAccount.set(account.id, sightings);
    }),
  );

  return { linkedAccounts, recentByAccount };
}
