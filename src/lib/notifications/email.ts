import { Resend } from "resend";
import { createLogger } from "@/lib/logger";

const log = createLogger("email");

const DEFAULT_FROM = "Runekeeper <onboarding@resend.dev>";

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a transactional email via Resend. No-ops (with a warning) when
 * RESEND_API_KEY is unset, so local dev without a key never crashes the
 * scheduler or API routes. Returns true when an email was actually sent.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    log.warn({ to, subject }, "RESEND_API_KEY not set — skipping email send");
    return false;
  }

  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const { error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    log.error({ to, subject, error }, "resend send failed");
    throw new Error(`Resend send failed: ${error.message ?? String(error)}`);
  }

  log.info({ to, subject }, "email sent");
  return true;
}
