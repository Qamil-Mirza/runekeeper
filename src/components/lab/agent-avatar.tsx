"use client";

import type { LabAgent, LabAgentState } from "@/lib/lab/types";

/**
 * A small animated figure for one agent. Decorative only: the agent's state
 * is always also written beside it. The drawing is one SVG; `data-state` and
 * `data-role` pick which parts show and move (see lab.css, "Agent avatars").
 */
export function AgentAvatar({ role, state, size = 72 }: { role: LabAgent["role"]; state: LabAgentState; size?: number }) {
  return (
    <svg
      className="lab-avatar"
      data-state={state}
      data-role={role}
      width={(size * 80) / 64}
      height={size}
      viewBox="0 0 80 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse className="av-shadow" cx="30" cy="59" rx="14" ry="1.8" stroke="none" />

      {/* Not provisioned: only the place where the agent would stand. */}
      <g className="av-ghost" strokeDasharray="2.5 3">
        <rect x="18" y="10" width="24" height="18" rx="5" />
        <rect x="20" y="30" width="20" height="18" rx="4" />
      </g>

      <g className="av-bot">
        <g className="av-legs">
          <path d="M26 48v7M34 48v7M23.5 55.5h4M32.5 55.5h4" />
        </g>
        <g className="av-body">
          <rect className="av-fill" x="20" y="30" width="20" height="18" rx="4" />
          <circle className="av-core" cx="30" cy="37" r="1.9" stroke="none" />
          <path d="M26 43h8" opacity="0.5" />
        </g>
        <path className="av-arm-left" d="M20 34l-6 8" />
        <path className="av-arm-right" d="M40 34l6 8" />
        {/* Raised arm: waving for attention. */}
        <path className="av-arm-wave" d="M40 34l7-9" />
        {/* The Executor's working arm, with a hammer. */}
        <g className="av-arm-hammer">
          <path d="M40 34l7-7" />
          <path d="M47 27l5-7" />
          <rect className="av-solid av-raw" x="48.5" y="15.5" width="8" height="4.5" rx="1" transform="rotate(35 52.5 17.75)" />
        </g>

        <g className="av-head">
          <path d="M30 10V5.5" />
          <circle className="av-antenna" cx="30" cy="4" r="1.8" />
          <rect className="av-fill" x="18" y="10" width="24" height="18" rx="5" />
          <g className="av-eyes-open" stroke="none">
            <circle className="av-solid" cx="25" cy="19" r="2.2" />
            <circle className="av-solid" cx="35" cy="19" r="2.2" />
          </g>
          <path className="av-eyes-closed" d="M22.5 19.5q2.5 2 5 0M32.5 19.5q2.5 2 5 0" />
          <path className="av-eyes-off" d="M23 19.5h4M33 19.5h4" />
          <path className="av-eyes-x" d="M23 17.5l4 4M27 17.5l-4 4M33 17.5l4 4M37 17.5l-4 4" />
          <path className="av-mouth" d="M27 24h6" />
          {/* Executor: hard hat. */}
          <g className="av-hat">
            <path className="av-solid" d="M17 12.5q13-14 26 0z" />
            <path d="M14.5 12.5h31" />
          </g>
          {/* Stopped: a plaster. */}
          <g className="av-plaster">
            <rect className="av-fill av-raw" x="32" y="9" width="11" height="5.5" rx="1.5" transform="rotate(28 37.5 11.75)" />
            <path className="av-raw" d="M36.5 10.5v3M38.8 11.6v3" transform="rotate(28 37.5 11.75)" />
          </g>
          {/* Crashed: a crack. */}
          <path className="av-crack" d="M33 10l-3 5 4 2-3 5" />
        </g>
      </g>

      {/* Idle: asleep. */}
      <g className="av-zzz" stroke="none">
        <text className="av-z av-z1" x="45" y="14" fontSize="11">z</text>
        <text className="av-z av-z2" x="52" y="8" fontSize="8">z</text>
      </g>

      {/* Needs you. */}
      <g className="av-alert">
        <path className="av-fill" d="M54 4h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-8l-5 4v-4h-1a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
        <path d="M61 8v5" strokeWidth="2" />
        <circle className="av-solid" cx="61" cy="16" r="1" stroke="none" />
      </g>

      {/* Crashed: sparks. */}
      <path className="av-sparks" d="M46 8l3-3M48 13h4M45 3v-2" />

      {/* Stopped: a barrier. */}
      <g className="av-barrier">
        <path d="M54 56V40M72 56V40" />
        <rect className="av-fill" x="52" y="41" width="22" height="6" rx="1" />
        <path d="M57 47l3-6M63 47l3-6M69 47l3-6" />
      </g>

      {/* Working props, one per role. */}
      <g className="av-prop av-prop-orchestrator">
        <rect className="av-fill" x="52" y="16" width="21" height="30" rx="2.5" />
        <path d="M59 16v-2h7v2" />
        <path d="M61 24h8M61 32h8M61 40h8" opacity="0.6" />
        <path className="av-check av-check1" d="M55.5 24l1.5 1.5 2.5-3" />
        <path className="av-check av-check2" d="M55.5 32l1.5 1.5 2.5-3" />
        <path className="av-check av-check3" d="M55.5 40l1.5 1.5 2.5-3" />
      </g>
      <g className="av-prop av-prop-executor">
        <rect className="av-fill av-brick av-brick1" x="52" y="50" width="10" height="6" rx="1" />
        <rect className="av-fill av-brick av-brick2" x="63" y="50" width="10" height="6" rx="1" />
        <rect className="av-fill av-brick av-brick3" x="57.5" y="43" width="10" height="6" rx="1" />
      </g>
      <g className="av-prop av-prop-reviewer">
        <rect className="av-fill" x="52" y="18" width="20" height="28" rx="2" />
        <path d="M56 25h12M56 31h12M56 37h8" opacity="0.6" />
        <g className="av-lens">
          <circle className="av-fill" cx="60" cy="28" r="5.5" />
          <path d="M64 32l5 5" strokeWidth="2.2" />
        </g>
      </g>
      <g className="av-prop av-prop-advisor">
        <circle className="av-dot av-dot1 av-solid" cx="46" cy="20" r="1" stroke="none" />
        <circle className="av-dot av-dot2 av-solid" cx="50.5" cy="16" r="1.4" stroke="none" />
        <g className="av-bulb">
          <path className="av-fill" d="M62 4a7 7 0 0 1 4 12.7V19h-8v-2.3A7 7 0 0 1 62 4z" />
          <path d="M59.5 22h5" />
          <path className="av-rays" d="M50 6l2 1.5M74 6l-2 1.5M62 0v-0.1" />
        </g>
        <path d="M52 50q5-4 10 0q5-4 10 0v-9q-5-4-10 0q-5-4-10 0zM62 41v9" />
      </g>
    </svg>
  );
}
