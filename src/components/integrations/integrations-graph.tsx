"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as api from "@/lib/api-client";
import { CenterFlameNode } from "./center-flame-node";
import { IntegrationNode } from "./integration-node";
import { FieryEdge } from "./fiery-edge";
import { GmailConfigPanel } from "./gmail-config-panel";
import type { IntegrationNodeDef, IntegrationConfig } from "./integration-types";

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

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M9 3l-5 8 5 8M15 3l5 8-5 8"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M12 3l9 9-9 9-9-9z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DESKTOP_RADIUS = 180;
const MOBILE_RADIUS = 130;
const MOBILE_BREAKPOINT = 640;
const CENTER_NODE_RADIUS = 60; // half of the 120px flame node

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function IntegrationsGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gmailConfig, setGmailConfig] = useState<IntegrationConfig | null>(null);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [graphRadius, setGraphRadius] = useState(DESKTOP_RADIUS);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Responsive radius + container size
  const updateDimensions = useCallback(() => {
    setGraphRadius(
      window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_RADIUS : DESKTOP_RADIUS
    );
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

  // Fetch Gmail config on mount
  useEffect(() => {
    api
      .fetchGmailIntegration()
      .then((c) => setGmailConfig(c as IntegrationConfig))
      .catch(() => {});
  }, []);

  // Derive Gmail status
  const gmailStatus: IntegrationNodeDef["status"] = gmailConfig?.enabled
    ? "active"
    : "setup-required";

  // Node definitions
  const integrationNodes: IntegrationNodeDef[] = [
    { id: "gmail", label: "Gmail", icon: <GmailIcon />, status: gmailStatus, color: "#EA4335", angle: 0 },
    { id: "slack", label: "Slack", icon: <SlackIcon />, status: "coming-soon", color: "#4A154B", angle: 90 },
    { id: "github", label: "GitHub", icon: <GitHubIcon />, status: "coming-soon", color: "#6e5494", angle: 180 },
    { id: "linear", label: "Linear", icon: <LinearIcon />, status: "coming-soon", color: "#5E6AD2", angle: 270 },
  ];

  // Helpers
  const centerX = containerSize.w / 2;
  const centerY = containerSize.h / 2;

  function nodePosition(angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: centerX + Math.cos(rad) * graphRadius,
      y: centerY + Math.sin(rad) * graphRadius,
    };
  }

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
            const isActive = node.status === "active" || node.status === "setup-required";

            if (isActive && node.id === "gmail") {
              return (
                <FieryEdge
                  key={node.id}
                  startX={centerX}
                  startY={centerY}
                  endX={pos.x}
                  endY={pos.y}
                  color={node.color}
                  active={node.status === "active"}
                  nodeRadius={CENTER_NODE_RADIUS}
                />
              );
            }

            return (
              <FieryEdge
                key={node.id}
                startX={centerX}
                startY={centerY}
                endX={pos.x}
                endY={pos.y}
                color={node.color}
                active={false}
                nodeRadius={CENTER_NODE_RADIUS}
              />
            );
          })}
        </svg>
      )}

      {/* Center flame */}
      <CenterFlameNode />

      {/* Orbital integration nodes */}
      {integrationNodes.map((node) => {
        const pos = nodePosition(node.angle);
        return (
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
              onClick={() =>
                setExpandedNode((prev) => (prev === node.id ? null : node.id))
              }
            />
          </div>
        );
      })}

      {/* Gmail config panel */}
      <AnimatePresence>
        {expandedNode === "gmail" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-10"
            style={{
              left: `calc(50% + ${Math.cos(((0 - 90) * Math.PI) / 180) * graphRadius + 60}px)`,
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
    </div>
  );
}
