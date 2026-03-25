"use client";

export function CenterFlameNode() {
  return (
    <div className="relative flex flex-col items-center">
      {/* Circular container */}
      <div className="relative w-[120px] h-[120px] rounded-full bg-[radial-gradient(circle_at_center,rgba(200,120,40,0.15)_0%,rgba(44,24,16,0.9)_60%,#2c1810_100%)] border-2 border-[#5a3a1a] flex items-center justify-center shadow-[0_0_40px_rgba(200,120,40,0.25),0_0_80px_rgba(200,120,40,0.1)]">
        {/* Inner glow — behind flame */}
        <div className="absolute inset-0 z-0 rounded-full bg-[radial-gradient(circle_at_50%_60%,rgba(240,180,80,0.2)_0%,rgba(200,120,40,0.08)_40%,transparent_70%)] pointer-events-none" />
        {/* Scaled-up flame using lantern CSS */}
        <div
          className="lantern-flame-container z-10"
          style={{ position: "relative", width: 70, height: 90, transform: "scale(1.8) translate(-47%, -30%)", transformOrigin: "center bottom" }}
        >
          <div className="lantern-flame-outer" />
          <div className="lantern-flame-mid" />
          <div className="lantern-flame-core" />
        </div>
      </div>
      {/* Label */}
      <span className="mt-2 text-[11px] font-label tracking-[2px] uppercase text-[#9b8a70] font-semibold">
        Runekeeper
      </span>
    </div>
  );
}
