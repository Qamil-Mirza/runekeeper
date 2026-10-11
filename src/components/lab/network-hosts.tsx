"use client";

import { useCallback, useEffect, useState } from "react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabNetworkHost, LabNetworkHosts, NetworkHostAction } from "@/lib/lab/types";
import { ROLE_LABELS, formatAgo } from "./agent-card";
import { Chip, LabButton, Strip } from "./lab-ui";

const POLL_MS = 10_000;

function firstUse(host: LabNetworkHost, listed: boolean): string {
  const role = host.firstUse.role;
  if (!role) return listed ? "set on the host" : host.decidedBy ? "added by hand" : "first use not recorded";
  return `first used by the ${ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}`;
}

/**
 * The internet hosts that commands run by agents have reached. Host-wide,
 * not per lab. Blocking takes effect at once and is the owner's brake on
 * where commands can send data; allowing a host again asks for a second click.
 */
export function NetworkHosts({ now, disabled }: { now: number; disabled: boolean }) {
  const [data, setData] = useState<LabNetworkHosts | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmTrust, setConfirmTrust] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await labApi.fetchNetworkHosts());
      setFailure(null);
    } catch (err) {
      setFailure(err instanceof LabApiError ? err.message : "Unexpected error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = async (host: string, action: NetworkHostAction) => {
    setPending(host);
    setConfirmTrust(null);
    try {
      await labApi.setNetworkHost(host, action);
      setFailure(null);
    } catch (err) {
      setFailure(err instanceof LabApiError ? err.message : "Unexpected error");
    } finally {
      setPending(null);
      void refresh();
    }
  };

  if (!data) {
    return failure ? (
      <Strip tone="bad" role="alert">
        Could not load the hosts: {failure}
      </Strip>
    ) : (
      <p className="text-[13.5px] text-[var(--lab-dim)]">Loading…</p>
    );
  }

  const recorded = new Set(data.items.map((i) => i.host));
  const listedOnly = data.listed.filter((h) => !recorded.has(h));

  return (
    <>
      <p className="text-[12.5px] text-[var(--lab-dim)]">
        {data.mode === "trustOnFirstUse"
          ? "A command may reach a new site the first time it asks; the site is recorded here and you can block it."
          : "Commands reach only the sites set on the host. Nothing else is allowed."}{" "}
        This covers commands only, not an agent's web search or web fetch, and applies to every lab.
      </p>

      {data.items.length === 0 && listedOnly.length === 0 && (
        <p className="text-[13.5px]">No command has reached the internet yet.</p>
      )}

      {(data.items.length > 0 || listedOnly.length > 0) && (
        <ul className="flex flex-col divide-y divide-[var(--lab-line)]">
          {data.items.map((item) => {
            const blocked = item.status === "blocked";
            const confirming = confirmTrust === item.host;
            return (
              <li key={item.host} className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <p className="lab-mono text-[13px] break-all">{item.host}</p>
                  <p className="text-[12px] text-[var(--lab-dim)]">
                    {firstUse(item, data.listed.includes(item.host))} · {item.uses} use{item.uses === 1 ? "" : "s"}
                    {item.lastUsedAt && ` · last ${formatAgo(item.lastUsedAt, now)}`}
                    {item.decidedBy && item.decidedAt &&
                      ` · ${blocked ? "blocked" : "allowed"} by you ${formatAgo(item.decidedAt, now)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={blocked ? "bad" : "ok"}>{blocked ? "Blocked" : "Allowed"}</Chip>
                  {blocked ? (
                    <>
                      <LabButton
                        className="!min-h-[28px] !px-2"
                        disabled={disabled || pending !== null}
                        onClick={() => (confirming ? void act(item.host, "trust") : setConfirmTrust(item.host))}
                      >
                        {pending === item.host ? "Saving…" : confirming ? "Confirm allow" : "Allow again"}
                      </LabButton>
                      {confirming && (
                        <LabButton variant="quiet" className="!min-h-[28px] !px-2" onClick={() => setConfirmTrust(null)}>
                          Cancel
                        </LabButton>
                      )}
                    </>
                  ) : (
                    <LabButton
                      variant="danger"
                      className="!min-h-[28px] !px-2"
                      disabled={disabled || pending !== null}
                      onClick={() => void act(item.host, "block")}
                    >
                      {pending === item.host ? "Blocking…" : "Block"}
                    </LabButton>
                  )}
                </div>
              </li>
            );
          })}
          {listedOnly.map((host) => (
            <li key={host} className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <p className="lab-mono text-[13px] break-all">{host}</p>
                <p className="text-[12px] text-[var(--lab-dim)]">set on the host · not used yet</p>
              </div>
              <div className="flex items-center gap-2">
                <Chip tone="ok">Allowed</Chip>
                <LabButton
                  variant="danger"
                  className="!min-h-[28px] !px-2"
                  disabled={disabled || pending !== null}
                  onClick={() => void act(host, "block")}
                >
                  {pending === host ? "Blocking…" : "Block"}
                </LabButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {failure && (
        <Strip tone="bad" role="alert">
          {failure}
        </Strip>
      )}
    </>
  );
}
