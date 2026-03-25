"use client";

import { cn } from "@/lib/utils";
import { type TextareaHTMLAttributes, forwardRef, useCallback, useEffect, useRef as useLocalRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

const MAX_TEXTAREA_HEIGHT = 200;

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const scrollHeight = el.scrollHeight;
  el.style.height = `${Math.min(scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  el.style.overflowY = scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className, id, onInput, value, ...props }, ref) => {
    const internalRef = useLocalRef<HTMLTextAreaElement>(null);

    const handleAutoResize = useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        autoResize(e.currentTarget);
        if (onInput) {
          (onInput as (e: React.FormEvent<HTMLTextAreaElement>) => void)(e);
        }
      },
      [onInput]
    );

    // Auto-resize on value change (e.g. when modal opens with existing content)
    useEffect(() => {
      const el = internalRef.current;
      if (el) autoResize(el);
    }, [value]);

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
          ref={(node) => {
            internalRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          id={id}
          className={cn(
            "w-full bg-surface-container-high border-0 border-b-2 border-primary/30 rounded-none resize-none",
            "px-3 py-2.5 font-body text-body-lg text-on-surface",
            "placeholder:text-outline-variant",
            "focus:border-tertiary focus:outline-none",
            "transition-colors duration-200",
            "overflow-y-auto max-h-[200px]",
            className
          )}
          rows={1}
          value={value}
          onInput={handleAutoResize}
          {...props}
        />
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
