import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerationConfig,
} from "@google/generative-ai";
import type { Task } from "@/lib/types";
import { GEMINI_CONFIG } from "@/lib/chat/model-config";
import { buildGogginsRant } from "@/lib/notifications/goggins";
import { createLogger } from "@/lib/logger";

const log = createLogger("goggins-rant");

const MIN_RANT_CHARS = 40; // shorter than this = Gemini gave us nothing usable
const RANT_TEMPERATURE = 0.9; // high, so every call sounds different
const RANT_MAX_TOKENS = 400; // a phone rant is short; ~150 tokens is plenty

// gemini-2.5-flash is a "thinking" model: by default it spends the output-token
// budget on hidden reasoning and returns a truncated/empty rant (finishReason
// MAX_TOKENS). Disabling thinking gives the whole budget to the actual reply.
// thinkingConfig isn't in @google/generative-ai@0.24's types, but the 2.5 API
// honors it — so extend the config type rather than cast it away.
type ThinkingGenerationConfig = GenerationConfig & {
  thinkingConfig?: { thinkingBudget?: number };
};

// Profanity is the point here (the user opted into the hard-R version), so the
// default Gemini safety filters — which treat profane "harassment" as blockable —
// would otherwise refuse. Disable them for this one self-directed motivational
// call; the prompt forbids slurs and hate, and the static fallback covers a block.
const PERMISSIVE_SAFETY = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

/** Whole days between two "YYYY-MM-DD" dates (b - a), DST-safe (pure UTC math). */
function daysOverdue(dueDate: string, today: string): number {
  const due = Date.parse(dueDate + "T00:00:00Z");
  const now = Date.parse(today + "T00:00:00Z");
  return Math.round((now - due) / 86_400_000);
}

/** One bullet per overdue quest, worst offender first, for the prompt. */
function overdueLines(overdue: Task[], today: string): string {
  return [...overdue]
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .map((t) => {
      const days = t.dueDate ? daysOverdue(t.dueDate, today) : 0;
      const unit = days === 1 ? "day" : "days";
      return `- "${t.title}" — ${days} ${unit} overdue (${t.priority} priority)`;
    })
    .join("\n");
}

const SYSTEM_PROMPT = [
  "You are a furious, no-excuses accountability coach making a LIVE PHONE CALL to",
  "someone who has let their tasks rot past their deadlines. Your job is to light a",
  "fire under them so they get up and do the work RIGHT NOW.",
  "",
  "Voice and tone:",
  "- Raw, intense, in-your-face. Profanity is encouraged — swear freely.",
  "- Talk directly to them as 'you'. Call out their specific overdue tasks by name.",
  "- Use the number of days each task is overdue to make it sting.",
  "- Absolutely NO slurs, NO hate, NO attacks on identity (race, gender, religion,",
  "  orientation, etc.). The anger is aimed only at their procrastination.",
  "",
  "Output rules (this text is spoken aloud over a phone, then the call ends):",
  "- Plain spoken words only. No markdown, no emojis, no stage directions, no",
  "  asterisks, no narration like '*slams desk*'. Just what you'd actually say.",
  "- Keep it tight: roughly 60 to 110 words. End on a hard, punchy command to act.",
].join("\n");

/** Calls Gemini for a dynamic rant; returns null on any failure so the caller falls back. */
async function generateWithGemini(
  overdue: Task[],
  today: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const userPrompt = [
    `Today is ${today}. These quests are PAST DUE and STILL not done:`,
    "",
    overdueLines(overdue, today),
    "",
    "Make the call. Go.",
  ].join("\n");

  const generationConfig: ThinkingGenerationConfig = {
    temperature: RANT_TEMPERATURE,
    maxOutputTokens: RANT_MAX_TOKENS,
    thinkingConfig: { thinkingBudget: 0 },
  };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_CONFIG.model,
    systemInstruction: SYSTEM_PROMPT,
    safetySettings: PERMISSIVE_SAFETY,
    generationConfig,
  });

  const result = await model.generateContent(userPrompt);
  return sanitizeForSpeech(result.response.text());
}

/** Strip anything that shouldn't be read aloud (markdown, bracketed/asterisked stage directions). */
function sanitizeForSpeech(raw: string): string {
  return raw
    .replace(/^\s*\([^)]*\)\s*/, " ") // leading "(Phone rings...)" stage direction
    .replace(/\*[^*\n]*\*/g, " ") // *slams desk* style actions
    .replace(/\[[^\]\n]*\]/g, " ") // [bracketed] stage directions
    .replace(/[*_`#>]/g, "") // leftover markdown punctuation
    .replace(/\s+/g, " ") // collapse newlines/runs into single spaces
    .trim();
}

/**
 * Produces the spoken accountability script for a user's overdue quests. Tries
 * Gemini for a dynamic, task-specific rant and falls back to the deterministic
 * `buildGogginsRant` template whenever Gemini is unavailable (no API key), errors,
 * is safety-blocked, or returns something too short to use. Returns `null` when
 * nothing is overdue, mirroring `buildGogginsRant` — the caller skips the call.
 */
export async function generateGogginsRant(
  overdue: Task[],
  today: string
): Promise<string | null> {
  if (overdue.length === 0) return null;

  try {
    const dynamic = await generateWithGemini(overdue, today);
    if (dynamic && dynamic.length >= MIN_RANT_CHARS) {
      log.info(
        { count: overdue.length, chars: dynamic.length },
        "generated dynamic rant"
      );
      return dynamic;
    }
    log.warn("dynamic rant unavailable or too short — using static fallback");
  } catch (err) {
    log.error({ err }, "dynamic rant generation failed — using static fallback");
  }

  return buildGogginsRant(overdue, today);
}
