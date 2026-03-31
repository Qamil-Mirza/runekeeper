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

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || "/", true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server — no auto-accept, we handle upgrades manually
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const { pathname } = parse(req.url || "/", true);

    if (pathname !== "/api/voice") {
      // Let Next.js HMR WebSocket through in development
      if (dev) return;
      socket.destroy();
      return;
    }

    // Authenticate via NextAuth JWT cookie
    const user = await authenticateUpgrade(req);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Accept the WebSocket connection
    wss.handleUpgrade(req, socket, head, (clientWs) => {
      handleVoiceSession(clientWs, user);
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(
      `> Voice WebSocket available at ws://${hostname}:${port}/api/voice`
    );
  });
});

async function handleVoiceSession(
  clientWs: WebSocket,
  user: { id: string; name: string; timezone: string }
) {
  const tracker = new VoiceSessionTracker();
  const { weekStart, weekEnd } = getCurrentWeekRange(user.timezone);

  // Load user context for the system prompt
  const [userTasks, userBlocks, memoryDigest] = await Promise.all([
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

  // Create Gemini Live session
  const gemini = new GeminiLiveSession(
    {
      onAudio: (pcmBuffer) => {
        // Forward PCM 24kHz audio to browser as binary
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(pcmBuffer);
        }
      },
      onToolCall: async (_id, name, args) => {
        // Send thinking state to client
        sendJson(clientWs, { type: "thinking" });

        const { result, summary } = await executeToolCall(
          name,
          args,
          user.id,
          weekStart,
          weekEnd,
          user.timezone,
          tracker
        );

        // Send action toast to client
        sendJson(clientWs, { type: "action", summary });
        sendJson(clientWs, { type: "thinking_end" });

        // Return result to Gemini so it can speak about it
        return {
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
            ? { blocksScheduled: result.proposedBlocks.length }
            : {}),
          ...(result.committed ? { committed: true } : {}),
        };
      },
      onTurnStart: () => {
        sendJson(clientWs, { type: "thinking" });
      },
      onTurnEnd: () => {
        sendJson(clientWs, { type: "thinking_end" });
      },
      onInputTranscript: (text) => {
        sendJson(clientWs, { type: "transcript_in", text });
      },
      onOutputTranscript: (text) => {
        sendJson(clientWs, { type: "transcript_out", text });
      },
      onClose: () => {
        const summary = tracker.buildSummary();
        sendJson(clientWs, { type: "session_end", summary });
      },
    },
    systemPrompt,
    VOICE_TOOL_DECLARATIONS
  );

  try {
    await gemini.connect();
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
    gemini.disconnect();
  });

  clientWs.on("error", () => {
    gemini.disconnect();
  });
}

function sendJson(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
