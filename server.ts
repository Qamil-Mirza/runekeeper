import { createServer, type IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { authenticateUpgrade } from "./src/lib/voice/session-auth";
import { GeminiLiveSession } from "./src/lib/voice/gemini-live";
import {
  VOICE_TOOL_DECLARATIONS,
  executeToolCall,
  getCurrentWeekRange,
} from "./src/lib/voice/voice-tools";
import { buildVoiceSystemPrompt } from "./src/lib/voice/voice-prompt";
import { VoiceSessionTracker } from "./src/lib/chat/voice-session-tracker";
import {
  buildTodaySchedule,
  buildQuestSummary,
} from "./src/lib/chat/context-builder";
import { getMemoryDigest } from "./src/lib/chat/memory";
import { db } from "./src/db";
import { tasks, timeBlocks } from "./src/db/schema";
import { eq } from "drizzle-orm";
import { dbTaskToTask, dbBlockToTimeBlock } from "./src/lib/types";
import { VoiceSessionLogger } from "./src/lib/voice/session-logger";
import { setRegistry } from "./src/lib/voice/omi-bridge";

// ─── Registries (used by OMI webhook via omi-bridge) ───────────────────────
export const activeVoiceSessions = new Map<
  string,
  { clientWs: WebSocket; gemini: GeminiLiveSession }
>();

export const eventConnections = new Map<string, Set<WebSocket>>();

setRegistry({ activeVoiceSessions, eventConnections });

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Main HTTP server for Next.js
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || "/", true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  // Separate WebSocket server on its own port — avoids Next.js 15 upgrade interception
  const wsPort = parseInt(process.env.WS_PORT || "3001", 10);
  const wsServer = createServer();
  const wss = new WebSocketServer({ noServer: true });

  wsServer.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const { pathname } = parse(req.url || "/", true);
    console.log(`[ws] upgrade request: ${pathname}`);

    if (pathname === "/api/events") {
      const user = await authenticateUpgrade(req);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (clientWs) => {
        // Register event connection
        if (!eventConnections.has(user.id)) {
          eventConnections.set(user.id, new Set());
        }
        eventConnections.get(user.id)!.add(clientWs);
        console.log(`[events] connected: ${user.name} (${eventConnections.get(user.id)!.size} tabs)`);

        clientWs.on("close", () => {
          const conns = eventConnections.get(user.id);
          if (conns) {
            conns.delete(clientWs);
            if (conns.size === 0) eventConnections.delete(user.id);
          }
        });

        clientWs.on("error", () => {
          const conns = eventConnections.get(user.id);
          if (conns) {
            conns.delete(clientWs);
            if (conns.size === 0) eventConnections.delete(user.id);
          }
        });
      });
      return;
    }

    if (pathname !== "/api/voice") {
      socket.destroy();
      return;
    }

    const user = await authenticateUpgrade(req);
    console.log(`[ws] auth result: ${user ? user.name : "FAILED"}`);

    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      handleVoiceSession(clientWs, user);
    });
  });

  wsServer.listen(wsPort, hostname, () => {
    console.log(`> Voice WebSocket available at ws://${hostname}:${wsPort}/api/voice`);
  });
});

async function handleVoiceSession(
  clientWs: WebSocket,
  user: { id: string; name: string; timezone: string }
) {
  const tracker = new VoiceSessionTracker();
  const sessionLog = new VoiceSessionLogger(user.id, user.name);
  activeVoiceSessions.set(user.id, { clientWs, gemini: null! });
  const { weekStart, weekEnd } = getCurrentWeekRange(user.timezone);

  // Start Gemini TCP+TLS handshake in parallel with DB queries
  const gemini = new GeminiLiveSession(
    {
      onAudio: (pcmBuffer) => {
        // Forward PCM 24kHz audio to browser as binary
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(pcmBuffer);
        }
      },
      onToolCall: async (_id, name, args) => {
        sessionLog.logToolCall(name, args);
        // Send thinking state to client
        sendJson(clientWs, { type: "thinking" });

        const { result, summary, details } = await executeToolCall(
          name,
          args,
          user.id,
          weekStart,
          weekEnd,
          user.timezone,
          tracker
        );

        // Send action toast to client
        sendJson(clientWs, { type: "action", action: name, summary, details });
        sendJson(clientWs, { type: "thinking_end" });

        // Re-fetch current state so Gemini has up-to-date context
        const [freshTasks, freshBlocks] = await Promise.all([
          db
            .select()
            .from(tasks)
            .where(eq(tasks.userId, user.id))
            .then((rows) => rows.map(dbTaskToTask)),
          db
            .select()
            .from(timeBlocks)
            .where(eq(timeBlocks.userId, user.id))
            .then((rows) => rows.map(dbBlockToTimeBlock)),
        ]);

        const currentSchedule = buildTodaySchedule(freshBlocks, user.timezone);
        const currentQuests = buildQuestSummary(freshTasks, freshBlocks, user.timezone);

        // Return result + fresh context to Gemini so it can speak about it
        const toolResponse = {
          success: !result.error,
          ...(result.error ? { error: result.error } : {}),
          ...(result.tasksCreated
            ? {
                tasksCreated: result.tasksCreated.map((t) => ({
                  title: t.title,
                  status: t.status,
                })),
              }
            : {}),
          ...(result.proposedBlocks
            ? {
                blocksScheduled: result.proposedBlocks.map((b) => ({
                  title: b.title,
                  start: b.start,
                  end: b.end,
                })),
              }
            : {}),
          ...(result.committed ? { committed: true } : {}),
          currentSchedule,
          currentQuests,
        };
        sessionLog.logToolResult(name, toolResponse);
        return toolResponse;
      },
      onTurnStart: () => {
        sendJson(clientWs, { type: "thinking" });
      },
      onTurnEnd: () => {
        sendJson(clientWs, { type: "thinking_end" });
      },
      onInputTranscript: (text) => {
        sessionLog.logUserTranscript(text);
        sendJson(clientWs, { type: "transcript_in", text });
      },
      onOutputTranscript: (text) => {
        sessionLog.logAssistantTranscript(text);
        sendJson(clientWs, { type: "transcript_out", text });
      },
      onInterrupted: () => {
        sessionLog.logInterrupted();
        sendJson(clientWs, { type: "interrupted" });
      },
      onClose: () => {
        const summary = tracker.buildSummary();
        sessionLog.logEnd(summary);
        console.log(`[voice] session log saved: ${sessionLog.getFilePath()}`);
        sendJson(clientWs, { type: "session_end", summary });
      },
    },
    "",
    VOICE_TOOL_DECLARATIONS
  );

  try {
    // Open Gemini socket and load DB context in parallel
    const [, userTasks, userBlocks, memoryDigest] = await Promise.all([
      gemini.openSocket(),
      db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, user.id))
        .then((rows) => rows.map(dbTaskToTask)),
      db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.userId, user.id))
        .then((rows) => rows.map(dbBlockToTimeBlock)),
      getMemoryDigest(user.id),
    ]);

    const todaySchedule = buildTodaySchedule(userBlocks, user.timezone);
    const questSummary = buildQuestSummary(userTasks, userBlocks, user.timezone);

    const systemPrompt = buildVoiceSystemPrompt({
      userName: user.name,
      timezone: user.timezone,
      todaySchedule,
      questSummary,
      memoryDigest: memoryDigest || undefined,
    });

    gemini.updateSystemPrompt(systemPrompt);
    await gemini.sendSetupAndWait();
    activeVoiceSessions.set(user.id, { clientWs, gemini });
  } catch {
    sendJson(clientWs, {
      type: "error",
      message: "Couldn't connect to the Oracle — try again",
    });
    clientWs.close(1011, "gemini_connect_failed");
    return;
  }

  // Browser → Gemini: relay audio chunks
  let audioChunkCount = 0;
  clientWs.on("message", (data) => {
    if (Buffer.isBuffer(data)) {
      audioChunkCount++;
      if (audioChunkCount <= 3 || audioChunkCount % 50 === 0) {
        console.log(`[voice] audio chunk #${audioChunkCount}, size=${data.length}, gemini connected=${gemini.connected}`);
      }
      gemini.sendAudioChunk(data);
    } else if (Array.isArray(data)) {
      const buf = Buffer.concat(data);
      audioChunkCount++;
      console.log(`[voice] audio chunk (array) #${audioChunkCount}, size=${buf.length}`);
      gemini.sendAudioChunk(buf);
    } else {
      console.log(`[voice] non-binary message received: type=${typeof data}, length=${String(data).length}`);
    }
  });

  clientWs.on("close", () => {
    activeVoiceSessions.delete(user.id);
    gemini.disconnect();
  });

  clientWs.on("error", () => {
    activeVoiceSessions.delete(user.id);
    gemini.disconnect();
  });
}

function sendJson(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
