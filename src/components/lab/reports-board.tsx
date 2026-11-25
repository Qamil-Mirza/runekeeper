"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReportCard } from "@/lib/lab/types";
import { cardDate, fullDate, reportColumn, titleOf } from "@/lib/lab/board-display";
import { Board } from "./board";
import { DocModal } from "./doc-modal";
import { NoteBox } from "./note-box";
import { postJson, useNow, type Polled } from "./use-lab";

export function ReportsBoard({ data, error, refresh }: Polled<{ cards: ReportCard[] }>) {
  const [open, setOpen] = useState<ReportCard | null>(null);
  // Unsent replies by report id: closing the modal keeps them; a sent reply clears them.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const setDraft = useCallback((id: string, text: string) => setDrafts((d) => ({ ...d, [id]: text })), []);
  // Only if unchanged since it was sent: text typed while sending stays.
  const clearDraft = useCallback(
    (id: string, sent: string) => setDrafts((d) => (d[id] === sent ? { ...d, [id]: "" } : d)),
    [],
  );
  const now = useNow(60_000);

  if (!data) {
    return <p className="lab-line">{error ? `Couldn't load the reports · ${error}` : "Loading…"}</p>;
  }
  const by = (col: string) => data.cards.filter((c) => reportColumn(c) === col);
  // The board's copy is the freshest: replies and read state come from it.
  const current = open && (data.cards.find((c) => c.id === open.id) ?? open);

  return (
    <>
      {error && <p className="lab-line lab-board-note">Couldn&apos;t refresh · {error}</p>}
      <Board
        columns={[
          { key: "unread", title: "Unread", dot: "var(--lab-accent)", items: by("unread"), empty: "Nothing unread" },
          { key: "read", title: "Read", dot: "var(--lab-dim)", items: by("read") },
          { key: "replied", title: "Replied", dot: "var(--lab-faint)", items: by("replied") },
        ]}
        renderCard={(c) => <ReportCardBody card={c} now={now} />}
        onOpen={setOpen}
      />
      {current && (
        <ReportModal
          key={current.id}
          report={current}
          reply={drafts[current.id] ?? ""}
          onReply={(text) => setDraft(current.id, text)}
          onSent={(sent) => clearDraft(current.id, sent)}
          onClose={() => setOpen(null)}
          refresh={refresh}
        />
      )}
    </>
  );
}

function ReportCardBody({ card: c, now }: { card: ReportCard; now: Date }) {
  const latest = c.replies.at(-1);
  return (
    <>
      <span className="lab-card-t">{titleOf(c.experiment, c.title)}</span>
      {c.summary && <span className="lab-card-s">{c.summary}</span>}
      {latest && <span className="lab-card-q">&ldquo;{latest.body}&rdquo;</span>}
      <span className="lab-card-m">{cardDate(c.createdAt, now)}</span>
    </>
  );
}

function ReportModal({
  report: r,
  reply,
  onReply,
  onSent,
  onClose,
  refresh,
}: {
  report: ReportCard;
  reply: string;
  onReply(text: string): void;
  onSent(sent: string): void;
  onClose(): void;
  refresh(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const id = encodeURIComponent(r.id);

  // Opening a report marks it read.
  useEffect(() => {
    postJson(`/api/lab/reports/${id}/read`, {})
      .then(refresh)
      .catch(() => {});
  }, [id, refresh]);

  const send = async () => {
    setBusy(true);
    setMessage(null);
    const sent = reply;
    try {
      await postJson(`/api/lab/reports/${id}/replies`, { body: sent.trim() });
      onSent(sent);
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DocModal
      title={titleOf(r.experiment, r.title)}
      meta={`From the advisor · ${fullDate(r.createdAt)}`}
      onClose={onClose}
      fill
      footer={
        <>
          {r.replies.length > 0 && (
            <ol className="lab-replies">
              {r.replies.map((x, i) => (
                <li key={`${x.createdAt}-${i}`} className="lab-reply">
                  <p className="lab-reply-body">{x.body}</p>
                  <span className="lab-reply-at">{fullDate(x.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
          <NoteBox label="Thoughts for the advisor (optional)" value={reply} onChange={onReply} />
          <div className="lab-actions">
            <button type="button" className="lab-btn" disabled={!reply.trim() || busy} onClick={send}>
              Send
            </button>
            {message && <span className="lab-action-msg" role="status" title={message}>{message}</span>}
          </div>
        </>
      }
    >
      <iframe sandbox="allow-scripts" src={`/api/lab/reports/${id}/html`} title={r.title} className="lab-frame" />
    </DocModal>
  );
}
