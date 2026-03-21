import { cn } from "@/lib/utils";

interface QuestProgressDotsProps {
  total: number;
  completed: number;
}

export function QuestProgressDots({ total, completed }: QuestProgressDotsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-[6px] h-[6px] rotate-45 inline-block",
            i < completed ? "bg-tertiary" : "bg-surface-container-highest"
          )}
        />
      ))}
    </div>
  );
}
