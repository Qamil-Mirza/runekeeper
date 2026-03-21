"use client";

import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";

export function ChatTypingIndicator() {
  return (
    <div className="flex gap-3 max-w-3xl mr-auto">
      <Avatar initials="RK" size="sm" className="mt-1 shrink-0 bg-tertiary/20 text-tertiary" />
      <div className="bg-surface-container-lowest shadow-ambient px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 bg-on-surface-variant/50 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
