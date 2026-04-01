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

  const connectIdRef = useRef(0);

  const connect = useCallback(() => {
    const id = ++connectIdRef.current;
    console.log(`[ws-${id}] connect() called, existing ws state:`, wsRef.current?.readyState);

    // Close any lingering connection
    if (wsRef.current) {
      console.log(`[ws-${id}] closing previous ws`);
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    return new Promise<void>((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.hostname;
      const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
      const url = `${protocol}//${wsHost}:${wsPort}/api/voice`;
      console.log(`[ws-${id}] creating WebSocket to ${url}`);

      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        console.log(`[ws-${id}] onopen`);
        opened = true;
        setIsConnected(true);
        resolve();
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

      ws.onclose = (e) => {
        console.log(`[ws-${id}] onclose code=${e.code} reason=${e.reason} opened=${opened}`);
        setIsConnected(false);
        if (!opened) reject(new Error("WebSocket closed before open"));
      };

      ws.onerror = (e) => {
        console.error(`[ws-${id}] onerror opened=${opened}`, e);
        if (!opened) reject(new Error("WebSocket connection failed"));
      };
    });
  }, [onAudioReceived, onActionToast, onSessionEnd, onThinkingStart, onThinkingEnd, onError]);

  const disconnect = useCallback(() => {
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
