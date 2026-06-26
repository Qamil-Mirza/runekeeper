import twilio, { type Twilio } from "twilio";
import { createLogger } from "@/lib/logger";

const log = createLogger("phone");

let client: Twilio | null = null;

function getTwilioClient(): Twilio | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  if (!client) client = twilio(sid, token);
  return client;
}

export interface PlaceCallParams {
  to: string;
  /** Public URL Twilio will fetch and play (the synthesized MP3). */
  audioUrl: string;
}

/**
 * Places an outbound voice call that plays a single audio clip via inline
 * TwiML. No-ops (warns, returns false) when Twilio credentials or
 * `TWILIO_FROM_NUMBER` are unset — same graceful-degradation contract as
 * `sendEmail`. Returns true when a call was actually initiated.
 */
export async function placeCall({ to, audioUrl }: PlaceCallParams): Promise<boolean> {
  const tw = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!tw || !from) {
    log.warn({ to }, "Twilio not configured (SID/token/from) — skipping call");
    return false;
  }

  const twiml = `<Response><Play>${audioUrl}</Play></Response>`;
  const call = await tw.calls.create({ to, from, twiml });
  log.info({ to, sid: call.sid }, "call initiated");
  return true;
}
