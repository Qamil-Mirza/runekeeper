import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    async jwt({ token, account, user }) {
      // On initial sign-in, persist tokens
      if (account && user) {
        token.userId = user.id;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;

        // Encrypt tokens before storing in the database
        if (account.access_token) {
          await db
            .update(accounts)
            .set({
              access_token: encrypt(account.access_token),
              refresh_token: account.refresh_token
                ? encrypt(account.refresh_token)
                : null,
            })
            .where(eq(accounts.providerAccountId, account.providerAccountId));
        }
      }

      // Check if token needs refresh
      if (token.expiresAt && Date.now() / 1000 > (token.expiresAt as number)) {
        return await refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
});

async function refreshAccessToken(token: any) {
  try {
    // Get encrypted refresh token from DB
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, token.userId as string))
      .limit(1);

    if (!account?.refresh_token) {
      throw new Error("No refresh token available");
    }

    const refreshToken = decrypt(account.refresh_token);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to refresh token");
    }

    // Update encrypted tokens in DB
    await db
      .update(accounts)
      .set({
        access_token: encrypt(data.access_token),
        expires_at: Math.floor(Date.now() / 1000 + data.expires_in),
        ...(data.refresh_token
          ? { refresh_token: encrypt(data.refresh_token) }
          : {}),
      })
      .where(eq(accounts.userId, token.userId as string));

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000 + data.expires_in),
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    };
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return { ...token, error: "RefreshTokenError" };
  }
}
