import { auth } from "@/lib/auth";
import { undoLastCommit, performUndo, canUndo } from "@/lib/undo";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

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
    console.error("Undo failed:", err);
    return errorResponse("Undo failed", 400);
  }
}
