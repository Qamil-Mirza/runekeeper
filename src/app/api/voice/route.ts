import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Next.js App Router does not natively support WebSocket upgrades.
  // The full WebSocket implementation requires a custom server setup
  // (e.g., a separate Node.js WebSocket server or Next.js custom server adapter).
  //
  // This route documents the expected protocol contract. The client-side
  // code connects to this URL, so the upgrade will be seamless once the
  // custom WebSocket server is configured.
  return new Response(
    JSON.stringify({
      status: "ready",
      message: "Voice API is available. Connect via WebSocket for voice sessions.",
      protocol: {
        connect: "Upgrade to WebSocket at this URL",
        send: "Binary frames: PCM 16-bit 16kHz audio chunks",
        receive: {
          binary: "PCM audio response from Oracle",
          text: "JSON control messages: { type: 'action' | 'thinking' | 'thinking_end' | 'session_end' | 'error', ... }",
        },
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
