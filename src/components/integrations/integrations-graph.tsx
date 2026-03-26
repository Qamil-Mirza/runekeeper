"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as api from "@/lib/api-client";
import { CenterFlameNode } from "./center-flame-node";
import { IntegrationNode } from "./integration-node";
import { FieryEdge } from "./fiery-edge";
import { GmailConfigPanel } from "./gmail-config-panel";
import { CanvasConfigPanel } from "./canvas-config-panel";
import { GradescopeConfigPanel } from "./gradescope-config-panel";
import type { IntegrationNodeDef, IntegrationConfig } from "./integration-types";
import type { CanvasIntegrationConfig, GradescopeIntegrationConfig } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Inline icon components
// ---------------------------------------------------------------------------

function GmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
        stroke="#fff"
        strokeWidth={1.5}
      />
      <path
        d="M2 6l10 7 10-7"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M7 4v7M17 13v7M4 17h7M13 7h7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

function GradescopeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M12 3L2 8l10 5 10-5-10-5z"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M2 8v6l10 5 10-5V8"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M20 8v8"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx="20" cy="18" r="1.5" fill="#fff" />
    </svg>
  );
}

function CanvasIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M12 3L2 9l10 6 10-6-10-6z"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M2 9v8l10 6 10-6V9"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M12 15v8"
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOBILE_RADIUS = 160;
const MOBILE_BREAKPOINT = 640;

// Design baseline: at 500px min-dimension, sizes match original fixed values
const DESIGN_BASELINE = 500;
const clamp = (min: number, val: number, max: number) => Math.min(max, Math.max(min, val));

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function IntegrationsGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gmailConfig, setGmailConfig] = useState<IntegrationConfig | null>(null);
  const [canvasConfig, setCanvasConfig] = useState<CanvasIntegrationConfig | null>(null);
  const [gradescopeConfig, setGradescopeConfig] = useState<GradescopeIntegrationConfig | null>(null);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [graphRadius, setGraphRadius] = useState(180);
  const [centerNodeSize, setCenterNodeSize] = useState(120);
  const [integrationNodeSize, setIntegrationNodeSize] = useState(80);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const [isMobile, setIsMobile] = useState(false);

  // Responsive radius + container size — scales with viewport
  const updateDimensions = useCallback(() => {
    const mobile = window.innerWidth < MOBILE_BREAKPOINT;
    setIsMobile(mobile);
    if (mobile) {
      setGraphRadius(MOBILE_RADIUS);
      setCenterNodeSize(120);
      setIntegrationNodeSize(80);
    } else if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
      const scale = Math.min(rect.width, rect.height) / DESIGN_BASELINE;
      setGraphRadius(clamp(140, 180 * scale, 280));
      setCenterNodeSize(clamp(90, 120 * scale, 160));
      setIntegrationNodeSize(clamp(60, 80 * scale, 110));
      return; // containerSize already set
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [updateDimensions]);

  // Fetch integration configs on mount
  useEffect(() => {
    api
      .fetchGmailIntegration()
      .then((c) => setGmailConfig(c as IntegrationConfig))
      .catch(() => {});
    api
      .fetchCanvasIntegration()
      .then((c) => setCanvasConfig(c))
      .catch(() => {});
    api
      .fetchGradescopeIntegration()
      .then((c) => setGradescopeConfig(c))
      .catch(() => {});
  }, []);

  // Derive statuses
  const gmailStatus: IntegrationNodeDef["status"] = gmailConfig?.enabled
    ? "active"
    : "setup-required";
  const canvasStatus: IntegrationNodeDef["status"] = canvasConfig?.enabled
    ? "active"
    : "setup-required";
  const gradescopeStatus: IntegrationNodeDef["status"] = gradescopeConfig?.enabled
    ? "active"
    : "setup-required";

  // Node definitions
  const integrationNodes: IntegrationNodeDef[] = [
    { id: "gmail", label: "Gmail", icon: <GmailIcon />, status: gmailStatus, color: "#EA4335", angle: 0 },
    { id: "slack", label: "Slack", icon: <SlackIcon />, status: "coming-soon", color: "#4A154B", angle: 90 },
    { id: "gradescope", label: "Gradescope", icon: <GradescopeIcon />, status: gradescopeStatus, color: "#00B4D8", angle: 180 },
    { id: "canvas", label: "Canvas", icon: <CanvasIcon />, status: canvasStatus, color: "#E13F29", angle: 270 },
  ];

  // Helpers
  const centerX = containerSize.w / 2;
  const centerY = containerSize.h / 2;
  const centerNodeRadius = centerNodeSize / 2;

  function nodePosition(angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: centerX + Math.cos(rad) * graphRadius,
      y: centerY + Math.sin(rad) * graphRadius,
    };
  }

  // ---- Mobile: vertical card list ----
  if (isMobile) {
    const statusBadge: Record<IntegrationNodeDef["status"], { label: string; cls: string }> = {
      active: { label: "Connected", cls: "bg-[#2d5a2d] text-[#6bcb6b] border-[#3a7a3a]" },
      "setup-required": { label: "Setup Required", cls: "bg-[#5a4a2d] text-[#d4a860] border-[#7a6a3a]" },
      "coming-soon": { label: "Coming Soon", cls: "bg-[#333] text-[#888] border-[#555]" },
    };

    return (
      <div ref={containerRef} className="h-full overflow-y-auto px-4 py-6 space-y-4">
        {/* Small flame header */}
        <div className="flex justify-center" style={{ transform: "scale(0.7)", transformOrigin: "center top" }}>
          <CenterFlameNode />
        </div>

        {/* Integration cards */}
        <div className="space-y-3">
          {integrationNodes.map((node) => {
            const isClickable = node.status !== "coming-soon";
            const isExpanded = expandedNode === node.id;
            const badge = statusBadge[node.status];

            return (
              <div key={node.id}>
                <button
                  type="button"
                  onClick={isClickable ? () => setExpandedNode((prev) => (prev === node.id ? null : node.id)) : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                    node.status === "coming-soon"
                      ? "border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.15)] opacity-40 cursor-default"
                      : isExpanded
                        ? "border-[rgba(212,168,96,0.4)] bg-[rgba(212,168,96,0.08)]"
                        : "border-[rgba(212,168,96,0.15)] bg-[rgba(0,0,0,0.2)] active:bg-[rgba(212,168,96,0.08)]"
                  }`}
                >
                  {/* Icon circle */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      node.status === "coming-soon" ? "bg-[#2c2018] border border-dashed border-[#555]" : "border"
                    }`}
                    style={
                      isClickable
                        ? {
                            background: `radial-gradient(circle at 40% 40%, ${node.color}, ${node.color}88)`,
                            borderColor: node.color,
                            boxShadow: `0 0 12px ${node.color}44`,
                          }
                        : undefined
                    }
                  >
                    <div className="w-5 h-5">{node.icon}</div>
                  </div>

                  {/* Label */}
                  <span className={`font-label text-label-md flex-1 text-left ${
                    node.status === "coming-soon" ? "text-[#666]" : "text-on-surface"
                  }`}>
                    {node.label}
                  </span>

                  {/* Status badge */}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-label font-medium whitespace-nowrap ${badge.cls}`}>
                    {badge.label}
                  </span>
                </button>

                {/* Inline config panel */}
                <AnimatePresence>
                  {isExpanded && node.id === "gmail" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3">
                        <GmailConfigPanel
                          config={gmailConfig}
                          onClose={() => setExpandedNode(null)}
                          onUpdate={setGmailConfig}
                        />
                      </div>
                    </motion.div>
                  )}
                  {isExpanded && node.id === "canvas" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3">
                        <CanvasConfigPanel
                          config={canvasConfig}
                          onClose={() => setExpandedNode(null)}
                          onUpdate={setCanvasConfig}
                        />
                      </div>
                    </motion.div>
                  )}
                  {isExpanded && node.id === "gradescope" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3">
                        <GradescopeConfigPanel
                          config={gradescopeConfig}
                          onClose={() => setExpandedNode(null)}
                          onUpdate={setGradescopeConfig}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Desktop: radial graph ----
  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 items-center justify-center overflow-hidden"
    >
      {/* SVG edge layer */}
      {containerSize.w > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={containerSize.w}
          height={containerSize.h}
          viewBox={`0 0 ${containerSize.w} ${containerSize.h}`}
        >
          {integrationNodes.map((node) => {
            const pos = nodePosition(node.angle);
            const isConfigurable = node.id === "gmail" || node.id === "canvas" || node.id === "gradescope";
            const isActive = isConfigurable && (node.status === "active" || node.status === "setup-required");

            return (
              <FieryEdge
                key={node.id}
                startX={centerX}
                startY={centerY}
                endX={pos.x}
                endY={pos.y}
                color={node.color}
                active={isActive ? node.status === "active" : false}
                nodeRadius={centerNodeRadius}
              />
            );
          })}
        </svg>
      )}

      {/* Center flame */}
      <CenterFlameNode size={centerNodeSize} />

      {/* Orbital integration nodes */}
      {integrationNodes.map((node) => (
        <div
          key={node.id}
          className="absolute"
          style={{
            left: `calc(50% + ${Math.cos(((node.angle - 90) * Math.PI) / 180) * graphRadius}px)`,
            top: `calc(50% + ${Math.sin(((node.angle - 90) * Math.PI) / 180) * graphRadius}px)`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <IntegrationNode
            node={node}
            size={integrationNodeSize}
            onClick={() =>
              setExpandedNode((prev) => (prev === node.id ? null : node.id))
            }
          />
        </div>
      ))}

      {/* Gmail config panel — beside node */}
      <AnimatePresence>
        {expandedNode === "gmail" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-10"
            style={{
              left: `calc(50% + ${Math.cos(((0 - 90) * Math.PI) / 180) * graphRadius + integrationNodeSize / 2 + 20}px)`,
              top: `calc(50% + ${Math.sin(((0 - 90) * Math.PI) / 180) * graphRadius}px)`,
              transform: "translateY(-50%)",
            }}
          >
            <GmailConfigPanel
              config={gmailConfig}
              onClose={() => setExpandedNode(null)}
              onUpdate={setGmailConfig}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Canvas config panel — beside node (270° = left side) */}
      <AnimatePresence>
        {expandedNode === "canvas" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-10"
            style={{
              left: `calc(50% + ${Math.cos(((270 - 90) * Math.PI) / 180) * graphRadius - integrationNodeSize / 2 - 340}px)`,
              top: `calc(50% + ${Math.sin(((270 - 90) * Math.PI) / 180) * graphRadius}px)`,
              transform: "translateY(-50%)",
            }}
          >
            <CanvasConfigPanel
              config={canvasConfig}
              onClose={() => setExpandedNode(null)}
              onUpdate={setCanvasConfig}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gradescope config panel — beside node (180° = bottom) */}
      <AnimatePresence>
        {expandedNode === "gradescope" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-10"
            style={{
              left: `calc(50% + ${Math.cos(((180 - 90) * Math.PI) / 180) * graphRadius + integrationNodeSize / 2 + 20}px)`,
              bottom: `calc(50% - ${Math.sin(((180 - 90) * Math.PI) / 180) * graphRadius}px + 20px)`,
            }}
          >
            <GradescopeConfigPanel
              config={gradescopeConfig}
              onClose={() => setExpandedNode(null)}
              onUpdate={setGradescopeConfig}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
