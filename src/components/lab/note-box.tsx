"use client";

import { useId, useRef } from "react";
import { useDictation } from "./use-dictation";

/** Notes and replies are refused by the API above this many characters. */
export const NOTE_MAX = 10_000;
// The remaining count appears only when this few are left.
const COUNT_BELOW = 500;

/** A labelled text box for the owner's notes. */
export function NoteBox({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  required?: boolean;
}) {
  const id = useId();
  const countId = `${id}-count`;
  const left = NOTE_MAX - value.length;
  const showCount = left < COUNT_BELOW;

  // Dictated phrases are appended after the current text, kept within the limit.
  const valueRef = useRef(value);
  valueRef.current = value;
  const dictation = useDictation((text) => {
    if (!text) return;
    const cur = valueRef.current;
    const next = cur && !/\s$/.test(cur) ? `${cur} ${text}` : `${cur}${text}`;
    const clipped = next.slice(0, NOTE_MAX);
    valueRef.current = clipped;
    onChange(clipped);
  });

  return (
    <div className="lab-notebox">
      <label htmlFor={id} className="lab-notebox-label">
        {label}
      </label>
      <div className="lab-notebox-field">
        <textarea
          id={id}
          className="lab-notebox-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={NOTE_MAX}
          required={required}
          rows={3}
          aria-describedby={showCount ? countId : undefined}
        />
        {dictation.supported && (
          <button
            type="button"
            className="lab-notebox-mic"
            data-on={dictation.listening || undefined}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? "Stop dictation" : "Start dictation"}
            onClick={dictation.listening ? dictation.stop : dictation.start}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
      </div>
      {dictation.interim && <div className="lab-notebox-interim">{dictation.interim}</div>}
      {dictation.hint && <div className="lab-notebox-count">{dictation.hint}</div>}
      {showCount && (
        <div id={countId} className="lab-notebox-count lab-num">
          {left} characters left
        </div>
      )}
    </div>
  );
}
