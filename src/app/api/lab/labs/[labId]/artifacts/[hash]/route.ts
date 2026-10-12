import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { getArtifact, isValidLabId } from "@/lib/lab/manager";
import { ARTIFACT_HASH_PATTERN } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

/** One stored document of a lab (the body of a record), by its content hash. */
export function GET(req: Request, { params }: { params: Promise<{ labId: string; hash: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { labId, hash } = await params;
    if (!isValidLabId(labId) || !ARTIFACT_HASH_PATTERN.test(hash)) return labError(404, "not_found", "Not found");
    const artifact = await getArtifact(config, actor, labId, hash);
    // The hash names the content, so what comes back can be checked against it.
    if (createHash("sha256").update(artifact.content, "utf8").digest("hex") !== hash) {
      return labError(502, "manager_bad_response", "The stored document does not match its hash");
    }
    return NextResponse.json(artifact);
  });
}
