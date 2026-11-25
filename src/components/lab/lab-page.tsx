"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { LabView } from "./lab-view";
import { LAB_BG, markLabReturn } from "./lab-door";

/**
 * The Lab as its own full-screen page. It fades in on the dark the planner's
 * door left behind, and fades back to that dark on the way out.
 */
export function LabPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  // The Lab reads browser storage as it starts, so it renders only in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    router.prefetch("/planner");
  }, [router]);

  const back = () => {
    if (leaving) return;
    markLabReturn();
    if (reduce) router.push("/planner");
    else setLeaving(true);
  };

  return (
    <div className="fixed inset-0" style={{ background: LAB_BG }}>
      <motion.div
        key={mounted ? "lab" : "blank"}
        className="h-full"
        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
        animate={leaving ? { opacity: 0, y: 0 } : { opacity: 1, y: 0 }}
        transition={leaving ? { duration: 0.25, ease: "easeIn" } : { duration: 0.4, ease: "easeOut" }}
        onAnimationComplete={() => {
          if (leaving) router.push("/planner");
        }}
      >
        {mounted && <LabView onBack={back} />}
      </motion.div>
    </div>
  );
}
