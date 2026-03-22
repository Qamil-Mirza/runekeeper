"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type {
  Task,
  TimeBlock,
  ChatMessage,
  User,
  TaskStatus,
  WeekRange,
} from "@/lib/types";
import { dbTaskToTask, dbBlockToTimeBlock } from "@/lib/types";
import * as api from "@/lib/api-client";

// ─── Fallback for unauthenticated / loading ──────────────────────────────────

const defaultUser: User = {
  id: "",
  name: "Guest",
  initials: "?",
  timezone: "America/New_York",
  preferences: {
    workingHoursStart: 9,
    workingHoursEnd: 18,
    lunchDurationMinutes: 30,
    maxBlockMinutes: 120,
    meetingBuffer: 10,
  },
};

function getWeekRange(date: Date): WeekRange {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

// ─── Context Types ───────────────────────────────────────────────────────────

export type ViewId = "home" | "chat" | "quest-log" | "calendar" | "settings";

interface PlannerState {
  user: User;
  tasks: Task[];
  blocks: TimeBlock[];
  messages: ChatMessage[];
  isTyping: boolean;
  isLoading: boolean;
  currentView: ViewId;
  drawerOpen: boolean;
  weekRange: WeekRange;
}

interface PlannerActions {
  sendMessage: (content: string) => void;
  toggleTaskDone: (taskId: string) => void;
  addTask: (title: string) => void;
  setCurrentView: (view: ViewId) => void;
  toggleDrawer: () => void;
  commitProposedBlocks: () => void;
  navigateWeek: (direction: -1 | 1) => void;
  refreshData: () => void;
}

const PlannerContext = createContext<(PlannerState & PlannerActions) | null>(
  null
);

// ─── Provider ────────────────────────────────────────────────────────────────

export function PlannerProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const [user, setUser] = useState<User>(defaultUser);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewId>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [weekRange, setWeekRange] = useState<WeekRange>(
    getWeekRange(new Date())
  );

  // ─── Load data from API on auth ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (status !== "authenticated") return;
    setIsLoading(true);
    try {
      // Sync Google Calendar first (best-effort), then fetch all data
      await api.syncCalendar().catch(() => null);

      const [userPrefs, tasksData, blocksData] = await Promise.all([
        api.fetchUserPreferences(),
        api.fetchTasks(),
        api.fetchBlocks(),
      ]);

      if (userPrefs) {
        setUser({
          id: userPrefs.id,
          name: userPrefs.name,
          initials: userPrefs.name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2),
          timezone: userPrefs.timezone,
          preferences: userPrefs.preferences ?? defaultUser.preferences,
        });
      }

      setTasks(tasksData.map(dbTaskToTask));
      setBlocks(blocksData.map(dbBlockToTimeBlock));
    } catch (err) {
      console.error("Failed to load planner data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        const result = await api.chatWithAssistant({ message: content });

        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}-r`,
          role: "assistant",
          content: result.response,
          timestamp: new Date().toISOString(),
          quickActions: result.quickActions,
          diffPreview: result.diffPreview,
          schedulePreview: result.schedulePreview,
          actionSummary: result.actionSummary,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Always refresh data after chat — the server may have created tasks or blocks
        await loadData();
      } catch (err) {
        console.error("Chat error:", err);
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}-err`,
          role: "assistant",
          content:
            "I encountered an error processing your request. Please try again.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsTyping(false);
      }
    },
    [loadData]
  );

  const toggleTaskDone = useCallback(async (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: (t.status === "done"
                ? "unscheduled"
                : "done") as TaskStatus,
            }
          : t
      )
    );

    try {
      const task = (await api.fetchTasks()).find(
        (t: any) => t.id === taskId
      );
      const newStatus = task?.status === "done" ? "unscheduled" : "done";
      await api.updateTask(taskId, { status: newStatus } as any);
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  }, []);

  const addTask = useCallback(async (title: string) => {
    // Optimistic add
    const tempId = `task-${Date.now()}`;
    const newTask: Task = {
      id: tempId,
      title,
      priority: "P1",
      estimateMinutes: 30,
      status: "unscheduled",
    };
    setTasks((prev) => [...prev, newTask]);

    try {
      const created = await api.createTask({ title });
      setTasks((prev) =>
        prev.map((t) => (t.id === tempId ? dbTaskToTask(created as any) : t))
      );
    } catch (err) {
      console.error("Failed to add task:", err);
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    }
  }, []);

  const toggleDrawer = useCallback(() => setDrawerOpen((o) => !o), []);

  const commitProposedBlocks = useCallback(async () => {
    setBlocks((prev) =>
      prev.map((b) => (b.committed ? b : { ...b, committed: true }))
    );
    try {
      // Will be wired to /api/calendar/commit in Phase 4
      await api.commitPlan("current");
    } catch (err) {
      console.error("Failed to commit blocks:", err);
    }
  }, []);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setWeekRange((prev) => {
      const current = new Date(prev.start);
      current.setDate(current.getDate() + direction * 7);
      return getWeekRange(current);
    });
  }, []);

  const refreshData = useCallback(() => {
    loadData();
  }, [loadData]);

  // ─── Value ───────────────────────────────────────────────────────────────

  const value = useMemo(
    () => ({
      user,
      tasks,
      blocks,
      messages,
      isTyping,
      isLoading,
      currentView,
      drawerOpen,
      weekRange,
      sendMessage,
      toggleTaskDone,
      addTask,
      setCurrentView,
      toggleDrawer,
      commitProposedBlocks,
      navigateWeek,
      refreshData,
    }),
    [
      user,
      tasks,
      blocks,
      messages,
      isTyping,
      isLoading,
      currentView,
      drawerOpen,
      weekRange,
      sendMessage,
      toggleTaskDone,
      addTask,
      toggleDrawer,
      commitProposedBlocks,
      navigateWeek,
      refreshData,
    ]
  );

  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner() {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlanner must be used within PlannerProvider");
  return ctx;
}
