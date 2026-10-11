"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type {
  AgentAction,
  LabAction,
  LabConnectionStatus,
  LabJob,
  LabSnapshot,
  LabSummary,
  LabTranscriptItem,
} from "@/lib/lab/types";

const STATUS_POLL_MS = 10_000;
const LABS_POLL_MS = 15_000;
const SNAPSHOT_POLL_MS = 3_000;
const JOBS_POLL_MS = 6_000;

export interface LabFailure {
  code: string;
  message: string;
}

function toFailure(err: unknown): LabFailure {
  if (err instanceof LabApiError) return { code: err.code, message: err.message };
  return { code: "internal_error", message: "Unexpected error" };
}

/** Runs `fn` now and every `ms`, skipping ticks while the tab is hidden. */
function usePolling(fn: () => void, ms: number, enabled: boolean) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    fnRef.current();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fnRef.current();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") fnRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms, enabled]);
}

/**
 * Whether the Lab exists for the signed-in user. `undefined` while loading,
 * `false` for everyone who is not a configured owner.
 */
export function useLabAccess(): boolean | undefined {
  const [access, setAccess] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    labApi
      .fetchLabStatus()
      .then((status) => !cancelled && setAccess(status !== null))
      // Runekeeper itself failed to answer: do not advertise the Lab.
      .catch(() => !cancelled && setAccess(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return access;
}

export function useLab() {
  const [status, setStatus] = useState<LabConnectionStatus | null>(null);
  const [statusFailure, setStatusFailure] = useState<LabFailure | null>(null);

  const [labs, setLabs] = useState<LabSummary[] | null>(null);
  const [labsFailure, setLabsFailure] = useState<LabFailure | null>(null);

  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LabSnapshot | null>(null);
  const [snapshotFailure, setSnapshotFailure] = useState<LabFailure | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null);

  const [labJobs, setLabJobs] = useState<LabJob[] | null>(null);

  // Keyed by agent id, or "lab" for lab-level actions.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [actionFailures, setActionFailures] = useState<Record<string, LabFailure>>({});

  // Latest system note per agent: the manager's own record of what it did
  // (e.g. the provisioning preflight), shown as evidence instead of inferred.
  const [systemNotes, setSystemNotes] = useState<Record<string, LabTranscriptItem>>({});
  const noteKeys = useRef<Record<string, string>>({});

  const selectedRef = useRef(selectedLabId);
  selectedRef.current = selectedLabId;

  const connected = status?.reachable === true && status.apiCompatible;

  const refreshStatus = useCallback(async () => {
    try {
      const next = await labApi.fetchLabStatus();
      setStatus(next);
      setStatusFailure(null);
    } catch (err) {
      // Runekeeper's own route failed; keep the last known status on screen.
      setStatusFailure(toFailure(err));
    }
  }, []);

  const refreshLabs = useCallback(async () => {
    try {
      const items = await labApi.fetchLabs();
      setLabs(items);
      setLabsFailure(null);
      setSelectedLabId((current) =>
        current && items.some((l) => l.id === current)
          ? current
          : (items[0]?.id ?? null)
      );
    } catch (err) {
      setLabsFailure(toFailure(err));
    }
  }, []);

  const refreshSnapshot = useCallback(async () => {
    const labId = selectedRef.current;
    if (!labId) return;
    try {
      const next = await labApi.fetchLabSnapshot(labId);
      if (selectedRef.current !== labId) return;
      setSnapshot(next);
      setSnapshotAt(Date.now());
      setSnapshotFailure(null);
    } catch (err) {
      if (selectedRef.current !== labId) return;
      // Keep the last snapshot visible; the view marks it stale.
      setSnapshotFailure(toFailure(err));
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    const labId = selectedRef.current;
    if (!labId) return;
    try {
      const page = await labApi.fetchLabJobs(labId);
      if (selectedRef.current === labId) setLabJobs(page.items);
    } catch {
      // The work queue is a convenience; the snapshot carries the failure.
    }
  }, []);

  usePolling(refreshStatus, STATUS_POLL_MS, true);
  usePolling(refreshJobs, JOBS_POLL_MS, connected && selectedLabId !== null);
  usePolling(refreshLabs, LABS_POLL_MS, connected);
  usePolling(refreshSnapshot, SNAPSHOT_POLL_MS, connected && selectedLabId !== null);

  // Load a newly selected lab right away instead of waiting for the next tick.
  useEffect(() => {
    if (connected && selectedLabId) void refreshSnapshot();
  }, [connected, selectedLabId, refreshSnapshot]);

  // Refetch an agent's transcript tail only when the agent visibly changed.
  useEffect(() => {
    if (!snapshot) return;
    for (const agent of snapshot.agents) {
      const key = `${agent.state}|${agent.lastActivityAt ?? ""}|${agent.sessionId ?? ""}`;
      if (!agent.sessionId || noteKeys.current[agent.id] === key) continue;
      noteKeys.current[agent.id] = key;
      labApi
        .fetchAgentTranscript(agent.id, { limit: 20 })
        .then(({ items }) => {
          const note = [...items].reverse().find((i) => i.kind === "systemNote");
          if (note) setSystemNotes((n) => ({ ...n, [agent.id]: note }));
        })
        .catch(() => {
          // Best effort; let the next change retry.
          delete noteKeys.current[agent.id];
        });
    }
  }, [snapshot]);

  const selectLab = useCallback((labId: string) => {
    setSelectedLabId(labId);
    setLabJobs(null);
    setSnapshot(null);
    setSnapshotAt(null);
    setSnapshotFailure(null);
    setActionFailures({});
  }, []);

  const runAction = useCallback(
    async (key: string, label: string, action: () => Promise<unknown>) => {
      setPending((p) => ({ ...p, [key]: label }));
      setActionFailures((f) => {
        const { [key]: _cleared, ...rest } = f;
        return rest;
      });
      try {
        await action();
      } catch (err) {
        setActionFailures((f) => ({ ...f, [key]: toFailure(err) }));
        if (err instanceof LabApiError && err.unreachable) void refreshStatus();
      } finally {
        setPending((p) => {
          const { [key]: _done, ...rest } = p;
          return rest;
        });
        // The call only reports "accepted"; the confirmed state is whatever
        // the manager says next.
        void refreshSnapshot();
        void refreshLabs();
        void refreshJobs();
      }
    },
    [refreshJobs, refreshLabs, refreshSnapshot, refreshStatus]
  );

  const createLab = useCallback(
    (name: string) =>
      runAction("create", "Creating", async () => {
        const created = await labApi.createLab({ name });
        setSelectedLabId(created.lab.id);
        setSnapshot(created);
        setSnapshotAt(Date.now());
      }),
    [runAction]
  );

  /** Resolves true when the lab was deleted. */
  const deleteLab = useCallback(
    async (confirmName: string) => {
      const labId = selectedRef.current;
      if (!labId) return false;
      let deleted = false;
      await runAction("delete", "Deleting", async () => {
        await labApi.deleteLab(labId, confirmName);
        deleted = true;
        if (selectedRef.current !== labId) return;
        setLabs((items) => items?.filter((l) => l.id !== labId) ?? items);
        setSelectedLabId(null);
        setSnapshot(null);
        setSnapshotAt(null);
        setLabJobs(null);
      });
      return deleted;
    },
    [runAction]
  );

  const labAction = useCallback(
    (action: LabAction) => {
      const labId = selectedRef.current;
      if (!labId) return Promise.resolve();
      return runAction("lab", action, () => labApi.runLabAction(labId, action));
    },
    [runAction]
  );

  const agentAction = useCallback(
    (agentId: string, action: AgentAction) =>
      runAction(agentId, action, async () => {
        const agent = await labApi.runAgentAction(agentId, action);
        setSnapshot((s) =>
          s ? { ...s, agents: s.agents.map((a) => (a.id === agent.id ? agent : a)) } : s
        );
      }),
    [runAction]
  );

  const setRuntimeLimit = useCallback(
    (wallClockMinutes: number) => {
      const labId = selectedRef.current;
      if (!labId) return Promise.resolve();
      return runAction("runtime", "Saving", async () => {
        const budget = await labApi.setRuntimeLimit(labId, wallClockMinutes);
        setSnapshot((s) => (s && s.lab.id === labId ? { ...s, budget } : s));
      });
    },
    [runAction]
  );

  /** Resolves true when the goals were saved. */
  const saveGoals = useCallback(
    async (goals: { objective: string; priorities: string[] }) => {
      const labId = selectedRef.current;
      if (!labId) return false;
      let saved = false;
      await runAction("goals", "Saving", async () => {
        const lab = await labApi.updateLabGoals(labId, goals);
        setSnapshot((s) => (s && s.lab.id === labId ? { ...s, lab: { ...s.lab, ...lab } } : s));
        saved = true;
      });
      return saved;
    },
    [runAction]
  );

  return {
    status,
    statusFailure,
    connected,
    labs,
    labsFailure,
    selectedLabId,
    selectLab,
    snapshot,
    snapshotFailure,
    snapshotAt,
    pending,
    actionFailures,
    systemNotes,
    createLab,
    deleteLab,
    labAction,
    agentAction,
    setRuntimeLimit,
    labJobs,
    saveGoals,
    retry: useCallback(() => {
      void refreshStatus();
      void refreshLabs();
      void refreshSnapshot();
    }, [refreshLabs, refreshSnapshot, refreshStatus]),
  };
}
