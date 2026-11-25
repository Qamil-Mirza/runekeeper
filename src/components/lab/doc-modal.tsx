"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/** The element that opened the modal, for giving focus back on close. */
function openerOf(): { el: HTMLElement | null; card: string | null } {
  const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return { el, card: el?.dataset.labCard ?? null };
}

/**
 * A large document modal: near full screen from 768 px, full screen below.
 * Esc and ✕ close it; focus stays inside while it is open and goes back to the
 * card that opened it (found again by `data-lab-card` if the board re-rendered
 * it); the page behind does not scroll.
 *
 * `fill` drops the body's padding and scrolling, for a frame that fills it.
 */
export function DocModal({
  title,
  meta,
  onClose,
  children,
  footer,
  fill = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = openerOf();
    const body = document.body;
    const overflow = body.style.overflow;
    body.style.overflow = "hidden";
    panel.current?.focus();

    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.getClientRects().length > 0,
      );

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const p = panel.current;
      if (!p) return;
      const list = focusables();
      const active = document.activeElement;
      if (list.length === 0) {
        e.preventDefault();
        p.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (!active || !p.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === p)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // Anything that still gets focus behind the modal hands it back.
    const onFocusIn = (e: FocusEvent) => {
      const p = panel.current;
      if (p && e.target instanceof Node && !p.contains(e.target)) p.focus();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
      body.style.overflow = overflow;
      const back = opener.el?.isConnected
        ? opener.el
        : opener.card
          ? document.querySelector<HTMLElement>(`[data-lab-card="${CSS.escape(opener.card)}"]`)
          : null;
      back?.focus();
    };
  }, []);

  return createPortal(
    <div className="lab-root lab-layer">
      <div
        ref={panel}
        className="lab-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="lab-modal-head">
          <div className="lab-modal-heading">
            <h2 id={titleId} className="lab-modal-title">
              {title}
            </h2>
            {meta && <div className="lab-modal-meta">{meta}</div>}
          </div>
          <button type="button" className="lab-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={fill ? "lab-modal-body lab-modal-fill" : "lab-modal-body"}>{children}</div>
        {footer && <div className="lab-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
