import { getAudio } from "@/lib/notifications/audio-cache";

/**
 * Serves a freshly-synthesized call MP3 by token. Twilio fetches this URL while
 * connecting the call, so it must be publicly reachable (the middleware allows
 * it through unauthenticated). Security is the unguessable token + short TTL.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });

  const audio = getAudio(token);
  if (!audio) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.length),
      "Cache-Control": "no-store",
    },
  });
}
