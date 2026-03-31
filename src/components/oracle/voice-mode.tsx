"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { OracleOrb, type OrbState } from "./oracle-orb";
import { VoiceModeControls } from "./voice-mode-controls";
import { VoiceToast } from "./voice-toast";

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
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setOrbState(next ? "muted" : "idle");
      return next;
    });
  }, []);

  const handleEndSession = useCallback(() => {
    onExit();
  }, [onExit]);

  const orbSize = typeof window !== "undefined" && window.innerWidth < 1024 ? 180 : 240;

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
          {STATE_LABELS[orbState]}
        </div>
      </div>

      {/* Center: Energy ball */}
      <OracleOrb state={orbState} amplitude={amplitude} size={orbSize} />

      {/* Bottom: Toast + controls */}
      <div className="flex flex-col items-center gap-4">
        <VoiceToast message={toastMessage} />
        <VoiceModeControls
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onEndSession={handleEndSession}
        />
      </div>
    </motion.div>
  );
}
