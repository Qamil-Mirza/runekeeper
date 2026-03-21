import { cn } from "@/lib/utils";

type BadgeVariant = "gold" | "default" | "dim" | "status";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  gold: "bg-tertiary/15 text-tertiary border-b border-tertiary/30",
  default: "bg-surface-container-high text-on-surface-variant",
  dim: "bg-surface-container text-outline",
  status: "bg-secondary/10 text-secondary",
};

export function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-none px-2 py-0.5",
        "font-label text-label-sm font-medium tracking-wide uppercase",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
