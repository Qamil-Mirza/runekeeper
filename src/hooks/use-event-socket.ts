"use client";

import { useEffect, useRef, useCallback } from "react";

type EventHandler = (event: Record<string, unknown>) => void;

/**
 * Persistent WebSocket connection to /api/events for receiving
 * server-pushed events (OMI triggers, etc.).
 */
export function useEventSocket(onEvent: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.hostname;
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
    const url = `${protocol}//${wsHost}:${wsPort}/api/events`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEventRef.current(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, "unmount");
      wsRef.current = null;
    };
  }, [connect]);
}
