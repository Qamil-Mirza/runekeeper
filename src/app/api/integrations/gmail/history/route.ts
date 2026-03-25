import { db } from "@/db";
import { processedEmails } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:gmail:history");

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const emails = await db
    .select()
    .from(processedEmails)
    .where(eq(processedEmails.userId, user.id))
    .orderBy(desc(processedEmails.processedAt))
    .limit(20);

  log.info({ userId: user.id, count: emails.length }, "fetched email history");
  return jsonResponse(emails);
}
