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
