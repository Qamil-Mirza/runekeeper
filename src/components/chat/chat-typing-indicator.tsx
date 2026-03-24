"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";

const keeperMusings = [
  "Consulting the tomes…",
  "Unfurling the scrolls…",
  "Deciphering ancient runes…",
  "Stirring the ink…",
  "Weaving the tapestry…",
  "Sketching the week's map…",
  "Channeling the quill…",
  "Reading the stars…",
  "Brewing a plan…",
  "Gathering reagents…",
  "Aligning the constellations…",
  "Sorting the quest ledger…",
  "Sharpening the quill…",
  "Murmuring incantations…",
  "Tracing the ley lines…",
  "Binding the chronicle…",
  "Illuminating the manuscript…",
  "Sifting through the archives…",
  "Invoking the schedule spirits…",
  "Tempering the timeforge…",
];

function pickRandom(exclude?: string): string {
  const pool = exclude ? keeperMusings.filter((m) => m !== exclude) : keeperMusings;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function ChatTypingIndicator() {
  const [musing, setMusing] = useState(() => pickRandom());
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setMusing((prev) => pickRandom(prev));
    }, 3000);
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div className="flex gap-3 max-w-3xl mr-auto">
      <Avatar initials="RK" size="sm" className="mt-1 shrink-0 bg-tertiary/20 text-tertiary" />
      <div className="relative">
        <div className="bg-surface-container-lowest shadow-ambient px-4 py-3 rounded-lg flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 bg-[#6b5030] rounded-full"
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
        {/* Caption positioned absolutely so it never affects bubble/layout size */}
        <div className="absolute left-1 top-full mt-1 h-4 overflow-hidden whitespace-nowrap">
          <AnimatePresence mode="wait">
            <motion.span
              key={musing}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="font-label text-[11px] italic text-primary select-none block"
            >
              {musing}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
