import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * Auth config shared between the full auth setup (with DB adapter)
 * and the Edge-compatible middleware. This file must NOT import
 * anything that depends on Node.js modules (pg, crypto, etc.).
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
};
