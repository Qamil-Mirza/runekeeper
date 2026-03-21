import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string;
  alt?: string;
  initials?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: "w-7 h-7 text-label-sm",
  md: "w-9 h-9 text-label-md",
  lg: "w-12 h-12 text-label-lg",
};

export function Avatar({
  src,
  alt = "",
  initials,
  size = "md",
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        "rounded-full overflow-hidden flex items-center justify-center",
        "bg-surface-container-highest text-on-surface-variant font-label font-medium",
        sizeStyles[size],
        className
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span>{initials || "?"}</span>
      )}
    </div>
  );
}
