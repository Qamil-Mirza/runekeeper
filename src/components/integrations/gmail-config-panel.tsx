"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import * as api from "@/lib/api-client";
import type { IntegrationConfig } from "./integration-types";

interface GmailConfigPanelProps {
  config: IntegrationConfig | null;
  onClose: () => void;
  onUpdate: (config: IntegrationConfig) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function GmailConfigPanel({
  config,
  onClose,
  onUpdate,
}: GmailConfigPanelProps) {
  const [newSender, setNewSender] = useState("");
  const [senderError, setSenderError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    processed: number;
    tasksCreated: number;
  } | null>(null);
  const [history, setHistory] = useState<api.ProcessedEmail[]>([]);
  const [isEnabling, setIsEnabling] = useState(false);

  // Load history on mount
  useEffect(() => {
    if (config?.enabled) {
      api.fetchGmailHistory().then(setHistory).catch(() => {});
    }
  }, [config?.enabled]);

  const monitoredSenders = config?.config?.monitoredSenders ?? [];

  async function handleEnable() {
    setIsEnabling(true);
    try {
      const result = await api.updateGmailIntegration({ enabled: true });
      if (result.requiresReauth) {
        // Redirect to re-auth
        window.location.href = "/api/auth/signin/google";
        return;
      }
      const updated = await api.fetchGmailIntegration();
      onUpdate(updated as IntegrationConfig);
    } catch {
      // ignore
    } finally {
      setIsEnabling(false);
    }
  }

  async function handleAddSender() {
    const email = newSender.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      setSenderError("Invalid email address");
      return;
    }
    if (monitoredSenders.includes(email)) {
      setSenderError("Already monitoring this sender");
      return;
    }
    setSenderError("");
    const updated = [...monitoredSenders, email];
    await api.updateGmailIntegration({
      config: { monitoredSenders: updated },
    });
    const refreshed = await api.fetchGmailIntegration();
    onUpdate(refreshed as IntegrationConfig);
    setNewSender("");
  }

  async function handleRemoveSender(email: string) {
    const updated = monitoredSenders.filter((s) => s !== email);
    await api.updateGmailIntegration({
      config: { monitoredSenders: updated },
    });
    const refreshed = await api.fetchGmailIntegration();
    onUpdate(refreshed as IntegrationConfig);
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncGmail();
      setSyncResult({
        processed: result.processed,
        tasksCreated: result.tasksCreated,
      });
      // Refresh history
      const h = await api.fetchGmailHistory();
      setHistory(h);
    } catch {
      // ignore
    } finally {
      setIsSyncing(false);
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

  const actionBadge: Record<string, { label: string; cls: string }> = {
    task_created: { label: "Task Created", cls: "text-[#6bcb6b]" },
    skipped: { label: "Skipped", cls: "text-[#888]" },
    no_action: { label: "No Action", cls: "text-[#888]" },
    error: { label: "Error", cls: "text-[#ea4335]" },
  };

  return (
    <motion.div
      className="w-[320px] max-h-[500px] overflow-y-auto bg-[#2c1810] border border-[rgba(212,168,96,0.2)] rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] p-4 archivist-scroll"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-headline-sm text-[#d4a860]">
          Gmail Integration
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
            config?.enabled ? "bg-[#6bcb6b]" : "bg-[#d4a860]"
          }`}
        />
        <span className="text-label-sm font-label text-on-surface-variant">
          {config?.enabled ? "Connected" : "Not Connected"}
        </span>
        {config?.lastSyncAt && (
          <span className="text-[11px] text-[#666] ml-auto">
            Last sync: {relativeTime(config.lastSyncAt)}
          </span>
        )}
      </div>

      {/* Setup guide (not enabled) */}
      {!config?.enabled && (
        <div className="space-y-3 mb-4">
          <p className="text-body-sm text-on-surface-variant">
            Connect Gmail to automatically create tasks from important emails.
          </p>
          <ol className="text-body-sm text-on-surface-variant space-y-2 list-decimal pl-4">
            <li>Connect your Gmail account</li>
            <li>Add email addresses to monitor</li>
            <li>Emails from monitored senders will create tasks</li>
          </ol>
          <button
            onClick={handleEnable}
            disabled={isEnabling}
            className="w-full py-2 px-3 rounded bg-[rgba(212,168,96,0.15)] text-[#d4a860] font-label text-label-md hover:bg-[rgba(212,168,96,0.25)] transition-colors disabled:opacity-50"
          >
            {isEnabling ? "Connecting..." : "Connect Gmail"}
          </button>
        </div>
      )}

      {/* Monitor list */}
      {config?.enabled && (
        <div className="mb-4">
          <h4 className="font-label text-label-md text-[#d4a860] mb-2">
            Monitored Senders
          </h4>

          {/* Add sender */}
          <div className="flex gap-2 mb-2">
            <input
              type="email"
              value={newSender}
              onChange={(e) => {
                setNewSender(e.target.value);
                setSenderError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAddSender()}
              placeholder="email@example.com"
              className="flex-1 px-2 py-1.5 rounded bg-[rgba(0,0,0,0.3)] border border-[rgba(212,168,96,0.2)] text-on-surface text-body-sm placeholder:text-[#555] focus:outline-none focus:border-[#d4a860]"
            />
            <button
              onClick={handleAddSender}
              className="px-3 py-1.5 rounded bg-[rgba(212,168,96,0.15)] text-[#d4a860] font-label text-label-sm hover:bg-[rgba(212,168,96,0.25)] transition-colors"
            >
              Add
            </button>
          </div>
          {senderError && (
            <p className="text-[11px] text-[#ea4335] mb-2">{senderError}</p>
          )}

          {/* Sender list */}
          {monitoredSenders.length === 0 ? (
            <p className="text-body-sm text-[#666] italic">
              No senders added yet
            </p>
          ) : (
            <ul className="space-y-1">
              {monitoredSenders.map((email) => (
                <li
                  key={email}
                  className="flex items-center justify-between px-2 py-1.5 rounded bg-[rgba(0,0,0,0.15)] text-body-sm text-on-surface-variant"
                >
                  <span className="truncate">{email}</span>
                  <button
                    onClick={() => handleRemoveSender(email)}
                    className="text-[#666] hover:text-[#ea4335] transition-colors ml-2 shrink-0"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Manual sync */}
      {config?.enabled && (
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
              "Refresh Emails"
            )}
          </button>
          {syncResult && (
            <p className="text-[11px] text-[#6bcb6b] mt-1 text-center">
              Processed {syncResult.processed} emails, created{" "}
              {syncResult.tasksCreated} tasks
            </p>
          )}
        </div>
      )}

      {/* Activity feed */}
      {history.length > 0 && (
        <div>
          <h4 className="font-label text-label-md text-[#d4a860] mb-2">
            Recent Activity
          </h4>
          <ul className="space-y-1.5">
            {history.slice(0, 5).map((email) => {
              const badge = actionBadge[email.actionTaken] ?? actionBadge.error;
              return (
                <li
                  key={email.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-[rgba(0,0,0,0.1)] text-[12px]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-on-surface-variant truncate">
                      {email.senderEmail}
                    </p>
                    <p className="text-[#666] truncate">
                      {email.subject || "(no subject)"}
                    </p>
                  </div>
                  <span className={`text-[10px] font-label shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
