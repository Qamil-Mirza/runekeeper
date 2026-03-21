import type { User } from "./types";

export const mockUser: User = {
  id: "user-1",
  name: "Alex Hartwell",
  initials: "AH",
  timezone: "America/New_York",
  preferences: {
    workingHoursStart: 9,
    workingHoursEnd: 18,
    lunchDurationMinutes: 30,
    maxBlockMinutes: 120,
    meetingBuffer: 10,
  },
};
