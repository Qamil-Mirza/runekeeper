import { createLogger } from "@/lib/logger";

const log = createLogger("google:calendar");
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface GoogleEvent {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  transparency?: "opaque" | "transparent";
  etag?: string;
  status?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export interface EventsListResponse {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

// ─── List Events ─────────────────────────────────────────────────────────────

export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  syncToken?: string
): Promise<{ events: GoogleEvent[]; nextSyncToken?: string }> {
  const allEvents: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams();
    if (syncToken) {
      params.set("syncToken", syncToken);
      params.set("showDeleted", "true");
    } else {
      params.set("timeMin", timeMin);
      params.set("timeMax", timeMax);
      params.set("showDeleted", "true");
    }
    params.set("singleEvents", "true");
    params.set("orderBy", "startTime");
    params.set("maxResults", "250");
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (res.status === 410) {
      // syncToken expired — caller should do full resync
      throw new SyncTokenExpiredError();
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      log.error({ status: res.status, message: error.error?.message || res.statusText }, "Calendar API error");
      throw new Error("Google Calendar request failed");
    }

    const data: EventsListResponse = await res.json();
    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken;

    if (!pageToken) {
      return { events: allEvents, nextSyncToken: data.nextSyncToken };
    }
  } while (pageToken);

  return { events: allEvents };
}

// ─── Insert Event ────────────────────────────────────────────────────────────

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleEvent
): Promise<GoogleEvent> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...event,
        transparency: event.transparency ?? "opaque",
      }),
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to insert event: ${error.error?.message || res.statusText}`
    );
  }

  return res.json();
}

// ─── Patch Event ─────────────────────────────────────────────────────────────

export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: Partial<GoogleEvent>
): Promise<GoogleEvent> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to patch event: ${error.error?.message || res.statusText}`
    );
  }

  return res.json();
}

// ─── Delete Event ────────────────────────────────────────────────────────────

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete event: ${res.statusText}`);
  }
}

// ─── Type Mappers ────────────────────────────────────────────────────────────

export function mapGoogleEventToTimeBlock(event: GoogleEvent) {
  const extProps = event.extendedProperties?.private;
  return {
    title: event.summary || "Untitled",
    startTime: event.start.dateTime,
    endTime: event.end.dateTime,
    blockType: extProps?.blockType || inferBlockType(event.summary || ""),
    committed: true,
    googleEventId: event.id,
    googleEtag: event.etag,
    taskId: extProps?.taskId || null,
  };
}

export function mapTimeBlockToGoogleEvent(
  block: {
    id: string;
    title: string;
    startTime: Date | string;
    endTime: Date | string;
    blockType: string;
    taskId?: string | null;
  },
  timezone: string
): GoogleEvent {
  return {
    summary: block.title,
    start: {
      dateTime: new Date(block.startTime).toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: new Date(block.endTime).toISOString(),
      timeZone: timezone,
    },
    transparency: "opaque",
    extendedProperties: {
      private: {
        runekeeperId: block.id,
        blockType: block.blockType,
        ...(block.taskId ? { taskId: block.taskId } : {}),
      },
    },
  };
}

function inferBlockType(summary: string): string {
  const lower = summary.toLowerCase();
  if (lower.includes("meeting") || lower.includes("call") || lower.includes("sync"))
    return "meeting";
  if (lower.includes("class") || lower.includes("lecture")) return "class";
  if (lower.includes("lunch") || lower.includes("break")) return "personal";
  if (lower.includes("admin") || lower.includes("email")) return "admin";
  return "focus";
}

// ─── Custom Error ────────────────────────────────────────────────────────────

export class SyncTokenExpiredError extends Error {
  constructor() {
    super("Sync token expired (410 GONE)");
    this.name = "SyncTokenExpiredError";
  }
}
