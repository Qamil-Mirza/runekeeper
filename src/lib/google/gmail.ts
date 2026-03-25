import { createLogger } from "@/lib/logger";

const GMAIL_API = "https://www.googleapis.com/gmail/v1";
const log = createLogger("gmail");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType: string;
  headers?: GmailMessageHeader[];
  body?: { data?: string; size: number };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: GmailMessageHeader[];
    mimeType?: string;
    body?: { data?: string; size: number };
    parts?: GmailMessagePart[];
  };
  internalDate?: string;
}

export interface GmailHistoryRecord {
  id: string;
  messagesAdded?: Array<{
    message: { id: string; threadId: string; labelIds?: string[] };
  }>;
}

// ─── Custom Errors ──────────────────────────────────────────────────────────

export class GmailHistoryExpiredError extends Error {
  constructor() {
    super("History ID expired (404 NOT FOUND)");
    this.name = "GmailHistoryExpiredError";
  }
}

// ─── List Messages ──────────────────────────────────────────────────────────

export async function listMessages(
  accessToken: string,
  query: string,
  maxResults: number = 20
): Promise<{ messages: { id: string; threadId: string }[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("maxResults", String(maxResults));

  const res = await fetch(`${GMAIL_API}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    log.error(`Gmail listMessages error ${res.status}: ${error.error?.message || res.statusText}`);
    throw new Error("Gmail listMessages request failed");
  }

  const data = await res.json();
  return {
    messages: data.messages || [],
    nextPageToken: data.nextPageToken,
  };
}

// ─── Get Message ────────────────────────────────────────────────────────────

export async function getMessage(
  accessToken: string,
  messageId: string,
  format: "metadata" | "full" = "metadata"
): Promise<GmailMessage> {
  const params = new URLSearchParams();
  params.set("format", format);

  const res = await fetch(
    `${GMAIL_API}/users/me/messages/${encodeURIComponent(messageId)}?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    log.error(`Gmail getMessage error ${res.status}: ${error.error?.message || res.statusText}`);
    throw new Error("Gmail getMessage request failed");
  }

  return res.json();
}

// ─── List History ───────────────────────────────────────────────────────────

export async function listHistory(
  accessToken: string,
  startHistoryId: string,
  labelId?: string
): Promise<{ history: GmailHistoryRecord[]; historyId: string }> {
  const params = new URLSearchParams();
  params.set("startHistoryId", startHistoryId);
  if (labelId) params.set("labelId", labelId);

  const res = await fetch(`${GMAIL_API}/users/me/history?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) {
    throw new GmailHistoryExpiredError();
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    log.error(`Gmail listHistory error ${res.status}: ${error.error?.message || res.statusText}`);
    throw new Error("Gmail listHistory request failed");
  }

  const data = await res.json();
  return {
    history: data.history || [],
    historyId: data.historyId,
  };
}

// ─── Setup Watch ────────────────────────────────────────────────────────────

export async function setupWatch(
  accessToken: string,
  topicName: string
): Promise<{ historyId: string; expiration: string }> {
  const res = await fetch(`${GMAIL_API}/users/me/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    log.error(`Gmail setupWatch error ${res.status}: ${error.error?.message || res.statusText}`);
    throw new Error("Gmail setupWatch request failed");
  }

  return res.json();
}

// ─── Stop Watch ─────────────────────────────────────────────────────────────

export async function stopWatch(accessToken: string): Promise<void> {
  const res = await fetch(`${GMAIL_API}/users/me/stop`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    log.error(`Gmail stopWatch error ${res.status}: ${error.error?.message || res.statusText}`);
    throw new Error("Gmail stopWatch request failed");
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function extractHeader(
  message: GmailMessage,
  headerName: string
): string | undefined {
  return message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === headerName.toLowerCase()
  )?.value;
}

export function extractPlainTextBody(message: GmailMessage): string {
  const MAX_LENGTH = 10000;

  function findPart(
    parts: GmailMessagePart[] | undefined,
    mimeType: string
  ): string | undefined {
    if (!parts) return undefined;
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const nested = findPart(part.parts, mimeType);
        if (nested) return nested;
      }
    }
    return undefined;
  }

  // Check top-level body first (simple messages without parts)
  if (message.payload?.mimeType === "text/plain" && message.payload.body?.data) {
    return decodeBase64Url(message.payload.body.data).slice(0, MAX_LENGTH);
  }

  // Walk MIME parts for text/plain
  const plainText = findPart(message.payload?.parts, "text/plain");
  if (plainText) return plainText.slice(0, MAX_LENGTH);

  // Fall back to text/html with tag stripping
  if (message.payload?.mimeType === "text/html" && message.payload.body?.data) {
    return stripHtmlTags(decodeBase64Url(message.payload.body.data)).slice(0, MAX_LENGTH);
  }

  const htmlText = findPart(message.payload?.parts, "text/html");
  if (htmlText) return stripHtmlTags(htmlText).slice(0, MAX_LENGTH);

  return "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
