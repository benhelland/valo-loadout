import type { NextAuthConfig } from "next-auth";

// Split from src/auth.ts on purpose. This lightweight config has no
// PrismaAdapter and no provider secrets - middleware.ts uses it directly so
// route protection never has to touch the database or pull in Node-only
// dependencies just to check "is there a valid session cookie". The full
// config (src/auth.ts) spreads this and adds the adapter + Discord provider
// for actual sign-in, which only ever runs in the Node.js API route handler.
export const authConfig = {
  pages: {
    signIn: "/sign-in",
  },
  providers: [],
  callbacks: {
    // Gates every path matched by middleware.ts's config.matcher. Returning
    // false redirects to pages.signIn with a callbackUrl back to where the
    // user was headed - built in, not something this callback constructs
    // itself.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
