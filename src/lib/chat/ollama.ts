import { MODEL_TIERS, type ModelTier } from "./model-config";

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
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
}

export interface StructuredResponse {
  message: string;
  actions: StructuredAction[];
}

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    message: {
      type: "string" as const,
      description:
        "Your natural language response to the user. Must be warm, concise, and human-friendly. NEVER include raw JSON fields, ISO dates, or technical details like P0/P1/estimateMinutes here.",
    },
    actions: {
      type: "array" as const,
      description:
        "Actions to execute. Empty array if no actions needed.",
      items: {
        type: "object" as const,
        properties: {
          type: {
            type: "string" as const,
            enum: [
              "create_tasks",
              "generate_schedule",
              "confirm_plan",
              "adjust_block",
            ],
          },
          tasks: {
            type: "array" as const,
            description: "Required for create_tasks. The tasks to create.",
            items: {
              type: "object" as const,
              properties: {
                title: { type: "string" as const },
                notes: {
                  type: "string" as const,
                  description:
                    "A brief description of the quest (1-2 sentences, max 500 characters). Infer from conversation context or title if not explicitly stated.",
                  maxLength: 500,
                },
                priority: {
                  type: "string" as const,
                  enum: ["high", "medium", "low"],
                },
                estimateMinutes: { type: "number" as const },
                dueDate: {
                  type: "string" as const,
                  description: "YYYY-MM-DD format. Use the date lookup table from the system prompt.",
                },
                startTime: {
                  type: "string" as const,
                  description:
                    "ISO datetime (e.g. 2026-03-21T20:00:00). Include ONLY when the user specifies a specific time.",
                },
              },
              required: ["title", "notes", "priority", "estimateMinutes"],
            },
          },
          blockTitle: {
            type: "string" as const,
            description: "Required for adjust_block.",
          },
          change: {
            type: "string" as const,
            description: "Required for adjust_block.",
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

// ── Streaming chat completion (both tiers) ────────────────────────────────────

export function chatCompletionStream(
  messages: OllamaMessage[],
  systemPrompt: string,
  tier: ModelTier = "fast"
): ReadableStream<Uint8Array> {
  const config = MODEL_TIERS[tier];
  const useStructuredOutput = tier === "capable";
  const fullMessages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.model,
            messages: fullMessages,
            stream: true,
            ...(useStructuredOutput ? { format: RESPONSE_SCHEMA } : {}),
            options: {
              temperature: config.temperature,
              num_predict: config.numPredict,
            },
          }),
        });

        if (!res.ok || !res.body) {
          const text = res.body ? await res.text() : `HTTP ${res.status}`;
          throw new Error(`Ollama streaming error: ${text}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullRaw = "";
        let buffer = "";

        // For capable tier: track JSON message field extraction
        let messageStartIndex = -1;
        let messageContent = "";
        let messageComplete = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Ollama streams newline-delimited JSON objects
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            let chunk: { message?: { content?: string }; done?: boolean };
            try {
              chunk = JSON.parse(line);
            } catch {
              continue;
            }

            const token = chunk.message?.content || "";
            if (!token) continue;

            fullRaw += token;

            if (useStructuredOutput) {
              // Capable tier: extract "message" field value from JSON stream
              // The structured output produces JSON like: {"message":"...","actions":[...]}
              // We incrementally find and stream just the message value.
              if (messageStartIndex === -1) {
                // Look for the start of the message value string
                const match = fullRaw.match(/"message"\s*:\s*"/);
                if (match) {
                  messageStartIndex = match.index! + match[0].length;
                  // Stream any message content we already have past the opening quote
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
                // We're inside the message string, stream new tokens
                // But we need to check the full accumulated content from messageStartIndex
                const available = fullRaw.slice(messageStartIndex + messageContent.length);
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
            } else {
              // Fast tier: stream all tokens directly
              emitToken(controller, encoder, token);
            }
          }
        }

        // Build done event
        if (useStructuredOutput) {
          // Parse the full JSON response
          const cleaned = fullRaw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          let parsed: StructuredResponse;
          try {
            parsed = JSON.parse(cleaned);
            if (typeof parsed.message !== "string") {
              parsed.message = messageContent || "I've processed your request.";
            }
            if (!Array.isArray(parsed.actions)) {
              parsed.actions = [];
            }
          } catch {
            // JSON parse failed — use whatever message content we extracted
            parsed = {
              message: messageContent || "I've processed your request.",
              actions: [],
            };
          }

          // Unescape the message content for the final done event
          const finalMessage = unescapeJsonString(parsed.message);

          const doneEvent: StreamEvent = {
            type: "done",
            fullMessage: finalMessage,
            parsed: { ...parsed, message: finalMessage },
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`)
          );
        } else {
          // Fast tier: strip think blocks, send done
          const fullMessage = fullRaw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          const doneEvent: StreamEvent = {
            type: "done",
            fullMessage,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`)
          );
        }

        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof TypeError &&
          (error.message.includes("fetch") || error.message.includes("connect"))
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

/**
 * Extract content from a JSON string value until we hit an unescaped quote.
 * Returns the extracted content and whether the closing quote was found.
 */
function extractUntilUnescapedQuote(s: string): { content: string; complete: boolean } {
  let result = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      // Escaped character — include the unescaped version
      const next = s[i + 1];
      if (next === '"') result += '"';
      else if (next === "n") result += "\n";
      else if (next === "t") result += "\t";
      else if (next === "\\") result += "\\";
      else result += next;
      i++; // skip the escaped char
    } else if (s[i] === '"') {
      // Unescaped quote — end of string value
      return { content: result, complete: true };
    } else {
      result += s[i];
    }
  }
  return { content: result, complete: false };
}

/**
 * Unescape a JSON string value (handles \\n, \\t, \\", \\\\)
 */
function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

// ── Error classes ─────────────────────────────────────────────────────────────

export class OllamaConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaConnectionError";
  }
}

export class OllamaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaParseError";
  }
}
