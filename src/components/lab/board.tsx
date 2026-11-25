"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface BoardColumn<T> {
  key: string;
  title: string;
  /** The column's dot colour, a CSS colour (usually a palette var). */
  dot: string;
  items: T[];
  /** The faint line an empty column shows. */
  empty?: string;
  /** An extra class for this column's cards. */
  cardClassName?: string;
}

/**
 * A three-column board of cards; the columns stack below 768 px in the given
 * order. Each card is a button that opens its item.
 */
export function Board<T extends { id: string }>({
  columns,
  renderCard,
  onOpen,
}: {
  columns: BoardColumn<T>[];
  renderCard: (item: T) => ReactNode;
  onOpen: (item: T) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // The card last opened, and the element it was on.
  const opened = useRef<{ id: string; el: HTMLElement | null } | null>(null);

  // A card that changes column (read, decided) is a new element. If focus was
  // on the old one and fell to the page, put it on the card again.
  useEffect(() => {
    const o = opened.current;
    if (!o || !root.current) return;
    const el = root.current.querySelector<HTMLElement>(`[data-lab-card="${CSS.escape(o.id)}"]`);
    if (!el || el === o.el) return;
    opened.current = { id: o.id, el };
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost && !document.querySelector('[aria-modal="true"]')) el.focus();
  });

  return (
    <div className="lab-board" ref={root}>
      {columns.map((col) => (
        <section className="lab-col" key={col.key} aria-labelledby={`lab-col-${col.key}`}>
          <h3 className="lab-col-head" id={`lab-col-${col.key}`}>
            <span className="lab-dot" style={{ background: col.dot }} aria-hidden="true" />
            {col.title}
            <span className="lab-col-n lab-num">{col.items.length}</span>
          </h3>
          {col.items.length === 0 ? (
            <p className="lab-col-empty">{col.empty ?? "Nothing here"}</p>
          ) : (
            col.items.map((item) => (
              <button
                key={item.id}
                type="button"
                data-lab-card={item.id}
                className={col.cardClassName ? `lab-card ${col.cardClassName}` : "lab-card"}
                onClick={(e) => {
                  // Safari does not focus a clicked button; the modal gives focus back to it.
                  e.currentTarget.focus();
                  opened.current = { id: item.id, el: e.currentTarget };
                  onOpen(item);
                }}
              >
                {renderCard(item)}
              </button>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
