"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LabTone = "ok" | "accent" | "warn" | "bad" | "off";

export const toneClass = (tone: LabTone) => `lab-tone-${tone}`;

export function StatusLight({ tone, pulse }: { tone: LabTone; pulse?: boolean }) {
  return (
    <span
      className={cn("lab-light", toneClass(tone), pulse && "lab-light-pulse")}
      aria-hidden="true"
    />
  );
}

export function Chip({ tone, children }: { tone: LabTone; children: ReactNode }) {
  return <span className={cn("lab-chip", toneClass(tone))}>{children}</span>;
}

export function Strip({
  tone,
  role = "status",
  children,
}: {
  tone: LabTone;
  role?: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <p className={cn("lab-strip", toneClass(tone))} role={role}>
      {children}
    </p>
  );
}

interface LabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "quiet";
}

export function LabButton({ variant = "default", className, type = "button", ...props }: LabButtonProps) {
  return (
    <button
      type={type}
      className={cn("lab-btn", variant !== "default" && `lab-btn-${variant}`, className)}
      {...props}
    />
  );
}
