"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, toLocalDateStr, isoToLocalDate } from "@/lib/utils";
import { staggerChildren, slideUp, fadeIn } from "@/lib/animations";
import { usePlanner } from "@/context/planner-context";
import type { TimeBlock, BlockType, Task } from "@/lib/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 72; // taller rows for the day view
type CalendarMode = "day" | "week" | "month";

const blockEmoji: Record<BlockType, string> = {
  focus: "📖",
  meeting: "🤝",
  class: "🏛",
  personal: "🌿",
  admin: "📋",
};

const blockAccent: Record<BlockType, { bg: string; dot: string }> = {
  focus: { bg: "bg-tertiary/10", dot: "bg-tertiary" },
  meeting: { bg: "bg-surface-container-high", dot: "bg-primary" },
  class: { bg: "bg-surface-container", dot: "bg-on-surface/50" },
  personal: { bg: "bg-tertiary/6", dot: "bg-tertiary/60" },
  admin: { bg: "bg-surface-container-low", dot: "bg-outline" },
};

// ─── Date formatting helpers ─────────────────────────────────────────────────

function formatArchivistDate(date: Date): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = date.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
          ? "rd"
          : "th";

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return `${dayNames[date.getDay()]}, ${day}${suffix} of ${months[date.getMonth()]}`;
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function blockSubtitle(type: BlockType): string {
  const labels: Record<BlockType, string> = {
    focus: "Deep Work",
    meeting: "Planning Session",
    class: "Lecture Hall",
    personal: "Personal Time",
    admin: "Administration",
  };
  return labels[type];
}

// ─── Now Marker ──────────────────────────────────────────────────────────────

function NowMarker({ startHour }: { startHour: number }) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const offset = ((minutes - startHour * 60) / 60) * HOUR_HEIGHT;

  if (offset < 0 || offset > (END_HOUR - START_HOUR) * HOUR_HEIGHT) return null;

  return (
    <div
      className="absolute left-6 right-4 z-30 flex items-center gap-1.5 pointer-events-none"
      style={{ top: `${offset}px` }}
    >
      <div className="w-2 h-2 rounded-full bg-tertiary shrink-0" />
      <div className="flex-1 h-px bg-tertiary/60" />
      <span className="font-label text-[10px] font-semibold text-tertiary uppercase tracking-wider bg-tertiary/15 px-2 py-0.5 rounded-full">
        Now
      </span>
    </div>
  );
}

// ─── Event Card ──────────────────────────────────────────────────────────────

function EventCard({ block, isDone }: { block: TimeBlock; isDone?: boolean }) {
  const start = new Date(block.start);
  const end = new Date(block.end);

  // Clamp to visible range
  const startMin = Math.max(start.getHours() * 60 + start.getMinutes(), START_HOUR * 60);
  const endMin = Math.min(end.getHours() * 60 + end.getMinutes(), END_HOUR * 60);
  const durationMinutes = endMin - startMin;
  if (durationMinutes <= 0) return null;

  const height = (durationMinutes / 60) * HOUR_HEIGHT;
  const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  const isExternal = (block as any).source === "google_calendar";
  const accent = blockAccent[block.type] || blockAccent.focus;
  const isLarge = height >= 80;

  return (
    <motion.div
      variants={fadeIn}
      className={cn(
        "absolute left-10 right-4 overflow-hidden",
        isExternal
          ? "bg-surface-container/50 border-l-2 border-l-[#4285F4]/60 pointer-events-none"
          : accent.bg,
        isDone && "opacity-50",
        !block.committed && !isExternal && "opacity-70 border-dashed border border-outline-variant/40"
      )}
      style={{
        top: `${top}px`,
        minHeight: `${Math.max(height, 40)}px`,
        borderRadius: "2px",
      }}
    >
      <div className="px-3.5 py-2.5 h-full flex flex-col">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <h4 className={cn(
            "font-display text-body-lg font-semibold leading-snug",
            isExternal ? "text-on-surface/70" : "text-on-surface",
            isDone && "line-through text-on-surface/50"
          )}>
            {block.title}
          </h4>
          {/* Done checkmark or Google badge */}
          {isDone ? (
            <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-tertiary/15 flex items-center justify-center">
              <svg className="w-3 h-3 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          ) : isExternal ? (
            <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#4285F4]/15 text-[10px] font-bold text-[#4285F4]">G</span>
          ) : null}
        </div>

        {/* Subtitle / location */}
        {isLarge && (
          <div className="mt-1 flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isExternal ? "bg-[#4285F4]/40" : accent.dot)} />
            <span className="font-label text-label-sm text-on-surface-variant">
              {isExternal ? "Google Calendar" : blockSubtitle(block.type)}
            </span>
          </div>
        )}

        {/* Time range at bottom if enough room */}
        {height >= 100 && (
          <span className="mt-auto pt-1.5 font-label text-[10px] text-on-surface-variant/70 uppercase tracking-wide">
            {formatTimeShort(block.start)} – {formatTimeShort(block.end)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Unmapped Quest Row ──────────────────────────────────────────────────────

function UnmappedQuestRow({ task, even }: { task: Task; even: boolean }) {
  return (
    <motion.div
      variants={slideUp}
      className={cn(
        "flex items-center gap-3 px-5 py-3",
        even ? "bg-surface-container-low" : "bg-surface"
      )}
    >
      {/* Dotted grid icon */}
      <div className="w-7 h-7 grid grid-cols-3 grid-rows-3 gap-[3px] shrink-0 p-0.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="w-full h-full rounded-full bg-outline-variant/50"
          />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-body text-body-lg text-on-surface block truncate">
          {task.title}
        </span>
        <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-wider">
          No time set
        </span>
      </div>
    </motion.div>
  );
}

// ─── Main Calendar View ──────────────────────────────────────────────────────

export function CalendarView() {
  const { blocks, tasks, navigateWeek, weekRange } = usePlanner();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mode, setMode] = useState<CalendarMode>("day");

  const selectedDateStr = toLocalDateStr(selectedDate);
  const todayStr = toLocalDateStr(new Date());
  const isToday = selectedDateStr === todayStr;

  // Navigate day
  const navigateDay = (dir: -1 | 1) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir);
      return d;
    });
  };

  // Blocks for selected day (exclude blocks entirely outside visible hours)
  const dayBlocks = useMemo(
    () =>
      blocks
        .filter((b) => {
          if (isoToLocalDate(b.start) !== selectedDateStr) return false;
          const startHour = new Date(b.start).getHours();
          const endHour = new Date(b.end).getHours() + (new Date(b.end).getMinutes() > 0 ? 1 : 0);
          // Skip if entirely outside the visible range
          if (endHour <= START_HOUR || startHour >= END_HOUR) return false;
          return true;
        })
        .sort((a, b) => a.start.localeCompare(b.start)),
    [blocks, selectedDateStr]
  );

  // Unmapped quests: tasks that are not "done" and have no timeBlockId
  const unmappedQuests = useMemo(
    () => tasks.filter((t) => t.status === "unscheduled"),
    [tasks]
  );

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    []
  );

  return (
    <div className="overflow-y-auto archivist-scroll h-full">
      {/* ── Header ── */}
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="px-6 pt-6 pb-2"
      >
        <span className="font-label text-label-sm uppercase tracking-[0.15em] text-tertiary">
          The Archivist&apos;s Schedule
        </span>
        <div className="flex items-center justify-between mt-1">
          <h2 className="font-display text-headline-lg italic text-on-surface leading-tight">
            {formatArchivistDate(selectedDate)}
          </h2>
          {/* Day navigation arrows */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigateDay(-1)}
              className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors"
              aria-label="Previous day"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="font-label text-[10px] uppercase tracking-wider text-tertiary hover:text-on-surface px-2 py-1 transition-colors"
              >
                Today
              </button>
            )}
            <button
              onClick={() => navigateDay(1)}
              className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors"
              aria-label="Next day"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Mode tabs ── */}
      <div className="px-6 pt-3 pb-4">
        <div className="inline-flex bg-surface-container-low p-0.5">
          {(["day", "week", "month"] as CalendarMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "font-label text-label-md capitalize px-4 py-1.5 transition-colors duration-200",
                mode === m
                  ? "bg-surface text-on-surface shadow-ambient"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Day Timeline ── */}
      <AnimatePresence mode="wait">
        {mode === "day" && (
          <motion.div
            key="day-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="relative mx-2"
              style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
            >
              {/* Hour gridlines */}
              {hours.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex items-start"
                  style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="font-label text-label-sm text-outline-variant w-8 text-right pr-2 -mt-1.5 select-none">
                    {formatHourLabel(hour)}
                  </span>
                  <div className="flex-1 border-t border-outline-variant/20 mt-px" />
                </div>
              ))}

              {/* Now marker */}
              {isToday && <NowMarker startHour={START_HOUR} />}

              {/* Event cards */}
              <motion.div
                variants={staggerChildren}
                initial="hidden"
                animate="visible"
              >
                {dayBlocks.map((block) => {
                  const linkedTask = block.taskId ? tasks.find((t) => t.id === block.taskId) : undefined;
                  return (
                    <EventCard key={block.id} block={block} isDone={linkedTask?.status === "done"} />
                  );
                })}
              </motion.div>
            </div>

            {/* ── Unmapped Quests ── */}
            {unmappedQuests.length > 0 && (
              <section className="mt-6 mb-4">
                <div className="flex items-center justify-between px-6 mb-3">
                  <h3 className="font-display text-headline-md text-on-surface">
                    Unmapped Quests
                  </h3>
                  <span className="font-label text-label-sm text-on-surface-variant">
                    {unmappedQuests.length}
                  </span>
                </div>
                <motion.div
                  variants={staggerChildren}
                  initial="hidden"
                  animate="visible"
                >
                  {unmappedQuests.map((task, i) => (
                    <UnmappedQuestRow key={task.id} task={task} even={i % 2 === 0} />
                  ))}
                </motion.div>
              </section>
            )}

          </motion.div>
        )}

        {mode === "week" && (
          <motion.div
            key="week-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="px-2"
          >
            <WeekMiniView
              blocks={blocks}
              weekRange={weekRange}
              navigateWeek={navigateWeek}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </motion.div>
        )}

        {mode === "month" && (
          <motion.div
            key="month-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="px-6 py-4"
          >
            <MonthMiniView
              blocks={blocks}
              selectedDate={selectedDate}
              onSelectDate={(d) => {
                setSelectedDate(d);
                setMode("day");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Week Mini View ──────────────────────────────────────────────────────────

function WeekMiniView({
  blocks,
  weekRange,
  navigateWeek,
  selectedDate,
  onSelectDate,
}: {
  blocks: TimeBlock[];
  weekRange: { start: string; end: string };
  navigateWeek: (dir: -1 | 1) => void;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MINI_HOUR_HEIGHT = 32;

  const dayDates = useMemo(() => {
    const start = new Date(weekRange.start + "T00:00:00");
    return DAYS.map((label, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        label,
        date: d.getDate(),
        fullDate: toLocalDateStr(d),
      };
    });
  }, [weekRange]);

  const todayStr = toLocalDateStr(new Date());
  const selStr = toLocalDateStr(selectedDate);

  const blocksByDay = useMemo(() => {
    const map: Record<string, TimeBlock[]> = {};
    for (const dd of dayDates) map[dd.fullDate] = [];
    for (const block of blocks) {
      const day = isoToLocalDate(block.start);
      if (map[day]) map[day].push(block);
    }
    return map;
  }, [blocks, dayDates]);

  const hours = useMemo(
    () => Array.from({ length: 13 }, (_, i) => 8 + i),
    []
  );

  const start = new Date(weekRange.start + "T00:00:00");
  const end = new Date(weekRange.end + "T00:00:00");
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div>
      {/* Week header */}
      <div className="flex items-center justify-between px-4 pb-3">
        <button onClick={() => navigateWeek(-1)} className="p-1.5 text-on-surface-variant hover:text-on-surface" aria-label="Previous week">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="font-label text-label-md font-medium text-on-surface tracking-wide">
          {fmtDate(start)} — {fmtDate(end)}
        </span>
        <button onClick={() => navigateWeek(1)} className="p-1.5 text-on-surface-variant hover:text-on-surface" aria-label="Next week">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto archivist-scroll">
        <div className="flex min-w-[560px]">
          {/* Hour labels */}
          <div className="w-8 shrink-0 pt-[40px]">
            {hours.map((hour) => (
              <div
                key={hour}
                className="font-label text-[10px] text-outline-variant text-right pr-1 leading-none"
                style={{ height: `${MINI_HOUR_HEIGHT}px` }}
              >
                {`${String(hour).padStart(2, "0")}`}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {dayDates.map((dd) => {
            const dayBlocks = blocksByDay[dd.fullDate] || [];
            const isToday = dd.fullDate === todayStr;
            const isSelected = dd.fullDate === selStr;
            return (
              <div key={dd.fullDate} className="flex-1 min-w-0">
                <button
                  onClick={() => {
                    const d = new Date(dd.fullDate + "T00:00:00");
                    onSelectDate(d);
                  }}
                  className={cn(
                    "w-full text-center py-1.5 transition-colors",
                    isSelected ? "bg-tertiary/12" : isToday ? "bg-tertiary/5" : "bg-surface-container-low"
                  )}
                >
                  <span className="font-label text-label-sm uppercase tracking-wide text-on-surface-variant block">{dd.label}</span>
                  <span className={cn("font-label text-label-md font-medium", isToday ? "text-tertiary" : "text-on-surface")}>{dd.date}</span>
                </button>
                <div className="relative" style={{ height: `${hours.length * MINI_HOUR_HEIGHT}px` }}>
                  {hours.map((hour, i) => (
                    <div
                      key={hour}
                      className={cn("absolute left-0 right-0 border-t border-outline-variant/10", hour >= 12 ? "bg-surface-container/20" : "")}
                      style={{ top: `${i * MINI_HOUR_HEIGHT}px`, height: `${MINI_HOUR_HEIGHT}px` }}
                    />
                  ))}
                  {dayBlocks.map((block) => {
                    const s = new Date(block.start);
                    const e = new Date(block.end);
                    const sMin = s.getHours() * 60 + s.getMinutes();
                    const eMin = e.getHours() * 60 + e.getMinutes();
                    const top = ((sMin - 8 * 60) / 60) * MINI_HOUR_HEIGHT;
                    const h = ((eMin - sMin) / 60) * MINI_HOUR_HEIGHT;
                    const isExt = block.source === "google_calendar";
                    const accent = blockAccent[block.type] || blockAccent.focus;
                    return (
                      <div
                        key={block.id}
                        className={cn("absolute left-0.5 right-0.5 px-1 py-0.5 overflow-hidden border-l-2", isExt ? "bg-surface-container/40" : accent.bg)}
                        style={{ top: `${top}px`, height: `${Math.max(h, 14)}px`, borderLeftColor: isExt ? "#4285F4" : "var(--color-tertiary)" }}
                      >
                        <span className={cn("font-label text-[9px] font-medium leading-tight block truncate", isExt ? "text-on-surface/60" : "text-on-surface")}>
                          {block.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month Mini View ─────────────────────────────────────────────────────────

function MonthMiniView({
  blocks,
  selectedDate,
  onSelectDate,
}: {
  blocks: TimeBlock[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(selectedDate));

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthName = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const todayStr = toLocalDateStr(new Date());
  const selStr = toLocalDateStr(selectedDate);

  // Count blocks per day
  const blockCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of blocks) {
      const day = isoToLocalDate(b.start);
      counts[day] = (counts[day] || 0) + 1;
    }
    return counts;
  }, [blocks]);

  const navigateMonth = (dir: -1 | 1) => {
    setViewMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigateMonth(-1)} className="p-1.5 text-on-surface-variant hover:text-on-surface" aria-label="Previous month">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="font-display text-headline-md text-on-surface">{monthName}</span>
        <button onClick={() => navigateMonth(1)} className="p-1.5 text-on-surface-variant hover:text-on-surface" aria-label="Next month">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="font-label text-[10px] text-outline-variant uppercase tracking-wider text-center">
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Empty leading cells */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selStr;
          const count = blockCounts[dateStr] || 0;

          return (
            <button
              key={day}
              onClick={() => onSelectDate(new Date(dateStr + "T00:00:00"))}
              className={cn(
                "flex flex-col items-center py-1.5 transition-colors rounded-sm",
                isSelected
                  ? "bg-tertiary/15 text-on-surface"
                  : isToday
                    ? "bg-tertiary/5 text-tertiary"
                    : "text-on-surface hover:bg-surface-container-low"
              )}
            >
              <span className={cn("font-label text-label-md", isToday && "font-semibold")}>
                {day}
              </span>
              {count > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                    <div key={j} className="w-1 h-1 rounded-full bg-tertiary/50" />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
