"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

/** The Lab's own background: the door is painted in it, so the Lab page lands on the same colour. */
export const LAB_BG = "#07090c";
export const LAB_PATH = "/lab";
const RETURN_KEY = "lab.returning";

/** Remember that the next planner mount is a return from the Lab. */
export function markLabReturn() {
  try {
    window.sessionStorage.setItem(RETURN_KEY, "1");
  } catch {
    // Storage unavailable: the planner just appears without the fade.
  }
}

function takeLabReturn(): boolean {
  try {
    const set = window.sessionStorage.getItem(RETURN_KEY) === "1";
    window.sessionStorage.removeItem(RETURN_KEY);
    return set;
  } catch {
    return false;
  }
}

/** Where the door opens from: the visible Lab button in the sidebar, else the screen's centre. */
function origin(): { x: number; y: number } {
  const btn = Array.from(document.querySelectorAll<HTMLElement>("[data-lab-nav]")).find(
    (el) => el.getClientRects().length > 0,
  );
  if (btn) {
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/**
 * The way in and out of the Lab, for the planner.
 *
 * `open()` spreads the Lab's dark from the sidebar button over the whole
 * screen, then moves to /lab. Coming back from the Lab, the planner starts
 * under that dark and it fades away.
 */
export function useLabDoor(enabled: boolean) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [opening, setOpening] = useState<{ x: number; y: number; r: number } | null>(null);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    if (enabled) router.prefetch(LAB_PATH);
  }, [enabled, router]);

  // Before the first paint, so the planner never flashes before the dark covers it.
  useLayoutEffect(() => {
    if (takeLabReturn() && !reduce) setReturning(true);
  }, [reduce]);

  const open = () => {
    if (opening) return;
    if (reduce) {
      router.push(LAB_PATH);
      return;
    }
    const { x, y } = origin();
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    setOpening({ x, y, r });
  };

  const overlay = (
    <>
      {opening && (
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-[300]"
          style={{ background: LAB_BG }}
          initial={{ clipPath: `circle(0px at ${opening.x}px ${opening.y}px)` }}
          animate={{ clipPath: `circle(${opening.r}px at ${opening.x}px ${opening.y}px)` }}
          transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
          onAnimationComplete={() => router.push(LAB_PATH)}
        />
      )}
      {returning && (
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-[300] pointer-events-none"
          style={{ background: LAB_BG }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          onAnimationComplete={() => setReturning(false)}
        />
      )}
    </>
  );

  return { open, overlay };
}
