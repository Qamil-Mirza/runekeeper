"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ProtocolCard, ProtocolDetail } from "@/lib/lab/types";
import { cardDate, fullDate, protocolColumns, revisesLine, titleOf } from "@/lib/lab/board-display";
import { Board } from "./board";
import { DocModal } from "./doc-modal";
import { LabMarkdown } from "./lab-markdown";
import { NoteBox } from "./note-box";
import { getJson, LabRequestError, postJson, useNow, type Polled } from "./use-lab";

export function ProtocolsBoard({ data, error, refresh }: Polled<{ cards: ProtocolCard[] }>) {
  const [open, setOpen] = useState<ProtocolCard | null>(null);
  const now = useNow(60_000);

  if (!data) {
    return <p className="lab-line">{error ? `Couldn't load the protocols · ${error}` : "Loading…"}</p>;
  }
  const cols = protocolColumns(data.cards);

  return (
    <>
      {error && <p className="lab-line lab-board-note">Couldn&apos;t refresh · {error}</p>}
      <Board
        columns={[
          {
            key: "waiting",
            title: "Waiting for you",
            dot: "var(--lab-warn)",
            items: cols.waiting,
            empty: "Nothing waiting",
            cardClassName: "lab-card-hot",
          },
          { key: "accepted", title: "Accepted", dot: "var(--lab-ok)", items: cols.accepted },
          { key: "rejected", title: "Rejected", dot: "var(--lab-bad)", items: cols.rejected },
        ]}
        renderCard={(c) => <ProtocolCardBody card={c} now={now} />}
        onOpen={setOpen}
      />
      {open && <ProtocolModal key={open.id} card={open} onClose={() => setOpen(null)} refreshBoard={refresh} />}
    </>
  );
}

function Version({ n }: { n: number }) {
  return n > 1 ? <span className="lab-faint lab-mono lab-version">v{n}</span> : null;
}

function ProtocolCardBody({ card: c, now }: { card: ProtocolCard; now: Date }) {
  const quote =
    c.status === "waiting"
      ? c.previousNote && `Your note on v${c.version - 1}: "${c.previousNote}"`
      : c.note && `"${c.note}"`;
  return (
    <>
      <span className="lab-card-t">
        {titleOf(c.experiment, c.title)}
        <Version n={c.version} />
      </span>
      {c.excerpt && <span className="lab-card-s">{c.excerpt}</span>}
      {quote && <span className="lab-card-q">{quote}</span>}
      <span className="lab-card-m">
        {c.status === "waiting" ? `Advisor · ${cardDate(c.createdAt, now)}` : cardDate(c.decidedAt ?? c.createdAt, now)}
      </span>
    </>
  );
}

function ProtocolModal({
  card,
  onClose,
  refreshBoard,
}: {
  card: ProtocolCard;
  onClose(): void;
  refreshBoard(): void;
}) {
  const [detail, setDetail] = useState<ProtocolDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await getJson<ProtocolDetail>(`/api/lab/protocols?id=${encodeURIComponent(card.id)}`));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [card.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (verdict: "accepted" | "rejected") => {
    setBusy(true);
    setMessage(null);
    try {
      await postJson(`/api/lab/protocols/${encodeURIComponent(card.id)}/decision`, { verdict, note: note.trim() });
      refreshBoard();
      onClose();
      return;
    } catch (e) {
      if (e instanceof LabRequestError && e.status === 409) {
        setMessage("Already decided — refreshed.");
        refreshBoard();
        void load();
      } else {
        setMessage(e instanceof Error ? e.message : "Something went wrong");
      }
    }
    setBusy(false);
  };

  const p = detail ?? card;
  const revises = detail ? revisesLine(detail.previous) : null;
  const canDecide = note.trim() !== "" && !busy;

  let footer: ReactNode = null;
  if (detail?.status === "waiting") {
    footer = (
      <>
        <NoteBox label="Your note (required)" value={note} onChange={setNote} required />
        <div className="lab-actions">
          <button type="button" className="lab-btn lab-btn-ok" disabled={!canDecide} onClick={() => decide("accepted")}>
            Accept
          </button>
          <button type="button" className="lab-btn lab-btn-bad" disabled={!canDecide} onClick={() => decide("rejected")}>
            Reject
          </button>
          {message && <span className="lab-action-msg" role="status" title={message}>{message}</span>}
        </div>
      </>
    );
  } else if (detail) {
    footer = (
      <>
        {detail.status === "superseded" ? (
          <p className="lab-verdict lab-dim">Replaced by a newer version.</p>
        ) : (
          <>
            <p className={`lab-verdict ${detail.status === "accepted" ? "lab-ok" : "lab-bad"}`}>
              {detail.status === "accepted" ? "Accepted" : "Rejected"}
              {detail.decidedAt && <span className="lab-dim"> · {fullDate(detail.decidedAt)}</span>}
            </p>
            {detail.note && <p className="lab-verdict-note">{detail.note}</p>}
          </>
        )}
        {message && <p className="lab-action-msg" role="status" title={message}>{message}</p>}
      </>
    );
  }

  return (
    <DocModal
      title={
        <>
          {titleOf(p.experiment, p.title)}
          <Version n={p.version} />
        </>
      }
      meta={`From the advisor · ${fullDate(p.createdAt)}`}
      onClose={onClose}
      footer={footer}
    >
      {!detail ? (
        <p className="lab-line">{loadError ? `Couldn't load this protocol · ${loadError}` : "Loading…"}</p>
      ) : (
        <>
          {revises && <p className="lab-revises">{revises}</p>}
          <LabMarkdown source={detail.bodyMd} />
        </>
      )}
    </DocModal>
  );
}
