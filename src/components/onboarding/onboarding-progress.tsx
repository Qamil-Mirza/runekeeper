"use client";

interface OnboardingProgressProps {
  totalSteps: number;
  currentStep: number;
}

export function OnboardingProgress({
  totalSteps,
  currentStep,
}: OnboardingProgressProps) {
  return (
    <div className="flex items-center gap-3" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rotate-45 transition-all duration-300 ${
            i <= currentStep
              ? "bg-primary scale-100"
              : "bg-on-surface-variant/30 scale-75"
          }`}
        />
      ))}
    </div>
  );
}
