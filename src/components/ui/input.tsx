"use client";

import { cn } from "@/lib/utils";
import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-micro">
        {label && (
          <label
            htmlFor={id}
            className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "w-full bg-surface-container-high border-0 border-b-2 border-primary/30 rounded-none",
            "px-3 py-2.5 font-body text-body-lg text-on-surface",
            "placeholder:text-outline-variant",
            "focus:border-tertiary focus:outline-none",
            "transition-colors duration-200",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = "Input";
