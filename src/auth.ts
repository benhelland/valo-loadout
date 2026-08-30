import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";

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
  providers: [Discord],
  callbacks: {
    ...authConfig.callbacks,
    // JWT sessions carry no server-side lookup, so the user's id has to be
    // threaded through manually: token.sub is the user id Auth.js's own JWT
    // callback already sets from the adapter-created user, but
    // session.user.id doesn't exist by default and needs this to populate it.
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
