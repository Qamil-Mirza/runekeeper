import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { validateCredentials } from "@/lib/gradescope/gradescope-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:gradescope");

const putLimiter = rateLimit({
  key: "gradescope-put",
  limit: 5,
  windowMs: 60_000,
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, user.id),
        eq(integrations.provider, "gradescope")
      )
    )
    .limit(1);

  if (!integration) {
    return jsonResponse({
      enabled: false,
      config: { hasCredentials: false },
      lastSyncAt: null,
      lastSyncError: null,
    });
  }

  return jsonResponse({
    enabled: integration.enabled,
    config: {
      hasCredentials:
        !!integration.config?.gradescopeEmail &&
        !!integration.config?.gradescopePassword,
    },
    lastSyncAt: integration.lastSyncAt,
    lastSyncError: integration.lastSyncError,
  });
}

export async function PUT(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = putLimiter.check(user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const { enabled, gradescopeEmail, gradescopePassword } = body as {
    enabled?: boolean;
    gradescopeEmail?: string;
    gradescopePassword?: string;
  };

  // Input validation
  if (gradescopeEmail !== undefined) {
    if (typeof gradescopeEmail !== "string" || gradescopeEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gradescopeEmail)) {
      return errorResponse("Invalid email address", 400);
    }
  }
  if (gradescopePassword !== undefined) {
    if (typeof gradescopePassword !== "string" || gradescopePassword.length === 0 || gradescopePassword.length > 256) {
      return errorResponse("Invalid password", 400);
    }
  }

  // Validate credentials if both provided
  if (gradescopeEmail && gradescopePassword) {
    const valid = await validateCredentials(gradescopeEmail, gradescopePassword);
    if (!valid) {
      return errorResponse(
        "Invalid Gradescope credentials. Please check your email and password.",
        400
      );
    }
  }

  // Build config update
  const configUpdate: Record<string, unknown> = {};
  if (gradescopeEmail !== undefined)
    configUpdate.gradescopeEmail = gradescopeEmail;
  if (gradescopePassword)
    configUpdate.gradescopePassword = encrypt(gradescopePassword);

  // Get existing config to merge
  const [existing] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, user.id),
        eq(integrations.provider, "gradescope")
      )
    )
    .limit(1);

  const mergedConfig = { ...(existing?.config ?? {}), ...configUpdate };

  // Upsert
  const [updated] = await db
    .insert(integrations)
    .values({
      userId: user.id,
      provider: "gradescope",
      enabled: enabled ?? !!gradescopePassword,
      config: mergedConfig,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: {
        ...(enabled !== undefined && { enabled }),
        config: mergedConfig,
        updatedAt: new Date(),
      },
    })
    .returning();

  log.info(
    { userId: user.id, enabled: updated.enabled },
    "gradescope integration updated"
  );

  return jsonResponse({
    enabled: updated.enabled,
    config: {
      hasCredentials:
        !!updated.config?.gradescopeEmail &&
        !!updated.config?.gradescopePassword,
    },
    lastSyncAt: updated.lastSyncAt,
    lastSyncError: updated.lastSyncError,
  });
}
