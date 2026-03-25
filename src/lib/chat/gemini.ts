import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { GEMINI_CONFIG } from "./model-config";
import { createLogger } from "@/lib/logger";

const log = createLogger("gemini");

// ── Message types ─────────────────────────────────────────────────────────────

export interface GeminiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Structured response schema ────────────────────────────────────────────────

export interface TaskAction {
  title: string;
  notes?: string;
  priority: "high" | "medium" | "low";
  estimateMinutes: number;
  dueDate?: string;
  startTime?: string;
}

export interface StructuredAction {
  type: "create_tasks" | "generate_schedule" | "confirm_plan" | "adjust_block";
  tasks?: TaskAction[];
  blockTitle?: string;
  change?: string;
  newEstimateMinutes?: number;
  newStartTime?: string;
}

export interface StructuredResponse {
  message: string;
  actions: StructuredAction[];
}

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    message: {
      type: SchemaType.STRING,
      description:
        "Your natural language response to the user. Must be warm, concise, and human-friendly. NEVER include raw JSON fields, ISO dates, or technical details like P0/P1/estimateMinutes here.",
    },
    actions: {
      type: SchemaType.ARRAY,
      description: "Actions to execute. Empty array if no actions needed.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [
              "create_tasks",
              "generate_schedule",
              "confirm_plan",
              "adjust_block",
            ],
          },
          tasks: {
            type: SchemaType.ARRAY,
            description: "Required for create_tasks. The tasks to create.",
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING },
                notes: {
                  type: SchemaType.STRING,
                  description:
                    "A brief description of the quest (1-2 sentences, max 500 characters). Infer from conversation context or title if not explicitly stated.",
                },
                priority: {
                  type: SchemaType.STRING,
                  format: "enum",
                  enum: ["high", "medium", "low"],
                },
                estimateMinutes: { type: SchemaType.NUMBER },
                dueDate: {
                  type: SchemaType.STRING,
                  description:
                    "YYYY-MM-DD format. Use the date lookup table from the system prompt.",
                },
                startTime: {
                  type: SchemaType.STRING,
                  description:
                    "ISO datetime (e.g. 2026-03-21T20:00:00). Include ONLY when the user specifies a specific time.",
                },
              },
              required: ["title", "notes", "priority", "estimateMinutes"],
            },
          },
          blockTitle: {
            type: SchemaType.STRING,
            description: "Required for adjust_block.",
          },
          change: {
            type: SchemaType.STRING,
            description: "Required for adjust_block. Describe the change.",
          },
          newEstimateMinutes: {
            type: SchemaType.NUMBER,
            description:
              "For adjust_block: the new duration in minutes. Include when the user changes how long a task should be.",
          },
          newStartTime: {
            type: SchemaType.STRING,
            description:
              "For adjust_block: new start time as ISO datetime (e.g. 2026-03-24T08:30:00). Include when the user changes when a task should start.",
          },
        },
        required: ["type"],
      },
    },
  },
  required: ["message", "actions"],
};

// ── Streaming response types for SSE events ───────────────────────────────────

export type StreamEvent =
  | { type: "token"; content: string }
  | { type: "done"; fullMessage: string; parsed?: StructuredResponse }
  | { type: "error"; error: string };

// ── Streaming chat completion ─────────────────────────────────────────────────

export function chatCompletionStream(
  messages: GeminiMessage[],
  systemPrompt: string,
  trace?: { generation: (opts: any) => any }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({
          model: GEMINI_CONFIG.model,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: GEMINI_CONFIG.temperature,
            maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        });

        // Convert messages to Gemini Content format
        const contents = messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));

        const startTime = Date.now();
        const generation = trace?.generation({
          name: "gemini-chat",
          model: GEMINI_CONFIG.model,
          input: { messages: contents, systemPrompt },
        });

        const result = await model.generateContentStream({ contents });

        let fullRaw = "";
        let messageStartIndex = -1;
        let messageContent = "";
        let messageComplete = false;

        for await (const chunk of result.stream) {
          const token = chunk.text();
          if (!token) continue;

          fullRaw += token;

          // Incrementally extract "message" field and stream it as tokens
          if (messageStartIndex === -1) {
            const match = fullRaw.match(/"message"\s*:\s*"/);
            if (match) {
              messageStartIndex = match.index! + match[0].length;
              const available = fullRaw.slice(messageStartIndex);
              const extracted = extractUntilUnescapedQuote(available);
              if (extracted.content) {
                messageContent += extracted.content;
                emitToken(controller, encoder, extracted.content);
              }
              if (extracted.complete) {
                messageComplete = true;
              }
            }
          } else if (!messageComplete) {
            const available = fullRaw.slice(
              messageStartIndex + messageContent.length
            );
            const extracted = extractUntilUnescapedQuote(available);
            if (extracted.content) {
              messageContent += extracted.content;
              emitToken(controller, encoder, extracted.content);
            }
            if (extracted.complete) {
              messageComplete = true;
            }
          }
          // After message is complete, silently buffer the rest (actions)
        }

        // Parse the full JSON response
        const latencyMs = Date.now() - startTime;
        log.debug({ rawLength: fullRaw.length, latencyMs }, "raw response received");

        let parsed: StructuredResponse;
        let parseSuccess = true;
        try {
          parsed = JSON.parse(fullRaw.trim());
          if (typeof parsed.message !== "string") {
            parsed.message =
              messageContent || "I've processed your request.";
          }
          if (!Array.isArray(parsed.actions)) {
            parsed.actions = [];
          }
          const actionTypes = parsed.actions.map((a) => a.type);
          log.info({ actionCount: parsed.actions.length, actionTypes, latencyMs }, "parsed structured response");
        } catch (e) {
          parseSuccess = false;
          log.error({ err: e, latencyMs }, "JSON parse failed");
          parsed = {
            message: messageContent || "I've processed your request.",
            actions: [],
          };
        }

        // Capture token usage if available
        let usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null = null;
        try {
          const finalResponse = await result.response;
          usageMetadata = finalResponse?.usageMetadata ?? null;
        } catch {
          // Some Gemini SDK versions don't support .response after streaming
        }

        generation?.end({
          output: parsed,
          ...(usageMetadata ? {
            usage: {
              input: usageMetadata.promptTokenCount ?? 0,
              output: usageMetadata.candidatesTokenCount ?? 0,
              total: usageMetadata.totalTokenCount ?? 0,
            },
          } : {}),
          metadata: {
            parseSuccess,
            actionCount: parsed.actions.length,
            latencyMs,
          },
        });

        const finalMessage = unescapeJsonString(parsed.message);

        const doneEvent: StreamEvent = {
          type: "done",
          fullMessage: finalMessage,
          parsed: { ...parsed, message: finalMessage },
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`)
        );

        controller.close();
      } catch (error) {
        log.error({ err: error }, "stream error");
        const errorMessage =
          error instanceof TypeError &&
          (error.message.includes("fetch") ||
            error.message.includes("connect"))
            ? "connection_error"
            : "stream_error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emitToken(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  content: string
) {
  const event: StreamEvent = { type: "token", content };
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function extractUntilUnescapedQuote(s: string): {
  content: string;
  complete: boolean;
} {
  let result = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === '"') result += '"';
      else if (next === "n") result += "\n";
      else if (next === "t") result += "\t";
      else if (next === "\\") result += "\\";
      else result += next;
      i++;
    } else if (s[i] === '"') {
      return { content: result, complete: true };
    } else {
      result += s[i];
    }
  }
  return { content: result, complete: false };
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
