"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import * as api from "@/lib/api-client";

interface OmiConfigPanelProps {
  config: api.OmiIntegrationConfig | null;
  onClose: () => void;
  onUpdate: (config: api.OmiIntegrationConfig) => void;
}

export function OmiConfigPanel({
  config,
  onClose,
  onUpdate,
}: OmiConfigPanelProps) {
  const [omiUserId, setOmiUserId] = useState(config?.config?.omiUserId ?? "");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const isConnected = config?.enabled && config?.config?.omiUserId;

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/integrations/omi/webhook?token=<OMI_WEBHOOK_SECRET>`
    : "";

  async function handleConnect() {
    if (!omiUserId.trim()) {
      setConnectError("OMI User ID is required");
      return;
    }
    setIsConnecting(true);
    setConnectError("");
    try {
      const updated = await api.updateOmiIntegration({
        omiUserId: omiUserId.trim(),
        enabled: true,
      });
      onUpdate(updated);
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect"
      );
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      const updated = await api.updateOmiIntegration({ enabled: false });
      onUpdate(updated);
    } catch {
      // ignore
    } finally {
      setIsDisconnecting(false);
    }
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
          OMI Dev Kit
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
      </div>

      {/* Setup form */}
      {!isConnected && (
        <div className="space-y-3 mb-4">
          <p className="text-body-sm text-on-surface-variant">
            Connect your OMI Dev Kit to use it as a wireless mic for the Oracle.
            Double-tap the OMI button to open voice mode.
          </p>

          <div>
            <label className="block text-label-sm font-label text-on-surface-variant mb-1">
              OMI User ID
            </label>
            <input
              type="text"
              value={omiUserId}
              onChange={(e) => {
                setOmiUserId(e.target.value);
                setConnectError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              placeholder="Your OMI account user ID"
              className="w-full px-2 py-1.5 rounded bg-[rgba(0,0,0,0.3)] border border-[rgba(212,168,96,0.2)] text-on-surface text-body-sm placeholder:text-[#555] focus:outline-none focus:border-[#d4a860]"
            />
            <p className="text-[10px] text-[#666] mt-1">
              Find in OMI app &gt; Settings &gt; Developer Mode
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
            {isConnecting ? "Connecting..." : "Connect OMI"}
          </button>
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <>
          {/* OMI User ID display */}
          <div className="mb-4 px-2 py-1.5 rounded bg-[rgba(0,0,0,0.15)] text-body-sm text-on-surface-variant truncate">
            OMI ID: {config?.config?.omiUserId}
          </div>

          {/* Webhook URL */}
          <div className="mb-4">
            <label className="block text-label-sm font-label text-on-surface-variant mb-1">
              Webhook URL
            </label>
            <div className="px-2 py-1.5 rounded bg-[rgba(0,0,0,0.15)] text-[10px] text-on-surface-variant break-all font-mono">
              {webhookUrl}
            </div>
            <p className="text-[10px] text-[#666] mt-1">
              Configure this URL in the OMI app for audio streaming and button events
            </p>
          </div>

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="w-full py-1.5 px-3 rounded text-[rgba(234,67,53,0.6)] font-label text-label-sm hover:text-[#ea4335] hover:bg-[rgba(234,67,53,0.08)] transition-colors disabled:opacity-50"
          >
            {isDisconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </>
      )}
    </motion.div>
  );
}
