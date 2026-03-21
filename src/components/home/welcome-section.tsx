"use client";

import { motion } from "framer-motion";
import { fadeIn } from "@/lib/animations";

interface WelcomeSectionProps {
  userName: string;
}

export function WelcomeSection({ userName }: WelcomeSectionProps) {
  const firstName = userName.split(" ")[0] || "Keeper";

  return (
    <motion.section
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="px-6 pt-6 pb-4"
    >
      <span className="font-label text-label-sm uppercase tracking-[0.2em] text-on-surface-variant">
        The Warden&apos;s Ledger
      </span>
      <h2 className="mt-2 font-display text-headline-lg italic font-light text-on-surface leading-[1.2]">
        Welcome back to the hearth, {firstName}.
      </h2>
      <p className="mt-2 font-body text-body-lg text-on-surface-variant leading-[1.6]">
        The ink is dry, and the logs are burning bright. Here is your path for
        the day.
      </p>
    </motion.section>
  );
}
