import { mkdirSync, appendFileSync } from "fs";
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
 * Logging is best-effort: if the directory is not writable (e.g. in
 * read-only container filesystems), the logger disables itself rather
 * than crash the voice session.
 */
export class VoiceSessionLogger {
  private filePath: string = "";
  private sessionId: string;
  private disabled = false;

  constructor(userId: string, userName: string) {
    this.sessionId = `${Date.now()}-${userId.slice(0, 8)}`;

    try {
      const dir = join(process.cwd(), "logs", "voice-sessions");
      mkdirSync(dir, { recursive: true });
      this.filePath = join(dir, `${this.sessionId}.jsonl`);
    } catch (err) {
      this.disabled = true;
      console.warn(
        `[voice-logger] disabled (cannot create log dir): ${(err as Error).message}`
      );
      return;
    }

    this.log({
      type: "session_start",
      content: `Voice session started for ${userName}`,
      metadata: { userId, userName },
    });
  }

  log(entry: Omit<SessionLogEntry, "timestamp">) {
    if (this.disabled) return;
    const full: SessionLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    try {
      appendFileSync(this.filePath, JSON.stringify(full) + "\n");
    } catch (err) {
      this.disabled = true;
      console.warn(
        `[voice-logger] disabled after write failure: ${(err as Error).message}`
      );
    }
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
    return this.disabled ? "(disabled)" : this.filePath;
  }
}
