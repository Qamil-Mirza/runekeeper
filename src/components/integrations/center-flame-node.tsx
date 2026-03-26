"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface CenterFlameNodeProps {
  size?: number;
}

// Ember configs — each one floats upward with lateral drift
const EMBERS = [
  { x: [0, 6, -4, 2], y: [0, -30, -55, -75], dur: 2.6, delay: 0, sz: 3 },
  { x: [0, -8, 5, -3], y: [0, -25, -50, -70], dur: 3.0, delay: 0.4, sz: 4 },
  { x: [0, 4, -6, 1], y: [0, -35, -60, -80], dur: 2.8, delay: 0.8, sz: 3 },
  { x: [0, -5, 7, -2], y: [0, -28, -48, -65], dur: 3.2, delay: 1.2, sz: 2.5 },
  { x: [0, 7, -3, 4], y: [0, -32, -58, -78], dur: 2.4, delay: 1.6, sz: 3.5 },
  { x: [0, -6, 4, -5], y: [0, -20, -42, -60], dur: 3.4, delay: 2.0, sz: 2 },
];

const EMBER_COLORS = ["#f0c060", "#ffaa00", "#e8a030", "#ff8c00", "#d4a860", "#c87828"];

function Brazier({ size }: { size: number }) {
  const w = size * 0.45;
  const h = size * 0.18;
  const rimW = w + 4;
  const rimH = 4;

  return (
    <svg
      width={w + 8}
      height={h + rimH + 2}
      viewBox={`0 0 ${w + 8} ${h + rimH + 2}`}
      className="absolute z-20 pointer-events-none"
      style={{ bottom: size * 0.18, left: "50%", transform: "translateX(-50%)" }}
    >
      {/* Bowl glow */}
      <defs>
        <radialGradient id="brazier-glow" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="rgba(200,120,40,0.3)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* Rim — flat bar across the top */}
      <rect
        x={(w + 8 - rimW) / 2}
        y={0}
        width={rimW}
        height={rimH}
        rx={2}
        fill="#5a3a1a"
        stroke="#7a5a2a"
        strokeWidth={0.5}
      />

      {/* Bowl shape — half-ellipse curving down */}
      <path
        d={`M ${(w + 8 - w) / 2} ${rimH}
            Q ${(w + 8) / 2} ${rimH + h * 2.2}
              ${(w + 8 + w) / 2} ${rimH}`}
        fill="#3a2410"
        stroke="#5a3a1a"
        strokeWidth={1}
      />

      {/* Inner glow on bowl */}
      <path
        d={`M ${(w + 8 - w * 0.7) / 2} ${rimH + 1}
            Q ${(w + 8) / 2} ${rimH + h * 1.5}
              ${(w + 8 + w * 0.7) / 2} ${rimH + 1}`}
        fill="url(#brazier-glow)"
      />
    </svg>
  );
}

export function CenterFlameNode({ size = 120 }: CenterFlameNodeProps) {
  // Flame dimensions — sized to sit above the brazier bowl
  const flameScale = size / 120;

  // Respect prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div className="relative flex flex-col items-center">
      {/* Outer ambient glow ring */}
      {!reducedMotion && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size + 40,
            height: size + 40,
            top: -20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(200,120,40,0.12) 0%, rgba(200,120,40,0.04) 50%, transparent 70%)",
          }}
          animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Circular container */}
      <motion.div
        className="relative rounded-full bg-[radial-gradient(circle_at_center,rgba(200,120,40,0.15)_0%,rgba(44,24,16,0.9)_60%,#2c1810_100%)] border-2 border-[#5a3a1a] flex items-center justify-center overflow-visible"
        style={{ width: size, height: size }}
        animate={
          reducedMotion
            ? { boxShadow: "0 0 40px rgba(200,120,40,0.25), 0 0 80px rgba(200,120,40,0.1)" }
            : {
                boxShadow: [
                  "0 0 40px rgba(200,120,40,0.25), 0 0 80px rgba(200,120,40,0.1)",
                  "0 0 60px rgba(240,160,60,0.4), 0 0 100px rgba(200,120,40,0.2)",
                  "0 0 40px rgba(200,120,40,0.25), 0 0 80px rgba(200,120,40,0.1)",
                ],
              }
        }
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Inner glow — behind flame */}
        <div className="absolute inset-0 z-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(240,180,80,0.25)_0%,rgba(200,120,40,0.1)_40%,transparent_70%)] pointer-events-none" />

        {/* Brazier bowl */}
        <Brazier size={size} />

        {/* Flame layers — centered above brazier */}
        <div
          className="lantern-flame-container z-10"
          style={{
            position: "absolute",
            width: 40 * flameScale,
            height: 60 * flameScale,
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -62%) scale(${flameScale * 1.6})`,
            transformOrigin: "center bottom",
          }}
        >
          <div className="lantern-flame-outer" />
          <div className="lantern-flame-wisp" />
          <div className="lantern-flame-mid" />
          <div className="lantern-flame-core" />
        </div>
      </motion.div>

      {/* Ember particles */}
      {!reducedMotion &&
        EMBERS.map((ember, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: ember.sz,
              height: ember.sz,
              background: EMBER_COLORS[i],
              top: size * 0.25,
              left: "50%",
              filter: "blur(0.5px)",
            }}
            animate={{
              x: ember.x,
              y: ember.y,
              opacity: [0, 0.9, 0.7, 0],
              scale: [0.4, 1, 0.8, 0],
            }}
            transition={{
              duration: ember.dur,
              repeat: Infinity,
              delay: ember.delay,
              ease: "easeOut",
            }}
          />
        ))}

      {/* Label */}
      <span className="mt-2 text-[11px] font-label tracking-[2px] uppercase text-[#9b8a70] font-semibold">
        Runekeeper
      </span>
    </div>
  );
}
