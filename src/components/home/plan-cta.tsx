"use client";

import { motion } from "framer-motion";
import { fadeIn } from "@/lib/animations";
import { Button } from "@/components/ui/button";

interface PlanCTAProps {
  onNavigateToChat: () => void;
}

export function PlanCTA({ onNavigateToChat }: PlanCTAProps) {
  return (
    <motion.section
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mx-6 mt-10 mb-8"
    >
      {/* Intentional rounded corners on CTA card — design-specified exception to 0px rule */}
      <div className="bg-surface-container-highest/80 rounded-lg px-6 py-6 text-center">
        <h3 className="font-display text-headline-md italic text-[#3a2410]">
          Is the road ahead unclear?
        </h3>
        <p className="mt-2 font-body text-body-md text-[#3a2410]/70 leading-[1.6]">
          Consult the Keeper to weave your tasks into a masterful tapestry for
          the week.
        </p>
        <div className="mt-5">
          <Button variant="primary" onClick={onNavigateToChat} className="text-[#1a1008]">
            Plan Your Week
            <svg className="w-4 h-4 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 2L4 22" />
              <path d="M20 2c-2 2-6 3-9 3s-5 2-5 5c0 2 1 4 3 5l7-9" />
            </svg>
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
