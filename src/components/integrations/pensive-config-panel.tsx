"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import * as api from "@/lib/api-client";
import { usePlanner } from "@/context/planner-context";

interface PensiveConfigPanelProps {
  config: api.PensiveIntegrationConfig | null;
  onClose: () => void;
  onUpdate: (config: api.PensiveIntegrationConfig) => void;
}

export function PensiveConfigPanel({
  config,
  onClose,
  onUpdate,
}: PensiveConfigPanelProps) {
  const { refreshData } = usePlanner();
  const [authRecord, setAuthRecord] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<api.PensiveSyncResult | null>(
    null
  );
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const isConnected = config?.enabled && config?.config?.connected;

  async function handleConnect() {
    if (!authRecord.trim()) {
      setConnectError("Paste your Pensive auth record first");
      return;
    }
    setIsConnecting(true);
    setConnectError("");
    try {
      const updated = await api.connectPensive(authRecord.trim());
      onUpdate(updated);
      setAuthRecord("");
      await handleSync(); // import assignments right away
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncPensive();
      setSyncResult(result);
      refreshData();
    } catch {
      setSyncResult({
        processed: 0,
        tasksCreated: 0,
        errors: ["Sync failed"],
      });
    } finally {
      // Always pick up server-side state (e.g. session expired -> disabled)
      try {
        const updated = await api.fetchPensiveIntegration();
        onUpdate(updated);
      } catch {
        // ignore refresh failure
      }
      setIsSyncing(false);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      const updated = await api.disconnectPensive();
      onUpdate(updated);
    } catch {
      // ignore
    } finally {
      setIsDisconnecting(false);
    }
  }

  function relativeTime(dateStr: string | null) {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <motion.div
      className="w-full sm:w-[320px] max-h-[500px] overflow-y-auto bg-[#2c1810] border border-[rgba(212,168,96,0.2)] rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] p-4 archivist-scroll"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-headline-sm text-[#d4a860]">
          Pensive Integration
        </h3>
        <button
          onClick={onClose}
          className="text-[rgba(212,168,96,0.4)] hover:text-[#d4a860] transition-colors p-1"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className={`w-2 h-2 rounded-full ${
            isConnected ? "bg-[#6bcb6b]" : "bg-[#d4a860]"
          }`}
        />
        <span className="text-label-sm font-label text-on-surface-variant">
          {isConnected ? "Connected" : "Not Connected"}
        </span>
        {config?.lastSyncAt && (
          <span className="text-[11px] text-[#666] ml-auto">
            Last sync: {relativeTime(config.lastSyncAt)}
          </span>
        )}
      </div>

      {/* Setup form */}
      {!isConnected && (
        <>
          {config?.lastSyncError && (
            <div className="mb-4 px-2 py-1.5 rounded bg-[rgba(234,67,53,0.1)] border border-[rgba(234,67,53,0.2)] text-[11px] text-[#ea4335]">
              {config.lastSyncError}
            </div>
          )}
          <div className="space-y-3 mb-4">
            <p className="text-body-sm text-on-surface-variant">
              Connect Pensive to import assignments as tasks.
            </p>
            <ol className="list-decimal pl-4 space-y-1 text-[11px] text-on-surface-variant">
              <li>Open pensive.com while signed in, then open DevTools (⌥⌘I).</li>
              <li>Application → IndexedDB → firebaseLocalStorageDb → firebaseLocalStorage.</li>
              <li>Select the <code>firebase:authUser:…</code> row, right-click its value → Copy object.</li>
              <li>Paste it below.</li>
            </ol>
            <textarea
              value={authRecord}
              onChange={(e) => {
                setAuthRecord(e.target.value);
                setConnectError("");
              }}
              rows={4}
              spellCheck={false}
              placeholder='{"uid":"…","stsTokenManager":{…},"apiKey":"…"}'
              className="w-full px-2 py-1.5 rounded bg-[rgba(0,0,0,0.3)] border border-[rgba(212,168,96,0.2)] text-on-surface text-[11px] font-mono placeholder:text-[#555] focus:outline-none focus:border-[#d4a860] resize-none"
            />
            <p className="text-[10px] text-[#666]">
              Only your Pensive user ID and session refresh token are kept, encrypted at rest.
            </p>
            {connectError && <p className="text-[11px] text-[#ea4335]">{connectError}</p>}
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full py-2 px-3 rounded bg-[rgba(212,168,96,0.15)] text-[#d4a860] font-label text-label-md hover:bg-[rgba(212,168,96,0.25)] transition-colors disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Connect Pensive"}
            </button>
          </div>
        </>
      )}

      {/* Connected state */}
      {isConnected && (
        <>
          {/* Error display */}
          {config?.lastSyncError && (
            <div className="mb-4 px-2 py-1.5 rounded bg-[rgba(234,67,53,0.1)] border border-[rgba(234,67,53,0.2)] text-[11px] text-[#ea4335]">
              {config.lastSyncError}
            </div>
          )}

          {/* Sync button */}
          <div className="mb-4">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full py-2 px-3 rounded bg-[rgba(212,168,96,0.15)] text-[#d4a860] font-label text-label-md hover:bg-[rgba(212,168,96,0.25)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSyncing ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="32"
                      strokeLinecap="round"
                    />
                  </svg>
                  Syncing...
                </>
              ) : (
                "Sync Assignments"
              )}
            </button>
            {syncResult && (
              <p
                className={`text-[11px] mt-1 text-center ${
                  syncResult.errors.length > 0
                    ? "text-[#d4a860]"
                    : "text-[#6bcb6b]"
                }`}
              >
                {syncResult.tasksCreated > 0
                  ? `Created ${syncResult.tasksCreated} task${syncResult.tasksCreated !== 1 ? "s" : ""} from ${syncResult.processed} assignment${syncResult.processed !== 1 ? "s" : ""}`
                  : syncResult.processed > 0
                    ? "All assignments already imported"
                    : "No upcoming assignments found"}
                {syncResult.errors.length > 0 &&
                  ` (${syncResult.errors.length} error${syncResult.errors.length !== 1 ? "s" : ""})`}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="w-full py-1.5 px-3 rounded text-[rgba(234,67,53,0.6)] font-label text-label-sm hover:text-[#ea4335] hover:bg-[rgba(234,67,53,0.08)] transition-colors disabled:opacity-50"
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
