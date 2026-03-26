"use client";

import { motion } from "framer-motion";
import type { IntegrationNodeDef } from "./integration-types";

interface IntegrationNodeProps {
  node: IntegrationNodeDef;
  size?: number;
  onClick?: () => void;
}

const statusBadge = {
  active: {
    label: "Connected",
    className: "bg-[#2d5a2d] text-[#6bcb6b] border-[#3a7a3a]",
  },
  "setup-required": {
    label: "Setup Required",
    className: "bg-[#5a4a2d] text-[#d4a860] border-[#7a6a3a]",
  },
  "coming-soon": {
    label: "Coming Soon",
    className: "bg-[#333] text-[#888] border-[#555]",
  },
};

export function IntegrationNode({ node, size = 80, onClick }: IntegrationNodeProps) {
  const isClickable = node.status !== "coming-soon";
  const badge = statusBadge[node.status];

  return (
    <motion.button
      type="button"
      onClick={isClickable ? onClick : undefined}
      className={`
        relative flex flex-col items-center justify-center
        rounded-full
        text-center transition-colors
        ${
          node.status === "coming-soon"
            ? "bg-[#2c2018] border-2 border-dashed border-[#555] opacity-40 cursor-default"
            : node.status === "active"
              ? "border-2 cursor-pointer"
              : "border-2 border-dashed cursor-pointer"
        }
      `}
      style={{
        width: size,
        height: size,
        ...(isClickable
          ? {
              background: `radial-gradient(circle at 40% 40%, ${node.color}, ${node.color}88)`,
              borderColor: node.color,
              boxShadow: `0 0 20px ${node.color}66`,
            }
          : {}),
      }}
      whileHover={isClickable ? { scale: 1.1 } : undefined}
      whileTap={isClickable ? { scale: 0.95 } : undefined}
    >
      {/* Icon */}
      <div className="w-6 h-6">{node.icon}</div>

      {/* Label */}
      <span
        className={`text-[11px] font-label mt-1 font-medium ${
          node.status === "coming-soon" ? "text-[#666]" : "text-white"
        }`}
      >
        {node.label}
      </span>

      {/* Status badge */}
      <span
        className={`
          absolute -bottom-2 left-1/2 -translate-x-1/2
          text-[8px] px-1.5 py-0.5 rounded-full border whitespace-nowrap
          font-label font-medium
          ${badge.className}
        `}
      >
        {badge.label}
      </span>
    </motion.button>
  );
}
