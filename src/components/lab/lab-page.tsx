"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LabView } from "./lab-view";

const ENTER_MS = 800;
const LEAVE_MS = 400;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The Lab as its own full-screen page. Arriving plays the warp: Runekeeper's
 * timber falls away through streaks of light and the Lab comes into focus.
 * Leaving plays it backwards, then returns to the planner.
 */
export function LabPage() {
  const router = useRouter();
  const [warp, setWarp] = useState<"in" | "out" | null>("in");
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The Lab reads browser storage as it starts, so it renders only in the browser.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    router.prefetch("/planner");
    const done = setTimeout(() => setWarp((w) => (w === "in" ? null : w)), ENTER_MS);
    return () => {
      clearTimeout(done);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [router]);

  const leave = useCallback(() => {
    if (exitTimer.current) return;
    if (prefersReducedMotion()) return router.push("/planner");
    setWarp("out");
    exitTimer.current = setTimeout(() => router.push("/planner"), LEAVE_MS);
  }, [router]);

  return (
    <div className="lab-screen" data-leaving={warp === "out"}>
      {warp && <div className="lab-warp" data-direction={warp} aria-hidden="true" />}
      <div className="lab-stage">{mounted && <LabView onBack={leave} />}</div>
    </div>
  );
}
