export type QueryComplexity = "simple" | "complex";

const ACTION_KEYWORDS =
  /\b(plan|schedule|generate|create|add\s+task|move|adjust|reschedule|remove|delete|cancel|set\s+up|commit|confirm)\b/i;

const TIME_EXPRESSIONS =
  /\b(at\s+\d{1,2}(:\d{2})?\s*(am|pm)|tomorrow|tmr|tmrw|next\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|today|tonight|this\s+(morning|afternoon|evening))\b/i;

const DAY_NAMES =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const QUESTION_STARTERS =
  /^(what|when|where|who|how|show|tell|can you|do i|is there|are there)\b/i;

// Explicit greetings/acks that are safe to route to the fast model
// even mid-conversation — they never require actions
const GREETING_PATTERNS =
  /^(h(i|ello|ey|owdy)|good\s+(morning|afternoon|evening)|thanks?(\s+you)?|thank\s+you|bye|goodbye|see\s+ya|ok(ay)?|cool|nice|awesome|great|perfect|got\s+it|no\s+worries|np|gm|gn)[\s!.?]*$/i;

/**
 * Classifies the complexity of a user message to determine which model tier
 * should handle it. Conservative bias: defaults to "complex" when uncertain.
 *
 * Simple queries: greetings, acknowledgments, short questions
 * Complex queries: task creation, scheduling, multi-step requests,
 *                  AND mid-conversation follow-ups (confirmations, etc.)
 */
export function classifyComplexity(
  message: string,
  conversationLength: number
): QueryComplexity {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Action keywords always need the capable model
  if (ACTION_KEYWORDS.test(lower)) {
    return "complex";
  }

  // Multiple items (lists) need capable model
  const segments = trimmed.split(/[,\n;]|(?:\band\b)/i).filter((s) => s.trim().length > 3);
  if (segments.length >= 3) {
    return "complex";
  }

  // Time expressions need temporal reasoning
  if (TIME_EXPRESSIONS.test(lower) || DAY_NAMES.test(lower)) {
    return "complex";
  }

  // Long messages usually contain task details
  if (trimmed.length > 100) {
    return "complex";
  }

  // Explicit greetings/acks are always safe for the fast model
  if (GREETING_PATTERNS.test(lower)) {
    return "simple";
  }

  // Early in conversation: short messages are likely greetings
  if (conversationLength <= 2 && trimmed.length < 50) {
    // Short questions early on can use fast model
    if (QUESTION_STARTERS.test(lower) || trimmed.length < 30) {
      return "simple";
    }
  }

  // Mid-conversation: only explicit greetings (matched above) go to fast model.
  // Everything else — including short follow-ups like "let's lock it in",
  // "yes do it", "sounds good" — needs the capable model because they may
  // be confirmations that trigger actions.

  // Default: use capable model
  return "complex";
}
