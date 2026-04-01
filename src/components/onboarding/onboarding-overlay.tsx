"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { onboardingOverlayFade } from "@/lib/animations";
import { OnboardingStep } from "./onboarding-step";
import { OnboardingProgress } from "./onboarding-progress";

interface OnboardingOverlayProps {
  onComplete: () => void;
}

const STEPS = [
  {
    accentLabel: "I",
    title: "Welcome to Runekeeper",
    description:
      "Your quests, your schedule, your story \u2014 all kept in one enchanted ledger. Let us show you around the keep.",
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    accentLabel: "II",
    title: "The Hearth",
    description:
      "Your home base. See today\u2019s quests at a glance, check your schedule, and light the fire on a new planning session.",
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22c-4-3-8-7-8-12a5 5 0 018-4 5 5 0 018 4c0 5-4 9-8 12z" />
      </svg>
    ),
  },
  {
    accentLabel: "III",
    title: "The Oracle",
    description:
      "Speak with the Warden \u2014 your AI planning companion. Describe your week in plain words and watch your schedule take shape.",
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 2L4 22" />
        <path d="M20 2c-2 2-6 3-9 3s-5 2-5 5c0 2 1 4 3 5l7-9" />
      </svg>
    ),
  },
  {
    accentLabel: "IV",
    title: "The Quest Log",
    description:
      "Every task is a quest. Organize by priority, track your progress, and mark them done as you conquer your day.",
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21h12a2 2 0 002-2V5a2 2 0 00-2-2H8" />
        <path d="M8 3H6a2 2 0 00-2 2v14a2 2 0 002 2h2" />
        <line x1="12" y1="8" x2="18" y2="8" />
        <line x1="12" y1="12" x2="18" y2="12" />
        <line x1="12" y1="16" x2="16" y2="16" />
      </svg>
    ),
  },
  {
    accentLabel: "V",
    title: "The Nexus",
    description:
      "Connect your tools \u2014 Google Calendar, Gmail, and more. Let the flame tend your workflow while you focus on what matters.",
    icon: (
      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="3" r="1.5" />
        <circle cx="21" cy="12" r="1.5" />
        <circle cx="12" cy="21" r="1.5" />
        <circle cx="3" cy="12" r="1.5" />
        <line x1="12" y1="6" x2="12" y2="9" />
        <line x1="15" y1="12" x2="18" y2="12" />
        <line x1="12" y1="15" x2="12" y2="18" />
        <line x1="9" y1="12" x2="6" y2="12" />
      </svg>
    ),
  },
];

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const isLastStep = currentStep === STEPS.length - 1;

  const goNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setDirection(1);
    setCurrentStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setCurrentStep((s) => s - 1);
  };

  return (
    <motion.div
      variants={onboardingOverlayFade}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-surface-dim/95 backdrop-blur-sm"
    >
      {/* Skip button */}
      <button
        onClick={onComplete}
        className="absolute top-6 right-6 font-label text-label-sm uppercase tracking-wide text-on-surface-variant hover:text-primary transition-colors min-h-[44px] px-3 flex items-center"
      >
        Skip the tour
      </button>

      {/* Step content */}
      <div className="flex-1 flex items-center justify-center w-full overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <OnboardingStep
            key={currentStep}
            direction={direction}
            {...STEPS[currentStep]}
          />
        </AnimatePresence>
      </div>

      {/* Footer: progress + navigation */}
      <div className="pb-10 pt-4 flex flex-col items-center gap-8 w-full max-w-md px-6">
        <OnboardingProgress totalSteps={STEPS.length} currentStep={currentStep} />

        <div className="flex items-center justify-center gap-4 w-full">
          {currentStep > 0 && (
            <button
              onClick={goBack}
              className="flex-1 max-w-[10rem] min-h-[44px] font-label text-label-md uppercase tracking-wide text-on-surface-variant hover:text-on-surface border border-on-surface-variant/20 rounded-lg transition-colors"
            >
              Back
            </button>
          )}

          <button
            onClick={goNext}
            className="flex-1 max-w-[10rem] min-h-[44px] font-label text-label-md uppercase tracking-wide text-surface-dim bg-primary hover:bg-primary/90 rounded-lg transition-colors font-medium"
          >
            {isLastStep ? "Begin your quest" : "Next"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
