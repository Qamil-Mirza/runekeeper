import { decode } from "next-auth/jwt";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "@/lib/logger";
import type { IncomingMessage } from "http";

const log = createLogger("voice-auth");

interface VoiceUser {
  id: string;
  name: string;
  timezone: string;
}

export async function authenticateUpgrade(
  req: IncomingMessage
): Promise<VoiceUser | null> {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const tokenCookie =
      parseCookie(cookieHeader, "__Secure-authjs.session-token") ||
      parseCookie(cookieHeader, "authjs.session-token") ||
      parseCookie(cookieHeader, "__Secure-next-auth.session-token") ||
      parseCookie(cookieHeader, "next-auth.session-token");

    if (!tokenCookie) return null;

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      log.error("AUTH_SECRET not set");
      return null;
    }

    // Determine salt based on which cookie was found
    const isSecure = !!parseCookie(cookieHeader, "__Secure-authjs.session-token") ||
                     !!parseCookie(cookieHeader, "__Secure-next-auth.session-token");
    const salt = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";

    const decoded = await decode({ token: tokenCookie, secret, salt });
    if (!decoded?.userId && !decoded?.sub) return null;

    const userId = (decoded.userId as string) || (decoded.sub as string);

    const [user] = await db
      .select({ id: users.id, name: users.name, timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    log.info({ userId: user.id }, "voice session authenticated");
    return user;
  } catch (err) {
    log.error({ err }, "voice auth failed");
    return null;
  }
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
