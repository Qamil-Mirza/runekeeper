"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface VoiceSessionOptions {
  onAudioReceived: (pcmData: ArrayBuffer) => void;
  onActionToast: (message: string) => void;
  onSessionEnd: (summary: string) => void;
  onThinkingStart: () => void;
  onThinkingEnd: () => void;
  onError: (error: string) => void;
}

interface VoiceSession {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendAudio: (pcmData: ArrayBuffer) => void;
  isConnected: boolean;
}

export function useVoiceSession({
  onAudioReceived,
  onActionToast,
  onSessionEnd,
  onThinkingStart,
  onThinkingEnd,
  onError,
}: VoiceSessionOptions): VoiceSession {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;

  const connect = useCallback(async () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/voice`;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onAudioReceived(event.data);
        return;
      }

      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "action":
            onActionToast(msg.summary);
            break;
          case "thinking":
            onThinkingStart();
            break;
          case "thinking_end":
            onThinkingEnd();
            break;
          case "session_end":
            onSessionEnd(msg.summary);
            break;
          case "error":
            onError(msg.message || "An error occurred");
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);

      if (!event.wasClean && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        setTimeout(() => connect(), 1000 * reconnectAttemptsRef.current);
      }
    };

    ws.onerror = () => {
      onError("Couldn't reach the Oracle — try again");
    };
  }, [onAudioReceived, onActionToast, onSessionEnd, onThinkingStart, onThinkingEnd, onError]);

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = maxReconnectAttempts;
    wsRef.current?.close(1000, "user_exit");
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(pcmData);
    }
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close(1000, "unmount");
    };
  }, []);

  return { connect, disconnect, sendAudio, isConnected };
}
