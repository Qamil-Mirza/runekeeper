"use client";

import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-tertiary text-on-tertiary font-label text-label-lg font-medium tracking-wide uppercase px-6 py-2.5 hover:opacity-90 transition-opacity duration-200",
  secondary:
    "bg-transparent text-on-surface font-label text-label-lg font-medium tracking-wide border-b-[1px] border-outline px-4 py-2 hover:border-on-surface transition-colors duration-200",
  ghost:
    "bg-transparent text-secondary font-label text-label-lg font-medium tracking-wide px-4 py-2 hover:bg-secondary/5 transition-all duration-200",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-none select-none",
          "disabled:opacity-50 disabled:pointer-events-none",
          variantStyles[variant],
          className
        )}
        disabled={disabled}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
