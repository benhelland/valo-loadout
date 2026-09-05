import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";

// Wraps @auth/prisma-adapter's PrismaAdapter to stop persisting Discord's
// OAuth credentials to the `accounts` table at all, rather than storing and
// encrypting them.
//
// Verified nothing in this app ever reads them back from the database:
// the only place `account.access_token` is used anywhere in this codebase
// is inside auth.ts's `events.signIn`, and that's the fresh, *in-memory*
// value from the live OAuth exchange - never a value read out of Postgres
// (confirmed by reading @auth/core's handle-login.ts: linkAccount, and so
// the write of these fields, only happens the first time an account is
// created, never again on a returning sign-in - so a persisted copy would
// usually be stale garbage anyway, not a live credential). With nothing to
// read, storing them is pure downside: `refresh_token` is meaningfully
// dangerous if `AUTH_DISCORD_SECRET` is ever *also* exposed (Discord's
// refresh grant requires the client secret - confirmed against Discord's
// own OAuth2 docs - so DB-only exposure alone is contained, but there's no
// reason to leave a second exposure vector sitting there for zero benefit).
//
// `type`/`provider`/`providerAccountId` are kept (required for account
// linking/lookup - `getUserByAccount` joins on exactly these). `scope`,
// `expires_at`, `token_type` are kept too: none are a credential (scope is
// literally just the string "identify email guilds.join"), and knowing what
// scope a user actually consented to is useful for support/debugging (e.g.
// spotting a signup from before `guilds.join` was added). Only the fields
// that are themselves bearer credentials - `refresh_token`, `access_token`,
// `id_token`, `session_state` - are nulled out before the row is ever
// written.
//
// Safe to spread PrismaAdapter's return value: it returns a plain object of
// arrow functions closing over the prisma client variable, never `this`, so
// every other method keeps working unmodified.
export function buildAuthAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(prisma);

  return {
    ...base,
    // Pulling these four fields out (and never referencing them again) is
    // the entire point of this wrapper - see the file header for which and
    // why. Disabled rather than avoided: there's no cleaner way to say
    // "every field except these four" than naming the four.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    linkAccount({ refresh_token, access_token, id_token, session_state, ...safe }: AdapterAccount) {
      return base.linkAccount!(safe as AdapterAccount);
    },
  };
}
