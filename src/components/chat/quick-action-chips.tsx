"use client";

import { motion } from "framer-motion";
import { fadeIn } from "@/lib/animations";

interface QuickActionChipsProps {
  actions: string[];
  onAction: (action: string) => void;
}

export function QuickActionChips({ actions, onAction }: QuickActionChipsProps) {
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="flex flex-wrap gap-2 mt-1"
    >
      {actions.map((action) => (
        <button
          key={action}
          onClick={() => onAction(action)}
          className="font-label text-label-md font-medium tracking-wide text-on-surface-variant border-b border-outline/50 px-3 py-1.5 hover:text-on-surface hover:border-on-surface transition-colors duration-200"
        >
          {action}
        </button>
      ))}
    </motion.div>
  );
}
