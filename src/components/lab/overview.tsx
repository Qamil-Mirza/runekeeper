"use client";

import { Fragment, useState } from "react";
import type { ExperimentRow, OverviewDTO, PodRow } from "@/lib/lab/types";
import {
  capMoney,
  clock,
  etaText,
  experimentLabel,
  money,
  nextFigure,
  orderExperiments,
  showsBar,
  spentFigure,
  staleText,
  type Figure,
} from "@/lib/lab/display";
import { useNow, usePolled } from "./use-lab";

const POLL_MS = 30_000;

export function Overview() {
  const { data, error } = usePolled<OverviewDTO>("/api/lab/overview", POLL_MS);
  const now = useNow(15_000);

  if (!data) {
    return <p className="lab-line">{error ? `Couldn't load the overview · ${error}` : "Loading…"}</p>;
  }

  return (
    <>
      <Figures dto={data} now={now} />
      {error && <p className="lab-line lab-note">Couldn&apos;t refresh · {error}</p>}
      {data.experiments.length === 0 ? (
        <p className="lab-line">No experiments yet.</p>
      ) : (
        <ExperimentTable rows={orderExperiments(data.experiments)} now={now} />
      )}
    </>
  );
}

function Figures({ dto, now }: { dto: OverviewDTO; now: Date }) {
  if (dto.runpod === "not_connected") return <p className="lab-line lab-figures-off">RunPod not connected</p>;
  if (dto.runpod === "error") {
    return <p className="lab-line lab-figures-off">RunPod didn&apos;t answer · showing what the agents reported</p>;
  }

  const figures: [string, Figure][] = [
    ["Pods running", { value: String(dto.podsRunning ?? 0), sub: dto.podsRunningLabel }],
    ["Spent today", dto.spent ? spentFigure(dto.spent) : { value: "—", sub: "since 12:00 AM PT" }],
    ["Next pod finishes", nextFigure(dto, now)],
  ];
  return (
    <div className="lab-stats">
      {figures.map(([label, f]) => (
        <div className="lab-stat" key={label}>
          <div className="lab-stat-k">{label}</div>
          <div className={f.quiet ? "lab-stat-v lab-stat-quiet" : "lab-stat-v lab-num"}>{f.value}</div>
          <div className="lab-stat-s">{f.sub || "\u00a0"}</div>
        </div>
      ))}
    </div>
  );
}

function ExperimentTable({ rows, now }: { rows: ExperimentRow[]; now: Date }) {
  // The user's own toggles; anything untouched follows the server's default.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [podOpen, setPodOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="lab-table-wrap">
      <table className="lab-table">
        <thead>
          <tr>
            <th scope="col">Experiment</th>
            <th scope="col">Progress</th>
            <th scope="col">ETA</th>
            <th scope="col" className="lab-right">
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const expanded = open[e.id] ?? e.expanded;
            const toggle = () => setOpen((o) => ({ ...o, [e.id]: !expanded }));
            return (
              <Fragment key={e.id}>
                <tr className="lab-exp" onClick={toggle}>
                  <td>
                    <button type="button" className="lab-row-btn" aria-expanded={expanded}>
                      <span className="lab-chev" aria-hidden="true">
                        {expanded ? "▾" : "▸"}
                      </span>
                      {experimentLabel(e)}
                    </button>
                  </td>
                  <td>
                    {showsBar(e) ? <Bar pct={e.progressPct ?? 0} /> : <span className="lab-dim">{e.summary}</span>}
                  </td>
                  <td>
                    <Eta iso={e.eta} now={now} />
                  </td>
                  <td className="lab-right lab-num">{e.cost === null ? "—" : money(e.cost)}</td>
                </tr>
                {expanded &&
                  e.pods.map((p) => {
                    const key = `${e.id}:${p.runId ?? p.podId}`;
                    return (
                      <PodRows
                        key={key}
                        pod={p}
                        now={now}
                        open={!!podOpen[key]}
                        onToggle={() => setPodOpen((o) => ({ ...o, [key]: !o[key] }))}
                      />
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PodRows({ pod: p, now, open, onToggle }: { pod: PodRow; now: Date; open: boolean; onToggle(): void }) {
  return (
    <>
      <tr className="lab-pod" onClick={onToggle}>
        <td>
          <button type="button" className="lab-row-btn" aria-expanded={open}>
            {p.stage}
            {p.setupId && <span className="lab-setup lab-faint lab-mono"> {p.setupId}</span>}
          </button>
        </td>
        <td>
          <PodStatus pod={p} now={now} />
        </td>
        <td>
          <Eta iso={p.status === "running" ? p.eta : null} now={now} />
        </td>
        <td className="lab-right lab-num lab-nowrap">
          {p.cost === null ? "—" : money(p.cost)}
          {p.capUsd !== null && <span className="lab-faint"> / {capMoney(p.capUsd)}</span>}
        </td>
      </tr>
      {open && (
        <tr className="lab-pod-detail">
          <td colSpan={4}>
            <span className="lab-mono">pod {p.podId}</span>
            {p.endedAt && <span> · ended {clock(p.endedAt, now)}</span>}
            {p.endNote && <span className="lab-end-note"> · {p.endNote}</span>}
          </td>
        </tr>
      )}
    </>
  );
}

function PodStatus({ pod: p, now }: { pod: PodRow; now: Date }) {
  const at = p.endedAt ? ` ${clock(p.endedAt, now)}` : "";
  switch (p.status) {
    case "running":
      return (
        <>
          {p.progressPct !== null ? <Bar pct={p.progressPct} /> : <span className="lab-accent">Running</span>}
          {p.staleMinutes !== null && <span className="lab-dim lab-stale">{staleText(p.staleMinutes)}</span>}
        </>
      );
    case "done":
      return <span className="lab-ok">Done</span>;
    case "failed":
      return <span className="lab-bad">Failed{at}</span>;
    case "stopped":
      return <span className="lab-dim">Stopped{at}</span>;
    case "pod_gone":
      return <span className="lab-warn">Pod gone</span>;
    case "unassigned":
      return <span className="lab-dim">No run reported</span>;
  }
}

function Bar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="lab-progress">
      <span className="lab-bar" aria-hidden="true">
        <i style={{ width: `${clamped}%` }} />
      </span>
      <span className="lab-num">{Math.round(clamped)}%</span>
    </span>
  );
}

function Eta({ iso, now }: { iso: string | null; now: Date }) {
  if (!iso) return <span className="lab-faint">—</span>;
  const { text, overdue } = etaText(iso, now);
  return overdue ? (
    <span className="lab-warn" title={`was due ${clock(iso, now)}`}>
      {text}
    </span>
  ) : (
    <span className="lab-num">{text}</span>
  );
}
