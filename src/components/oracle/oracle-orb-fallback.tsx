"use client";

import type { OrbState } from "./oracle-orb";

interface OracleOrbFallbackProps {
  state: OrbState;
  amplitude: number;
  size?: number;
  className?: string;
}

const stateStyles: Record<OrbState, { scale: number; glowOpacity: number; ringSpeed: string }> = {
  idle: { scale: 1, glowOpacity: 0.3, ringSpeed: "8s" },
  listening: { scale: 0.95, glowOpacity: 0.2, ringSpeed: "6s" },
  thinking: { scale: 1, glowOpacity: 0.4, ringSpeed: "3s" },
  speaking: { scale: 1.08, glowOpacity: 0.6, ringSpeed: "4s" },
  muted: { scale: 0.95, glowOpacity: 0.1, ringSpeed: "16s" },
};

export function OracleOrbFallback({ state, amplitude, size = 240, className }: OracleOrbFallbackProps) {
  const styles = stateStyles[state];
  const ampScale = 1 + amplitude * 0.12;
  const totalScale = styles.scale * ampScale;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        position: "relative",
        transform: `scale(${totalScale})`,
        transition: "transform 0.15s ease-out",
      }}
      aria-hidden="true"
    >
      {/* Core sphere */}
      <div
        style={{
          position: "absolute",
          inset: "15%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,120,40,0.7), rgba(80,40,180,0.5) 50%, rgba(20,10,40,0.3) 75%, transparent)",
          boxShadow: `0 0 ${60 * styles.glowOpacity * 2}px rgba(200,120,40,${styles.glowOpacity}), 0 0 ${100 * styles.glowOpacity * 2}px rgba(80,40,180,${styles.glowOpacity * 0.7})`,
          animation: `orbPulse 3.5s ease-in-out infinite`,
        }}
      />
      {/* Ring 1 */}
      <div
        style={{
          position: "absolute",
          inset: "10%",
          borderRadius: "50%",
          border: "2px solid rgba(200,160,80,0.3)",
          animation: `orbRing ${styles.ringSpeed} linear infinite`,
        }}
      />
      {/* Ring 2 */}
      <div
        style={{
          position: "absolute",
          inset: "5%",
          borderRadius: "50%",
          border: "1px dashed rgba(140,100,220,0.4)",
          animation: `orbRing ${styles.ringSpeed} linear infinite reverse`,
        }}
      />
      {/* Inner glow */}
      <div
        style={{
          position: "absolute",
          inset: "25%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,220,150,0.5), transparent 70%)",
        }}
      />
      <style>{`
        @keyframes orbPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.06); filter: brightness(1.15); }
        }
        @keyframes orbRing {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
