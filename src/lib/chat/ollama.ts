const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:latest";

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

export async function chatCompletion(
  messages: OllamaMessage[],
  systemPrompt: string
): Promise<string> {
  const fullMessages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: fullMessages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 1024,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data: OllamaChatResponse = await res.json();
    return data.message.content;
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.message.includes("fetch") || error.message.includes("connect"))
    ) {
      throw new OllamaConnectionError(
        "Cannot connect to Ollama. Ensure Ollama is running locally."
      );
    }
    throw error;
  }
}

export class OllamaConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaConnectionError";
  }
}
