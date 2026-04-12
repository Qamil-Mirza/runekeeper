"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { VoiceToastData } from "./use-voice-session";

interface VoiceToastProps {
  data: VoiceToastData | null;
}

export function VoiceToast({ data }: VoiceToastProps) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<VoiceToastData | null>(null);

  useEffect(() => {
    if (data) {
      setCurrent(data);
      setVisible(true);
      const duration = data.details?.length ? 5000 : 3000;
      const timer = setTimeout(() => setVisible(false), duration);
      return () => clearTimeout(timer);
    }
  }, [data]);

  const hasDetails = current?.details && current.details.length > 0;

  return (
    <AnimatePresence>
      {visible && current && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="bg-[rgba(240,219,184,0.1)] border border-[rgba(200,120,40,0.3)] rounded-lg px-4 py-2 font-body text-body-sm text-[rgba(240,219,184,0.7)] max-w-sm"
        >
          <div>{current.summary}</div>
          {hasDetails && (
            <div className="mt-1.5 space-y-0.5">
              {current.details!.map((d, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[12px]">
                  <span className="text-[rgba(200,120,40,0.6)]">&#x2022;</span>
                  <span className="text-[rgba(240,219,184,0.55)]">
                    {d.title}
                    {d.time && (
                      <span className="ml-1.5 text-[rgba(140,100,220,0.6)]">
                        {d.time}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
