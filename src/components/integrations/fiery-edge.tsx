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

  // Perimeter start point — particles begin from the edge of the center node
  const perimeterX = startX + nx * nodeRadius;
  const perimeterY = startY + ny * nodeRadius;

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

  return (
    <g>
      {/* Gradient definition */}
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

      {/* Glow line (behind) */}
      <motion.line
        x1={perimeterX}
        y1={perimeterY}
        x2={endX}
        y2={endY}
        stroke={`url(#${gradientId})`}
        strokeWidth={3}
        filter={`url(#${glowFilterId})`}
        strokeLinecap="round"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
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
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Fire particles */}
      {PARTICLE_COLORS.map((particleColor, i) => (
        <motion.circle
          key={i}
          r={PARTICLE_RADII[i]}
          fill={particleColor}
          animate={{
            cx: [perimeterX, endX],
            cy: [perimeterY, endY],
            opacity: [0.9, 0.6, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: PARTICLE_DELAYS[i],
            ease: "easeOut",
          }}
        />
      ))}
    </g>
  );
}
