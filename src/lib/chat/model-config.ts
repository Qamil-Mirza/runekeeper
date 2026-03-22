export type ModelTier = "fast" | "capable";

export interface ModelConfig {
  model: string;
  temperature: number;
  numPredict: number;
}

export const MODEL_TIERS: Record<ModelTier, ModelConfig> = {
  fast: {
    model: process.env.OLLAMA_MODEL_FAST || "qwen3:1.7b",
    temperature: 0.5,
    numPredict: 512,
  },
  capable: {
    model: process.env.OLLAMA_MODEL || "qwen3:latest",
    temperature: 0.7,
    numPredict: 2048,
  },
};
