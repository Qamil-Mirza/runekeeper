import { writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";

export interface SessionLogEntry {
  timestamp: string;
  type: "user" | "assistant" | "tool_call" | "tool_result" | "interrupted" | "session_start" | "session_end";
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Logs voice session events (transcripts, tool calls, results) to a
 * per-session JSONL file for debugging. Each line is a JSON object.
 *
 * Files are written to `logs/voice-sessions/` at the project root.
 */
export class VoiceSessionLogger {
  private filePath: string;
  private sessionId: string;

  constructor(userId: string, userName: string) {
    const dir = join(process.cwd(), "logs", "voice-sessions");
    mkdirSync(dir, { recursive: true });

    this.sessionId = `${Date.now()}-${userId.slice(0, 8)}`;
    this.filePath = join(dir, `${this.sessionId}.jsonl`);

    // Write header as first entry
    this.log({
      type: "session_start",
      content: `Voice session started for ${userName}`,
      metadata: { userId, userName },
    });
  }

  log(entry: Omit<SessionLogEntry, "timestamp">) {
    const full: SessionLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    appendFileSync(this.filePath, JSON.stringify(full) + "\n");
  }

  logUserTranscript(text: string) {
    this.log({ type: "user", content: text });
  }

  logAssistantTranscript(text: string) {
    this.log({ type: "assistant", content: text });
  }

  logToolCall(name: string, args: Record<string, any>) {
    this.log({
      type: "tool_call",
      content: name,
      metadata: { args },
    });
  }

  logToolResult(name: string, result: Record<string, any>) {
    this.log({
      type: "tool_result",
      content: name,
      metadata: { result },
    });
  }

  logInterrupted() {
    this.log({ type: "interrupted", content: "User interrupted assistant" });
  }

  logEnd(summary: string) {
    this.log({ type: "session_end", content: summary });
  }

  getFilePath(): string {
    return this.filePath;
  }
}
