"use client";

interface VoiceModeControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
}

export function VoiceModeControls({ isMuted, onToggleMute, onEndSession }: VoiceModeControlsProps) {
  return (
    <div className="flex items-center gap-6">
      {/* Mute button */}
      <button
        onClick={onToggleMute}
        className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all duration-200 cursor-pointer ${
          isMuted
            ? "border-[rgba(200,120,40,0.6)] bg-[rgba(200,120,40,0.15)] text-[rgba(200,120,40,0.8)]"
            : "border-[rgba(200,120,40,0.3)] bg-transparent text-[rgba(200,120,40,0.5)] hover:border-[rgba(200,120,40,0.5)] hover:text-[rgba(200,120,40,0.7)]"
        }`}
        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="1" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0012 0" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="3" y1="3" x2="21" y2="21" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="1" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0014 0" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <line x1="8" y1="21" x2="16" y2="21" />
          </svg>
        )}
      </button>

      {/* End session button */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={onEndSession}
          className="w-14 h-14 rounded-full border-2 border-[rgba(200,120,40,0.4)] bg-[rgba(200,60,60,0.15)] flex items-center justify-center hover:bg-[rgba(200,60,60,0.25)] transition-all duration-200 cursor-pointer"
          aria-label="End voice session"
          title="End Session"
        >
          <div className="w-5 h-5 rounded-sm bg-[rgba(220,80,80,0.7)]" />
        </button>
        <span className="text-[10px] text-[rgba(200,120,40,0.4)] uppercase tracking-widest font-label">
          End Session
        </span>
      </div>
    </div>
  );
}
