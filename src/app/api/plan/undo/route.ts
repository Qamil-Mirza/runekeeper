import { auth } from "@/lib/auth";
import { undoLastCommit, performUndo, canUndo } from "@/lib/undo";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:plan:undo");
const undoLimiter = rateLimit({ key: "plan-undo", limit: 10, windowMs: 60_000 });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = undoLimiter.check(session.user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  const accessToken = (session as any).accessToken;
  const body = await req.json();
  const sessionId = body.sessionId;

  try {
    let result;

    if (sessionId) {
      const undoable = await canUndo(sessionId, session.user.id);
      if (!undoable) {
        return errorResponse(
          "Cannot undo: session not found or undo window has expired",
          400
        );
      }
      result = await performUndo(sessionId, session.user.id, accessToken);
    } else {
      result = await undoLastCommit(session.user.id, accessToken);
    }

    return jsonResponse({
      success: true,
      undone: result.undone,
      errors: result.errors,
    });
  } catch (err: any) {
    log.error({ err }, "undo failed");
    return errorResponse("Undo failed", 400);
  }
}
