import { createLogger } from "@/lib/logger";

const log = createLogger("tts");

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_MODEL = "eleven_turbo_v2_5";

/**
 * Synthesizes speech to an MP3 buffer via ElevenLabs. Returns `null` (with a
 * warning) when `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` are unset or the
 * request fails, so callers degrade gracefully instead of crashing — the same
 * "no-op without credentials" contract as `sendEmail`.
 *
 * Use a generic intense library voice via `ELEVENLABS_VOICE_ID`. Do NOT clone a
 * real person's voice (violates ElevenLabs' terms).
 */
export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    log.warn("ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID not set — skipping TTS");
    return null;
  }

  const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

  try {
    const res = await fetch(`${ELEVENLABS_BASE}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.6 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.error({ status: res.status, detail }, "ElevenLabs TTS request failed");
      return null;
    }

    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    log.error({ err }, "ElevenLabs TTS request threw");
    return null;
  }
}
