"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import * as api from "@/lib/api-client";
import { usePlanner } from "@/context/planner-context";

interface GradescopeConfigPanelProps {
  config: api.GradescopeIntegrationConfig | null;
  onClose: () => void;
  onUpdate: (config: api.GradescopeIntegrationConfig) => void;
}

export function GradescopeConfigPanel({
  config,
  onClose,
  onUpdate,
}: GradescopeConfigPanelProps) {
  const { refreshData } = usePlanner();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<api.GradescopeSyncResult | null>(
    null
  );
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showUpdateCredentials, setShowUpdateCredentials] = useState(false);

  const isConnected = config?.enabled && config?.config?.hasCredentials;

  async function handleConnect() {
    if (!email.trim() || !password.trim()) {
      setConnectError("Both email and password are required");
      return;
    }
    setIsConnecting(true);
    setConnectError("");
    try {
      const updated = await api.updateGradescopeIntegration({
        gradescopeEmail: email.trim(),
        gradescopePassword: password.trim(),
        enabled: true,
      });
      onUpdate(updated);
      setEmail("");
      setPassword("");
      setShowUpdateCredentials(false);
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect"
      );
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncGradescope();
      setSyncResult(result);
      const updated = await api.fetchGradescopeIntegration();
      onUpdate(updated);
      refreshData();
    } catch {
      setSyncResult({
        processed: 0,
        tasksCreated: 0,
        errors: ["Sync failed"],
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      const updated = await api.updateGradescopeIntegration({
        enabled: false,
      });
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
          Gradescope Integration
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
      {(!isConnected || showUpdateCredentials) && (
        <div className="space-y-3 mb-4">
          {!isConnected && (
            <p className="text-body-sm text-on-surface-variant">
              Connect Gradescope to import assignments as tasks.
            </p>
          )}

          <div>
            <label className="block text-label-sm font-label text-on-surface-variant mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setConnectError("");
              }}
              placeholder="your@email.com"
              className="w-full px-2 py-1.5 rounded bg-[rgba(0,0,0,0.3)] border border-[rgba(212,168,96,0.2)] text-on-surface text-body-sm placeholder:text-[#555] focus:outline-none focus:border-[#d4a860]"
            />
          </div>

          <div>
            <label className="block text-label-sm font-label text-on-surface-variant mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setConnectError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              placeholder="Your Gradescope password"
              className="w-full px-2 py-1.5 rounded bg-[rgba(0,0,0,0.3)] border border-[rgba(212,168,96,0.2)] text-on-surface text-body-sm placeholder:text-[#555] focus:outline-none focus:border-[#d4a860]"
            />
            <p className="text-[10px] text-[#666] mt-1">
              Your password is encrypted at rest and only used during sync.
            </p>
          </div>

          {connectError && (
            <p className="text-[11px] text-[#ea4335]">{connectError}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full py-2 px-3 rounded bg-[rgba(212,168,96,0.15)] text-[#d4a860] font-label text-label-md hover:bg-[rgba(212,168,96,0.25)] transition-colors disabled:opacity-50"
          >
            {isConnecting
              ? "Connecting..."
              : showUpdateCredentials
                ? "Update Credentials"
                : "Connect Gradescope"}
          </button>

          {showUpdateCredentials && (
            <button
              onClick={() => setShowUpdateCredentials(false)}
              className="w-full py-1.5 px-3 rounded text-[rgba(212,168,96,0.5)] font-label text-label-sm hover:text-[#d4a860] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Connected state */}
      {isConnected && !showUpdateCredentials && (
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
              onClick={() => setShowUpdateCredentials(true)}
              className="w-full py-1.5 px-3 rounded bg-[rgba(212,168,96,0.08)] text-[rgba(212,168,96,0.7)] font-label text-label-sm hover:bg-[rgba(212,168,96,0.15)] hover:text-[#d4a860] transition-colors"
            >
              Update Credentials
            </button>
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
