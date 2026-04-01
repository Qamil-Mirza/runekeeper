"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface VoiceToastProps {
  message: string | null;
}

export function VoiceToast({ message }: VoiceToastProps) {
  const [visible, setVisible] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);

  useEffect(() => {
    if (message) {
      setCurrentMessage(message);
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <AnimatePresence>
      {visible && currentMessage && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="bg-[rgba(240,219,184,0.1)] border border-[rgba(200,120,40,0.3)] rounded-lg px-4 py-2 font-body text-body-sm text-[rgba(240,219,184,0.7)]"
        >
          {currentMessage}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
