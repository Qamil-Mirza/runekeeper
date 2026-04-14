import { WebSocket } from "ws";
import { createLogger } from "@/lib/logger";

const log = createLogger("omi-bridge");

export interface SessionRegistry {
  activeVoiceSessions: Map<string, { clientWs: WebSocket; gemini: { sendAudioChunk: (buf: Buffer) => void } }>;
  eventConnections: Map<string, Set<WebSocket>>;
}

/**
 * Send a JSON event to all browser tabs for a given user.
 */
export function pushEventToUser(
  registry: SessionRegistry,
  userId: string,
  event: Record<string, unknown>
): boolean {
  const conns = registry.eventConnections.get(userId);
  if (!conns || conns.size === 0) {
    log.warn({ userId }, "no event connections for user");
    return false;
  }

  const payload = JSON.stringify(event);
  for (const ws of conns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
  log.info({ userId, type: (event as any).type, tabs: conns.size }, "event pushed");
  return true;
}

/**
 * Pipe OMI audio into the user's active Gemini voice session.
 * Returns true if audio was delivered, false if no active session.
 */
export function pipeOmiAudio(
  registry: SessionRegistry,
  userId: string,
  pcmBuffer: Buffer
): boolean {
  const session = registry.activeVoiceSessions.get(userId);
  if (!session) {
    return false;
  }

  if (!session.gemini) return false;
  session.gemini.sendAudioChunk(pcmBuffer);
  return true;
}

/**
 * Notify the browser that OMI is now the active mic source.
 */
export function setOmiActive(
  registry: SessionRegistry,
  userId: string,
  active: boolean
): void {
  const session = registry.activeVoiceSessions.get(userId);
  if (session && session.clientWs.readyState === WebSocket.OPEN) {
    session.clientWs.send(JSON.stringify({ type: "omi_active", active }));
  }
}

// ─── Shared registry reference ─────────────────────────────────────────────
// server.ts sets this at startup so the Next.js API route can access
// the in-memory session/event maps without importing server.ts directly.
//
// We use globalThis because Next.js compiles API routes with its own bundler,
// creating a separate module instance. A module-level variable would be null
// in the bundled copy even though server.ts already called setRegistry().
// globalThis is shared across the entire Node.js process.

const REGISTRY_KEY = "__omi_session_registry__";

export function setRegistry(registry: SessionRegistry): void {
  (globalThis as any)[REGISTRY_KEY] = registry;
}

export function getRegistry(): SessionRegistry | null {
  return (globalThis as any)[REGISTRY_KEY] ?? null;
}
