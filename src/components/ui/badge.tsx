import { cn } from "@/lib/utils";

type BadgeVariant = "gold" | "default" | "dim" | "status";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  gold: "bg-[rgba(200,120,40,0.15)] text-[#c87828] border-b border-tertiary/30",
  default: "bg-[rgba(212,168,96,0.1)] text-[rgba(212,168,96,0.6)]",
  dim: "bg-surface-container text-outline",
  status: "bg-[rgba(155,67,66,0.15)] text-[#9b4342]",
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
