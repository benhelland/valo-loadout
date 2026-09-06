// Rotates RIOT_TOKEN_ENCRYPTION_KEY in place, re-encrypting every linked
// account's refresh token with a new key WITHOUT forcing anyone to re-link.
//
// Why this exists: the obvious way to change this key is "generate a fresh
// one and let everyone re-link" - fine for the dev/prod split (different
// databases, no reason to share a key), but a bad default for
// *rotating* the key on one already-live database, e.g. after a suspected
// key exposure. Forcing every user to re-link their Riot account is a real
// cost. It isn't necessary: with both the old and new key available at once,
// each row can be decrypted with the old key and re-encrypted with the new
// one, in place.
//
// Usage:
//   RIOT_TOKEN_ENCRYPTION_KEY_OLD=<current key> \
//   RIOT_TOKEN_ENCRYPTION_KEY_NEW=<freshly generated key> \
//   npx tsx --env-file=.env.local src/scripts/rotateEncryptionKey.ts
//
// After it reports success, set RIOT_TOKEN_ENCRYPTION_KEY to the new key
// everywhere (local .env.local, Vercel) and only then discard the old one.
// Safe to re-run: rows already encrypted with the new key fail to decrypt
// under the old one and are skipped, not double-rotated or corrupted.
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret, parseKey } from "@/lib/crypto";

async function main() {
  const oldRaw = process.env.RIOT_TOKEN_ENCRYPTION_KEY_OLD;
  const newRaw = process.env.RIOT_TOKEN_ENCRYPTION_KEY_NEW;
  if (!oldRaw || !newRaw) {
    console.error("Set both RIOT_TOKEN_ENCRYPTION_KEY_OLD and RIOT_TOKEN_ENCRYPTION_KEY_NEW.");
    console.error("Generate the new one with: openssl rand -base64 32");
    process.exit(1);
  }
  if (oldRaw === newRaw) {
    console.error("Old and new keys are identical - nothing to rotate.");
    process.exit(1);
  }

  const oldKey = parseKey(oldRaw);
  const newKey = parseKey(newRaw);

  const accounts = await prisma.linkedRiotAccount.findMany({
    select: { id: true, encryptedRefreshToken: true, riotGameName: true, riotTagLine: true },
  });
  console.log(`Found ${accounts.length} linked account(s).`);

  let rotated = 0;
  let alreadyNew = 0;
  let failed = 0;

  for (const account of accounts) {
    const who = account.riotGameName ? `${account.riotGameName}#${account.riotTagLine ?? "?"}` : account.id;

    // Confirms this row is still on the old key before touching it - a
    // row already on the new key (e.g. linked after a partial previous
    // rotation, or this script re-run) decrypts fine here and is left
    // alone, rather than re-encrypting ciphertext that's already correct.
    try {
      decryptSecret(account.encryptedRefreshToken, newKey);
      alreadyNew++;
      continue;
    } catch {
      // Not on the new key yet - proceed to rotate it below.
    }

    try {
      const plaintext = decryptSecret(account.encryptedRefreshToken, oldKey);
      const reencrypted = encryptSecret(plaintext, newKey);
      await prisma.linkedRiotAccount.update({
        where: { id: account.id },
        data: { encryptedRefreshToken: reencrypted },
      });
      rotated++;
    } catch (err) {
      // Never logs the token or the raw crypto error (could carry ciphertext
      // fragments) - only which account and that it failed. A row that fails
      // here keeps its OLD-key ciphertext untouched, so it's simply back to
      // needing a manual re-link, not corrupted.
      console.error(`Failed to rotate account ${who}: ${err instanceof Error ? err.name : "unknown error"}`);
      failed++;
    }
  }

  console.log(`\nRotated: ${rotated}. Already on new key: ${alreadyNew}. Failed (needs re-link): ${failed}.`);
  if (failed === 0) {
    console.log("All accounts rotated successfully - safe to update RIOT_TOKEN_ENCRYPTION_KEY everywhere now.");
  } else {
    console.log("Some accounts failed to rotate - see above. Their existing key still works; investigate before finishing the rotation.");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
