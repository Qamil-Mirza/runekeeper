"use client";

import { motion } from "framer-motion";
import { onboardingStepSlide } from "@/lib/animations";

interface OnboardingStepProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentLabel: string;
  direction: number;
}

export function OnboardingStep({
  icon,
  title,
  description,
  accentLabel,
  direction,
}: OnboardingStepProps) {
  return (
    <motion.div
      custom={direction}
      variants={onboardingStepSlide}
      initial="enter"
      animate="center"
      exit="exit"
      className="flex flex-col items-center text-center px-6 max-w-md mx-auto"
    >
      <span className="font-label text-label-sm uppercase tracking-[0.25em] text-primary mb-6">
        {accentLabel}
      </span>

      <div className="w-16 h-16 flex items-center justify-center text-primary mb-6">
        {icon}
      </div>

      <h2 className="font-display text-headline-md italic font-light text-on-surface leading-[1.2] mb-3">
        {title}
      </h2>

      <p className="font-body text-body-lg text-on-surface-variant leading-[1.6]">
        {description}
      </p>
    </motion.div>
  );
}
