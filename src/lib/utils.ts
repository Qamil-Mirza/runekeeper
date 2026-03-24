import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date to YYYY-MM-DD in local timezone (avoids UTC shift from toISOString) */
export function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Extract local date string from an ISO datetime string */
export function isoToLocalDate(iso: string): string {
  return toLocalDateStr(new Date(iso));
}

/** Format a Date to YYYY-MM-DD in a specific timezone */
export function toDateStrInTimezone(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}

/** Check whether a timezone string is recognized by the Intl API */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
