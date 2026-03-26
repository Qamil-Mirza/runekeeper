"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

interface FieryEdgeProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  active: boolean;
  nodeRadius: number;
}

const PARTICLE_COLORS = ["#ff6b35", "#d4a860", "#f0c060", "#ffaa00", "#c87828"];
const PARTICLE_DELAYS = [0, 0.3, 0.6, 0.9, 1.2];
const PARTICLE_RADII = [4, 3, 5, 3.5, 6];

// Unique wobble patterns per particle (perpendicular amplitude at t = 0, 0.25, 0.5, 0.75, 1.0)
const WOBBLE_PATTERNS = [
  [0, 10, -6, 8, 0],
  [0, -8, 12, -4, 0],
  [0, 6, -10, 5, 0],
  [0, -12, 7, -9, 0],
  [0, 9, -5, 11, 0],
];

export function FieryEdge({
  startX,
  startY,
  endX,
  endY,
  color,
  active,
  nodeRadius,
}: FieryEdgeProps) {
  const gradientId = useMemo(
    () => `edge-gradient-${startX}-${startY}-${endX}-${endY}`,
    [startX, startY, endX, endY]
  );
  const glowFilterId = useMemo(
    () => `edge-glow-${startX}-${startY}-${endX}-${endY}`,
    [startX, startY, endX, endY]
  );

  // Calculate the vector from start to end
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Normalized direction
  const nx = length > 0 ? dx / length : 0;
  const ny = length > 0 ? dy / length : 0;

  // Perpendicular vector for wobble
  const perpX = -ny;
  const perpY = nx;

  // Perimeter start point — particles begin from the edge of the center node
  const perimeterX = startX + nx * nodeRadius;
  const perimeterY = startY + ny * nodeRadius;

  // Edge vector from perimeter to end
  const edgeDx = endX - perimeterX;
  const edgeDy = endY - perimeterY;

  if (!active) {
    return (
      <line
        x1={perimeterX}
        y1={perimeterY}
        x2={endX}
        y2={endY}
        stroke="#444"
        strokeDasharray="6 4"
        opacity={0.3}
        strokeWidth={1.5}
      />
    );
  }

  // Pre-compute wobbling keyframes for each particle
  const particleKeyframes = WOBBLE_PATTERNS.map((wobble) => {
    const tSteps = [0, 0.25, 0.5, 0.75, 1.0];
    return {
      cx: tSteps.map((t, j) => perimeterX + edgeDx * t + perpX * wobble[j]),
      cy: tSteps.map((t, j) => perimeterY + edgeDy * t + perpY * wobble[j]),
    };
  });

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Gradient + filter definitions */}
      <defs>
        <linearGradient
          id={gradientId}
          x1={perimeterX}
          y1={perimeterY}
          x2={endX}
          y2={endY}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#c87828" />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
        <filter id={glowFilterId}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow line (behind) — breathes with width + opacity */}
      <motion.line
        x1={perimeterX}
        y1={perimeterY}
        x2={endX}
        y2={endY}
        stroke={`url(#${gradientId})`}
        filter={`url(#${glowFilterId})`}
        strokeLinecap="round"
        animate={{ opacity: [0.3, 0.9, 0.3], strokeWidth: [2, 5, 2] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main line */}
      <motion.line
        x1={perimeterX}
        y1={perimeterY}
        x2={endX}
        y2={endY}
        stroke={`url(#${gradientId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Energy flow line — dashed, cycling offset */}
      <motion.line
        x1={perimeterX}
        y1={perimeterY}
        x2={endX}
        y2={endY}
        stroke={`url(#${gradientId})`}
        strokeWidth={1}
        strokeLinecap="round"
        strokeDasharray="8 12"
        strokeOpacity={0.4}
        animate={{ strokeDashoffset: [0, -40] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />

      {/* Fire particles with wobble + ember trails */}
      {PARTICLE_COLORS.map((particleColor, i) => {
        const kf = particleKeyframes[i];
        return (
          <g key={i}>
            {/* Trail ember 1 — delayed, smaller, faster fade */}
            <motion.circle
              r={PARTICLE_RADII[i] * 0.35}
              fill={particleColor}
              initial={{ cx: perimeterX, cy: perimeterY, opacity: 0 }}
              animate={{
                cx: kf.cx,
                cy: kf.cy,
                opacity: [0.5, 0.3, 0],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: PARTICLE_DELAYS[i] + 0.15,
                ease: "easeOut",
              }}
            />

            {/* Trail ember 2 */}
            <motion.circle
              r={PARTICLE_RADII[i] * 0.2}
              fill={particleColor}
              initial={{ cx: perimeterX, cy: perimeterY, opacity: 0 }}
              animate={{
                cx: kf.cx,
                cy: kf.cy,
                opacity: [0.35, 0.15, 0],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: PARTICLE_DELAYS[i] + 0.3,
                ease: "easeOut",
              }}
            />

            {/* Main particle — wobbling path */}
            <motion.circle
              r={PARTICLE_RADII[i]}
              fill={particleColor}
              initial={{ cx: perimeterX, cy: perimeterY, opacity: 0 }}
              animate={{
                cx: kf.cx,
                cy: kf.cy,
                opacity: [0.9, 0.8, 0.5, 0.2, 0],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: PARTICLE_DELAYS[i],
                ease: "easeOut",
              }}
            />
          </g>
        );
      })}
    </motion.g>
  );
}
