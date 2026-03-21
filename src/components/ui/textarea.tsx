"use client";

import { cn } from "@/lib/utils";
import { type TextareaHTMLAttributes, forwardRef, useCallback } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className, id, onInput, ...props }, ref) => {
    const handleAutoResize = useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        const target = e.currentTarget;
        target.style.height = "auto";
        target.style.height = `${target.scrollHeight}px`;
        if (onInput) {
          (onInput as (e: React.FormEvent<HTMLTextAreaElement>) => void)(e);
        }
      },
      [onInput]
    );

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
        <textarea
          ref={ref}
          id={id}
          className={cn(
            "w-full bg-surface-container-high border-0 border-b-2 border-primary/30 rounded-none resize-none",
            "px-3 py-2.5 font-body text-body-lg text-on-surface",
            "placeholder:text-outline-variant",
            "focus:border-tertiary focus:outline-none",
            "transition-colors duration-200",
            "overflow-hidden",
            className
          )}
          rows={1}
          onInput={handleAutoResize}
          {...props}
        />
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
