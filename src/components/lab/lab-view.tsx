"use client";

import { useState } from "react";
import type { ProtocolCard, ReportCard } from "@/lib/lab/types";
import { usePolled } from "./use-lab";
import { Overview } from "./overview";
import { ProtocolsBoard } from "./protocols-board";
import { ReportsBoard } from "./reports-board";
import "./lab.css";

type TabId = "overview" | "protocols" | "reports";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "protocols", label: "Protocols" },
  { id: "reports", label: "Reports" },
];

const TAB_KEY = "lab.tab";
const BOARD_POLL_MS = 60_000;

function isTab(value: unknown): value is TabId {
  return TABS.some((t) => t.id === value);
}

function savedTab(): TabId {
  if (typeof window === "undefined") return "overview";
  try {
    const value = window.localStorage.getItem(TAB_KEY);
    return isTab(value) ? value : "overview";
  } catch {
    return "overview";
  }
}

export function LabView() {
  // Only mounted on the client, after the owner check, so storage is readable here.
  const [tab, setTab] = useState<TabId>(savedTab);

  const choose = (next: TabId) => {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      // Storage unavailable: the tab just isn't remembered.
    }
  };

  // One poll per board, shared by the tab counts and the boards themselves.
  const protocols = usePolled<{ cards: ProtocolCard[] }>("/api/lab/protocols", BOARD_POLL_MS);
  const reports = usePolled<{ cards: ReportCard[] }>("/api/lab/reports", BOARD_POLL_MS);
  const counts: Record<TabId, { n: number; tone: string } | null> = {
    overview: null,
    protocols: count(protocols.data?.cards.filter((c) => c.status === "waiting").length, "warn"),
    reports: count(reports.data?.cards.filter((c) => !c.read).length, "accent"),
  };

  return (
    <div className="lab-root">
      <div className="lab-page">
        <div className="lab-tabs" role="tablist" aria-label="Lab">
          {TABS.map((t) => {
            const c = counts[t.id];
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`lab-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="lab-panel"
                className="lab-tab"
                onClick={() => choose(t.id)}
              >
                {t.label}
                {c && (
                  <>
                    <span className={`lab-count lab-count-${c.tone}`} aria-hidden="true">
                      {c.n}
                    </span>
                    <span className="sr-only">, {c.n} {t.id === "protocols" ? "waiting" : "unread"}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div id="lab-panel" role="tabpanel" aria-labelledby={`lab-tab-${tab}`}>
          {tab === "overview" && <Overview />}
          {tab === "protocols" && <ProtocolsBoard {...protocols} />}
          {tab === "reports" && <ReportsBoard {...reports} />}
        </div>
      </div>
    </div>
  );
}

function count(n: number | undefined, tone: string): { n: number; tone: string } | null {
  return n ? { n, tone } : null;
}
