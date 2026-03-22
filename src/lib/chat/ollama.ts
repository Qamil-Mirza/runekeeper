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

// ── Streaming response type for SSE events ────────────────────────────────────

export type StreamEvent =
  | { type: "token"; content: string }
  | { type: "done"; fullMessage: string };

// ── Chat completion with structured output (capable tier) ─────────────────────

export async function chatCompletion(
  messages: OllamaMessage[],
  systemPrompt: string,
  tier: ModelTier = "capable"
): Promise<StructuredResponse> {
  const config = MODEL_TIERS[tier];
  const fullMessages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: fullMessages,
        stream: false,
        format: RESPONSE_SCHEMA,
        options: {
          temperature: config.temperature,
          num_predict: config.numPredict,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data: OllamaChatResponse = await res.json();

    // Strip Qwen think blocks if present
    let content = data.message.content;
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    const parsed: StructuredResponse = JSON.parse(content);

    // Validate basic structure
    if (typeof parsed.message !== "string") {
      parsed.message = "I've processed your request.";
    }
    if (!Array.isArray(parsed.actions)) {
      parsed.actions = [];
    }

    return parsed;
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.message.includes("fetch") || error.message.includes("connect"))
    ) {
      throw new OllamaConnectionError(
        "Cannot connect to Ollama. Ensure Ollama is running locally."
      );
    }
    if (error instanceof SyntaxError) {
      throw new OllamaParseError("Failed to parse structured response from model.");
    }
    throw error;
  }
}

// ── Streaming chat completion (fast tier) ─────────────────────────────────────

export function chatCompletionStream(
  messages: OllamaMessage[],
  systemPrompt: string
): ReadableStream<Uint8Array> {
  const config = MODEL_TIERS.fast;
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
        let fullMessage = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Ollama streams newline-delimited JSON objects
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
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

            // Stream each Ollama chunk as a single token event
            // (think blocks are stripped post-hoc on fullMessage since
            // /no_think suppresses them and tag boundaries can split across chunks)
            fullMessage += token;
            const event: StreamEvent = { type: "token", content: token };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          }
        }

        // Strip any think blocks that slipped through despite /no_think
        fullMessage = fullMessage.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        // Send done event with full message
        const doneEvent: StreamEvent = {
          type: "done",
          fullMessage,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`)
        );
        controller.close();
      } catch (error) {
        // Send error as an SSE event so the client can handle it
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
