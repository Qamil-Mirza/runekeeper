"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { OracleOrb, type OrbState } from "./oracle-orb";
import { VoiceModeControls } from "./voice-mode-controls";
import { VoiceToast } from "./voice-toast";
import { useAudioPipeline } from "./use-audio-pipeline";
import { useVoiceSession, type VoiceToastData } from "./use-voice-session";

interface VoiceModeProps {
  onExit: () => void;
}

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Ready",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
  muted: "Muted",
};

export function VoiceMode({ onExit }: VoiceModeProps) {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [amplitude, setAmplitude] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [toastData, setToastData] = useState<VoiceToastData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workletNodeRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const audioPipeline = useAudioPipeline({
    onStateChange: setOrbState,
    onAmplitudeChange: setAmplitude,
    isMuted,
  });

  const voiceSession = useVoiceSession({
    onAudioReceived: (pcmData) => {
      audioPipeline.playAudio(pcmData);
    },
    onActionToast: (data) => {
      setToastData(data);
    },
    onSessionEnd: () => {
      audioPipeline.stop();
      onExit();
    },
    onThinkingStart: () => {
      setOrbState("thinking");
    },
    onThinkingEnd: () => {
      // State will be set by audio pipeline based on playback
    },
    onInterrupted: () => {
      audioPipeline.flushAudioQueue();
    },
    onError: (msg) => {
      setError(msg);
      setTimeout(() => {
        audioPipeline.stop();
        onExit();
      }, 2000);
    },
  });

  // Start session on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        console.log("[voice-init] starting audio pipeline...");
        const stream = await audioPipeline.start();
        console.log("[voice-init] audio pipeline started, cancelled=", cancelled);

        if (cancelled) {
          audioPipeline.stop();
          return;
        }

        console.log("[voice-init] connecting voiceSession...");
        await voiceSession.connect();
        console.log("[voice-init] voiceSession connected, cancelled=", cancelled);

        // Set up audio chunk sending via ScriptProcessor using the pipeline's AudioContext
        const audioCtx = audioPipeline.getAudioContext();
        if (!audioCtx) {
          console.error("[voice] no AudioContext available");
          return;
        }

        // Ensure AudioContext is running (browsers may suspend it)
        if (audioCtx.state !== "running") {
          console.log(`[voice] AudioContext state: ${audioCtx.state}, resuming...`);
          await audioCtx.resume();
        }

        const activeTracks = stream.getAudioTracks().filter(t => t.readyState === "live");
        console.log(`[voice] AudioContext state: ${audioCtx.state}, sampleRate: ${audioCtx.sampleRate}, active tracks: ${activeTracks.length}`);

        if (activeTracks.length === 0) {
          console.error("[voice] no live audio tracks on stream");
          return;
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        workletNodeRef.current = processor;

        const nativeRate = audioCtx.sampleRate;
        const targetRate = 16000;
        const ratio = nativeRate / targetRate;

        let chunkCount = 0;
        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) return;
          const input = e.inputBuffer.getChannelData(0);

          // Downsample from native rate (e.g. 48kHz) to 16kHz for Gemini
          const outputLen = Math.floor(input.length / ratio);
          const int16 = new Int16Array(outputLen);
          for (let i = 0; i < outputLen; i++) {
            const sample = input[Math.floor(i * ratio)];
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32768)));
          }
          chunkCount++;
          if (chunkCount <= 5) {
            console.log(`[voice] sending chunk #${chunkCount}, native=${nativeRate}Hz, samples=${int16.length}`);
          }
          voiceSession.sendAudio(int16.buffer);
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
        console.log("[voice] ScriptProcessor connected and ready");
      } catch (err) {
        console.error("[voice-init] error:", err, "cancelled=", cancelled);
        if (!cancelled) {
          setError(
            err instanceof DOMException && err.name === "NotAllowedError"
              ? "Microphone access is required to speak with the Oracle"
              : "Couldn't reach the Oracle — try again"
          );
          setTimeout(onExit, 2000);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      workletNodeRef.current?.disconnect();
      voiceSession.disconnect();
      audioPipeline.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleEndSession = useCallback(() => {
    workletNodeRef.current?.disconnect();
    voiceSession.disconnect();
    audioPipeline.stop();
    onExit();
  }, [voiceSession, audioPipeline, onExit]);

  const [orbSize, setOrbSize] = useState(520); // default for SSR

  useEffect(() => {
    const updateSize = () => setOrbSize(window.innerWidth < 1024 ? 480 : 520);
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed inset-0 z-50 bg-[#0a0a12] flex flex-col items-center justify-between py-12 lg:py-16"
    >
      {/* Top: Oracle label + state */}
      <div className="text-center">
        <div className="text-[13px] uppercase tracking-[3px] text-[rgba(200,120,40,0.6)] font-label">
          The Oracle
        </div>
        <div className="text-[13px] text-[rgba(140,100,220,0.5)] mt-1 font-body">
          {error || STATE_LABELS[orbState]}
        </div>
      </div>

      {/* Center: Energy ball */}
      <OracleOrb state={orbState} amplitude={amplitude} size={orbSize} />

      {/* Bottom: Toast + controls */}
      <div className="flex flex-col items-center gap-4">
        <VoiceToast data={toastData} />
        <VoiceModeControls
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onEndSession={handleEndSession}
        />
      </div>
    </motion.div>
  );
}
