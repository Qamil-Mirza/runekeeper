/** Read a request body as JSON. `{ ok: false }` when it is not valid JSON. Never logs the body. */
export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false };
  }
}
