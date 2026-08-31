import NextAuth from "next-auth";
import Discord, { type DiscordProfile } from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";

// Avatar-URL logic copied verbatim from @auth/core's default Discord
// provider (node_modules/@auth/core/providers/discord.js) - only the `name`
// field below actually needs to change, but overriding `profile` at all
// means reimplementing the rest of it too, since there's no way to patch
// just one field of the default mapping.
function discordProfile(profile: DiscordProfile) {
  let imageUrl: string;
  if (profile.avatar === null) {
    const defaultAvatarNumber =
      profile.discriminator === "0" ? Number(BigInt(profile.id) >> BigInt(22)) % 6 : parseInt(profile.discriminator) % 5;
    imageUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNumber}.png`;
  } else {
    const format = profile.avatar.startsWith("a_") ? "gif" : "png";
    imageUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
  }
  return {
    id: profile.id,
    // The default provider maps name to `global_name` (the customizable
    // display name shown across Discord's UI) falling back to `username`.
    // Explicit product call: show the real, unique @username handle
    // instead - `global_name` is user-editable free text with no
    // uniqueness guarantee, `username` is the actual account identity.
    name: profile.username,
    email: profile.email,
    image: imageUrl,
  };
}

// Auth.js v5 config - Discord OAuth only, per docs/ARCHITECTURE.md. This is
// the ONLY file that talks to next-auth directly with the real adapter and
// provider; every query/action reads "who's logged in" through
// getCurrentUserId() in src/lib/auth.ts instead, and middleware.ts uses the
// lighter auth.config.ts. Only ever imported from Node.js contexts (the API
// route handler, server components/actions) - never from middleware.
//
// Session strategy is explicitly "jwt", not left to default. Passing an
// adapter makes Auth.js default to "database" sessions (confirmed by reading
// @auth/core/lib/init.js), which would try to read/write a `Session` Prisma
// model - one was deliberately never added to schema.prisma (see its own
// comment: "JWT sessions - no Session table needed"). Getting this wrong
// would 500 on every sign-in attempt.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [Discord({ profile: discordProfile })],
  callbacks: {
    ...authConfig.callbacks,
    // JWT sessions carry no server-side lookup, so the user's id has to be
    // threaded through manually: token.sub is the user id Auth.js's own JWT
    // callback already sets from the adapter-created user, but
    // session.user.id doesn't exist by default and needs this to populate it.
    // handle-login.js (@auth/core) only ever runs the `profile()` mapping
    // above when *creating* a brand-new user row - a returning user's
    // sign-in reuses whatever name/email/image is already stored in
    // `users`, completely untouched. That means changing `discordProfile`'s
    // mapping (or the user renaming themselves on Discord later) would
    // silently never take effect for anyone who'd already signed in once,
    // unless it's re-applied here explicitly. `profile` is only present on
    // the JWT call that corresponds to an actual sign-in (not on every
    // request - JWT sessions decode the existing cookie otherwise), so this
    // doesn't add a DB/network cost to normal navigation.
    async jwt({ token, profile, account }) {
      if (account?.provider === "discord" && profile) {
        const discord = profile as DiscordProfile;
        if (discord.username) token.name = discord.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    // Keeps the persisted `users.name` column in sync too, not just the
    // JWT - the jwt() callback above is what actually fixes what the
    // signed-in user sees (immediately, this sign-in), this is just for
    // anything that queries the User table's name column directly.
    async signIn({ user, profile, account }) {
      if (account?.provider !== "discord" || !user.id) return;
      const discord = profile as DiscordProfile | undefined;
      if (!discord?.username) return;
      await prisma.user
        .update({ where: { id: user.id }, data: { name: discord.username } })
        .catch(() => {
          // Best-effort - a sign-in should never fail because this
          // housekeeping update didn't land.
        });
    },
  },
});
