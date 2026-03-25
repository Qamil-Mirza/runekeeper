import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { createLogger } from "@/lib/logger";

const log = createLogger("gmail-analyzer");

// -- Email analysis types ----------------------------------------------------

export interface EmailAnalysis {
  hasActionableContent: boolean;
  tasks: Array<{
    title: string;
    notes: string;
    priority: "high" | "medium" | "low";
    estimateMinutes: number;
    dueDate?: string;
  }>;
  reasoning: string;
}

// -- Structured response schema ----------------------------------------------

const GMAIL_ANALYSIS_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    hasActionableContent: {
      type: SchemaType.BOOLEAN,
      description: "Whether the email contains actionable items worth tracking as tasks.",
    },
    tasks: {
      type: SchemaType.ARRAY,
      description: "Extracted actionable tasks. Empty array if none found.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Concise task title.",
          },
          notes: {
            type: SchemaType.STRING,
            description: "Brief context or details about the task (1-2 sentences).",
          },
          priority: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["high", "medium", "low"],
          },
          estimateMinutes: {
            type: SchemaType.NUMBER,
            description: "Estimated time to complete the task in minutes.",
          },
          dueDate: {
            type: SchemaType.STRING,
            description: "Due date in YYYY-MM-DD format, if mentioned in the email.",
          },
        },
        required: ["title", "notes", "priority", "estimateMinutes"],
      },
    },
    reasoning: {
      type: SchemaType.STRING,
      description: "Brief explanation of why the email was or was not considered actionable.",
    },
  },
  required: ["hasActionableContent", "tasks", "reasoning"],
};

// -- Analyze email -----------------------------------------------------------

const SYSTEM_PROMPT =
  "You are an email analyzer for a task management app called Runekeeper. " +
  "Given an email, determine if it contains actionable items the user should track as tasks. " +
  "Only flag truly actionable items — not newsletters, marketing, or informational updates. " +
  "Extract task title, priority, estimated time, and due date if mentioned. " +
  "Be concise in task titles.";

export async function analyzeEmail(email: {
  from: string;
  subject: string;
  body: string;
  date: string;
}): Promise<EmailAnalysis> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GMAIL_ANALYSIS_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const userContent =
    `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;

  try {
    const result = await model.generateContent(userContent);
    const text = result.response.text();
    const parsed: EmailAnalysis = JSON.parse(text);

    log.info(
      { actionable: parsed.hasActionableContent, taskCount: parsed.tasks.length },
      "email analysis complete",
    );

    return parsed;
  } catch (error) {
    log.error({ err: error }, "failed to analyze email");
    return {
      hasActionableContent: false,
      tasks: [],
      reasoning: "Failed to analyze email",
    };
  }
}

// -- HTML helpers ------------------------------------------------------------

export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}
