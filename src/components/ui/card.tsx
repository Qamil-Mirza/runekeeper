import { cn } from "@/lib/utils";
import { type HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  floating?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ floating = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-surface-container-lowest rounded-none",
          floating && "shadow-ambient",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";
