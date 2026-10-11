"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabAgent, LabJob, LabTranscriptItem } from "@/lib/lab/types";
import type { LabFailure } from "./use-lab";

const ACTIVE_POLL_MS = 2_000;
const QUIET_POLL_MS = 6_000;
const PAGE = 50;

function toFailure(err: unknown): LabFailure {
  if (err instanceof LabApiError) return { code: err.code, message: err.message };
  return { code: "internal_error", message: "Unexpected error" };
}

const isActive = (state: LabAgent["state"]) =>
  state === "starting" || state === "working" || state === "waitingOnHuman";

/** Job states in which the work can still be cancelled. */
export const CANCELLABLE: ReadonlySet<LabJob["status"]> = new Set(["queued", "awaitingApproval", "running"]);

/**
 * One agent's conversation and tasks. Everything shown comes from the Lab
 * Manager's durable records; nothing is kept only in the browser, so a
 * reload shows the same history.
 */
export function useAgentConsole(labId: string, agent: LabAgent, enabled: boolean) {
  const agentId = agent.id;
  const [items, setItems] = useState<LabTranscriptItem[]>([]);
  /** Cursor for the page before the oldest loaded item; null when there is none. */
  const [earlier, setEarlier] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [transcriptFailure, setTranscriptFailure] = useState<LabFailure | null>(null);

  const [jobs, setJobs] = useState<LabJob[] | null>(null);
  const [jobsFailure, setJobsFailure] = useState<LabFailure | null>(null);

  const [sending, setSending] = useState(false);
  const [sendFailure, setSendFailure] = useState<LabFailure | null>(null);
  const [cancelling, setCancelling] = useState<Record<string, true>>({});
  const [cancelFailures, setCancelFailures] = useState<Record<string, LabFailure>>({});

  const agentRef = useRef(agentId);
  agentRef.current = agentId;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    itemsRef.current = [];
    setItems([]);
    setEarlier(null);
    setLoaded(false);
    setTranscriptFailure(null);
    setJobs(null);
    setJobsFailure(null);
    setSendFailure(null);
    setCancelling({});
    setCancelFailures({});
  }, [agentId]);

  const refresh = useCallback(async () => {
    const id = agentRef.current;
    // The newest page is refetched whole: a tool call's status and output
    // change after the item first appears.
    const transcript = labApi.fetchAgentTranscript(id, { limit: PAGE }).then(
      (page) => {
        if (agentRef.current !== id) return;
        const current = itemsRef.current;
        const overlaps = current.length === 0 || page.items.some((n) => current.some((c) => c.id === n.id));
        if (current.length === 0 || !overlaps) {
          // First load, or more arrived than one page holds: start from the newest.
          setEarlier(page.nextCursor);
          setItems(page.items);
        } else {
          const fresh = new Map(page.items.map((i) => [i.id, i]));
          const known = new Set(current.map((c) => c.id));
          setItems(
            [...current.map((c) => fresh.get(c.id) ?? c), ...page.items.filter((i) => !known.has(i.id))].sort(
              (x, y) => x.seq - y.seq
            )
          );
        }
        setLoaded(true);
        setTranscriptFailure(null);
      },
      (err) => agentRef.current === id && setTranscriptFailure(toFailure(err))
    );
    const jobList = labApi.fetchAgentJobs(labId, id).then(
      (page) => {
        if (agentRef.current !== id) return;
        setJobs(page.items);
        setJobsFailure(null);
      },
      (err) => agentRef.current === id && setJobsFailure(toFailure(err))
    );
    await Promise.all([transcript, jobList]);
  }, [labId]);

  const active = isActive(agent.state) || sending;
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = setInterval(
      () => document.visibilityState === "visible" && void refresh(),
      active ? ACTIVE_POLL_MS : QUIET_POLL_MS
    );
    return () => clearInterval(timer);
  }, [enabled, active, agentId, refresh]);

  // Catch the final output as soon as the agent's state changes.
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, agent.state, agent.lastActivityAt, refresh]);

  const loadEarlier = useCallback(async () => {
    const id = agentRef.current;
    if (!earlier || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await labApi.fetchAgentTranscript(id, { before: earlier, limit: PAGE });
      if (agentRef.current !== id) return;
      setItems((current) => {
        const known = new Set(current.map((c) => c.id));
        return [...page.items.filter((i) => !known.has(i.id)), ...current].sort((a, b) => a.seq - b.seq);
      });
      setEarlier(page.nextCursor);
    } catch (err) {
      if (agentRef.current === id) setTranscriptFailure(toFailure(err));
    } finally {
      setLoadingEarlier(false);
    }
  }, [earlier, loadingEarlier]);

  /** Resolves true when the Lab Manager accepted the instruction. */
  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const id = agentRef.current;
      setSending(true);
      setSendFailure(null);
      try {
        await labApi.sendAgentMessage(id, text);
        return true;
      } catch (err) {
        if (agentRef.current === id) setSendFailure(toFailure(err));
        return false;
      } finally {
        setSending(false);
        void refresh();
      }
    },
    [refresh]
  );

  const cancel = useCallback(
    async (jobId: string) => {
      setCancelling((c) => ({ ...c, [jobId]: true }));
      setCancelFailures(({ [jobId]: _cleared, ...rest }) => rest);
      try {
        await labApi.cancelJob(jobId);
      } catch (err) {
        setCancelFailures((f) => ({ ...f, [jobId]: toFailure(err) }));
      } finally {
        setCancelling(({ [jobId]: _done, ...rest }) => rest);
        void refresh();
      }
    },
    [refresh]
  );

  return {
    items,
    loaded,
    hasEarlier: earlier !== null,
    loadingEarlier,
    loadEarlier,
    transcriptFailure,
    jobs,
    jobsFailure,
    sending,
    sendFailure,
    send,
    cancelling,
    cancelFailures,
    cancel,
  };
}
