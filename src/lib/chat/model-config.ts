export interface GeminiConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
}

export const GEMINI_CONFIG: GeminiConfig = {
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  temperature: 0.4,
  maxOutputTokens: 2048,
};
