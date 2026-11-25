"use client";

import { useId } from "react";

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
      </div>
      {showCount && (
        <div id={countId} className="lab-notebox-count lab-num">
          {left} characters left
        </div>
      )}
    </div>
  );
}
