"use client";

export function HangingLantern() {
  return (
    <div className="lantern-assembly">
      <svg
        viewBox="0 0 120 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        aria-hidden="true"
      >
        {/* SVG filter for flame turbulence */}
        <defs>
          <filter id="flame-warp" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.03"
              numOctaves="3"
              result="noise"
            >
              <animate
                attributeName="seed"
                from="0"
                to="100"
                dur="4s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="3"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          {/* Warm glow filter for glass panels */}
          <filter id="panel-glow">
            <feGaussianBlur stdDeviation="2" />
          </filter>

          {/* Radial gradient for glass panel warm fill */}
          <radialGradient id="glass-warmth" cx="50%" cy="60%" r="50%">
            <stop offset="0%" stopColor="rgba(200, 120, 40, 0.12)" />
            <stop offset="100%" stopColor="rgba(200, 120, 40, 0.03)" />
          </radialGradient>
        </defs>

        {/* ── Chain Links ── */}
        <g className="lantern-chain">
          {/* Top hook */}
          <path
            d="M60 8 C60 2, 54 0, 54 6 L54 16"
            stroke="#8b6830"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M60 8 C60 2, 66 0, 66 6 L66 16"
            stroke="#8b6830"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Chain link 1 */}
          <ellipse
            cx="60"
            cy="28"
            rx="5"
            ry="10"
            stroke="#8b6830"
            strokeWidth="2.5"
            fill="none"
          />

          {/* Chain link 2 */}
          <ellipse
            cx="60"
            cy="48"
            rx="5"
            ry="10"
            stroke="#6b5020"
            strokeWidth="2.5"
            fill="none"
          />

          {/* Chain link 3 */}
          <ellipse
            cx="60"
            cy="68"
            rx="5"
            ry="10"
            stroke="#8b6830"
            strokeWidth="2.5"
            fill="none"
          />
        </g>

        {/* ── Lantern Cap / Crown ── */}
        <g>
          {/* Top finial / knob */}
          <circle cx="60" cy="85" r="4" fill="#5a3a1a" stroke="#6b5020" strokeWidth="1" />

          {/* Cap — flat trapezoid top */}
          <path
            d="M42 92 L78 92 L82 100 L38 100 Z"
            fill="#5a3a1a"
            stroke="#6b5020"
            strokeWidth="1"
          />

          {/* Decorative cap ridge */}
          <line x1="38" y1="100" x2="82" y2="100" stroke="#7a5828" strokeWidth="1.5" />
        </g>

        {/* ── Glass Panels (4 sides represented as front-facing) ── */}
        <g>
          {/* Left glass panel */}
          <path
            d="M40 102 L44 198 L58 198 L54 102 Z"
            fill="url(#glass-warmth)"
            stroke="#8b6830"
            strokeWidth="1"
            opacity="0.9"
          />

          {/* Right glass panel */}
          <path
            d="M66 102 L76 102 L80 198 L62 198 Z"
            fill="url(#glass-warmth)"
            stroke="#8b6830"
            strokeWidth="1"
            opacity="0.9"
          />

          {/* Center glass (front panel — slightly brighter to show flame behind) */}
          <path
            d="M54 102 L66 102 L62 198 L58 198 Z"
            fill="rgba(200, 120, 40, 0.06)"
            stroke="#8b6830"
            strokeWidth="0.5"
            opacity="0.7"
          />
        </g>

        {/* ── Iron Frame Bars ── */}
        <g stroke="#5a3a1a" strokeWidth="2.5" strokeLinecap="round">
          {/* Left bar */}
          <line x1="40" y1="100" x2="44" y2="200" />
          {/* Right bar */}
          <line x1="80" y1="100" x2="76" y2="200" />
          {/* Center-left bar */}
          <line x1="54" y1="100" x2="55" y2="200" />
          {/* Center-right bar */}
          <line x1="66" y1="100" x2="65" y2="200" />
        </g>

        {/* ── Decorative Cross Bars ── */}
        <g stroke="#5a3a1a" strokeWidth="1.5">
          {/* Upper cross bar */}
          <line x1="41" y1="130" x2="79" y2="130" />
          {/* Lower cross bar */}
          <line x1="43" y1="170" x2="77" y2="170" />
        </g>

        {/* ── Rivets at joints ── */}
        <g fill="#7a5828">
          <circle cx="41" cy="130" r="2" />
          <circle cx="79" cy="130" r="2" />
          <circle cx="43" cy="170" r="2" />
          <circle cx="77" cy="170" r="2" />
          <circle cx="54.5" cy="130" r="1.5" />
          <circle cx="65.5" cy="130" r="1.5" />
          <circle cx="55" cy="170" r="1.5" />
          <circle cx="65" cy="170" r="1.5" />
        </g>

        {/* ── Base Ring ── */}
        <g>
          <path
            d="M44 198 L76 198 L80 206 L40 206 Z"
            fill="#5a3a1a"
            stroke="#6b5020"
            strokeWidth="1"
          />
          {/* Bottom edge detail */}
          <line x1="40" y1="206" x2="80" y2="206" stroke="#7a5828" strokeWidth="1.5" />
          {/* Small bottom finial */}
          <circle cx="60" cy="212" r="3" fill="#5a3a1a" stroke="#6b5020" strokeWidth="1" />
        </g>

      </svg>

      {/* ── Flame Layers (HTML for performant CSS animation) ── */}
      <div className="lantern-flame-container">
        <div className="lantern-flame-outer" />
        <div className="lantern-flame-mid" />
        <div className="lantern-flame-core" />
      </div>

      {/* ── Glow beneath the lantern ── */}
      <div className="lantern-glow" />
    </div>
  );
}
