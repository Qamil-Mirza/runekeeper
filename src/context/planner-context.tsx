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
import { toLocalDateStr } from "@/lib/utils";

// ─── Fallback for unauthenticated / loading ──────────────────────────────────

const defaultUser: User = {
  id: "",
  name: "Guest",
  initials: "?",
  timezone: "America/New_York",
};

function getWeekRange(date: Date): WeekRange {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const monday = new Date(d);
  const sunday = new Date(d);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toLocalDateStr(monday),
    end: toLocalDateStr(sunday),
  };
}

// ─── Context Types ───────────────────────────────────────────────────────────

export type ViewId = "home" | "chat" | "quest-log" | "calendar" | "integrations";
export type TransitionMode = "none" | "ink-spread";

interface PlannerState {
  user: User;
  tasks: Task[];
  blocks: TimeBlock[];
  messages: ChatMessage[];
  isTyping: boolean;
  isLoading: boolean;
  currentView: ViewId;
  transitionMode: TransitionMode;
  drawerOpen: boolean;
  weekRange: WeekRange;
}

interface PlannerActions {
  sendMessage: (content: string) => void;
  toggleTaskDone: (taskId: string) => void;
  addTask: (title: string) => void;
  updateTask: (taskId: string, updates: Partial<Task>, startTime?: string) => void;
  deleteTask: (taskId: string) => void;
  updateBlockType: (blockId: string, blockType: string) => void;
  setCurrentView: (view: ViewId) => void;
  setTransitionMode: (mode: TransitionMode) => void;
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
  const [transitionMode, setTransitionMode] = useState<TransitionMode>("none");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [weekRange, setWeekRange] = useState<WeekRange>(
    getWeekRange(new Date())
  );

  // ─── Load data from API on auth ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (status !== "authenticated") return;
    setIsLoading(true);
    try {
      // Sync Google Calendar + Gmail (best-effort), then fetch all data
      await Promise.all([
        api.syncCalendar().catch(() => null),
        api.syncGmail().catch(() => null),
      ]);

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
          email: userPrefs.email,
          image: userPrefs.image ?? undefined,
        });
      }

      setTasks(tasksData.map(dbTaskToTask));
      setBlocks(blocksData.map(dbBlockToTimeBlock));
    } catch (err) {

    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lightweight refresh — re-fetches tasks and blocks without triggering syncs
  const reloadTasksAndBlocks = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const [tasksData, blocksData] = await Promise.all([
        api.fetchTasks(),
        api.fetchBlocks(),
      ]);
      setTasks(tasksData.map(dbTaskToTask));
      setBlocks(blocksData.map(dbBlockToTimeBlock));
    } catch {
      // silent — best-effort refresh
    }
  }, [status]);

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

      const assistantMsgId = `msg-${Date.now()}-r`;
      let placeholderCreated = false;

      try {
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const result = await api.chatWithAssistantStreaming(
          { message: content, timezone: browserTimezone },
          (token: string) => {
            if (!placeholderCreated) {
              // Create the assistant message on first token (avoids empty bubble)
              placeholderCreated = true;
              setIsTyping(false);
              setMessages((prev) => [
                ...prev,
                {
                  id: assistantMsgId,
                  role: "assistant" as const,
                  content: token,
                  timestamp: new Date().toISOString(),
                },
              ]);
            } else {
              // Append subsequent tokens to the existing message
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + token }
                    : msg
                )
              );
            }
          }
        );

        if (placeholderCreated) {
          // Streaming path: finalize the message with metadata
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: result.response || msg.content,
                    quickActions: result.quickActions,
                    diffPreview: result.diffPreview,
                    schedulePreview: result.schedulePreview,
                    actionSummary: result.actionSummary,
                  }
                : msg
            )
          );
        } else {
          // Non-streaming path (capable model): add the complete message
          const assistantMsg: ChatMessage = {
            id: assistantMsgId,
            role: "assistant",
            content: result.response,
            timestamp: new Date().toISOString(),
            quickActions: result.quickActions,
            diffPreview: result.diffPreview,
            schedulePreview: result.schedulePreview,
            actionSummary: result.actionSummary,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }

        // Refresh data — the server may have created tasks or blocks
        await reloadTasksAndBlocks();
      } catch (err) {

        const errorMsg: ChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          content:
            "I encountered an error processing your request. Please try again.",
          timestamp: new Date().toISOString(),
        };
        // Replace placeholder if streaming started, otherwise add new message
        setMessages((prev) =>
          placeholderCreated
            ? prev.map((msg) => (msg.id === assistantMsgId ? errorMsg : msg))
            : [...prev, errorMsg]
        );
      } finally {
        setIsTyping(false);
      }
    },
    [reloadTasksAndBlocks]
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

    }
  }, []);

  const addTask = useCallback(async (title: string) => {
    // Optimistic add
    const tempId = `task-${Date.now()}`;
    const newTask: Task = {
      id: tempId,
      title,
      priority: "medium",
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

      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    }
  }, []);

  const updateTask = useCallback(
    async (taskId: string, updates: Partial<Task>, startTime?: string) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );
      try {
        if (Object.keys(updates).length > 0) {
          await api.updateTask(taskId, updates);

          // Sync title change to the linked time block
          if (updates.title) {
            const linkedBlock = blocks.find((b) => b.taskId === taskId);
            if (linkedBlock) {
              await api.updateBlock(linkedBlock.id, { title: updates.title } as any);
              setBlocks((prev) =>
                prev.map((b) => b.id === linkedBlock.id ? { ...b, title: updates.title! } : b)
              );
            }
          }
        }

        // Handle start time changes (create/update/delete time block)
        if (startTime !== undefined) {
          const existingBlock = blocks.find((b) => b.taskId === taskId);

          if (startTime === "" && existingBlock) {
            // Clear start time — delete the block and unschedule
            await api.deleteBlock(existingBlock.id);
            await api.updateTask(taskId, { status: "unscheduled" } as any);
          } else if (startTime) {
            const task = tasks.find((t) => t.id === taskId);
            const duration = updates.estimateMinutes ?? task?.estimateMinutes ?? 30;
            const startDate = new Date(startTime);
            const endDate = new Date(startDate.getTime() + duration * 60_000);

            if (existingBlock) {
              // Update existing block
              await api.updateBlock(existingBlock.id, {
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                title: updates.title ?? task?.title ?? existingBlock.title,
              } as any);
            } else {
              // Create new block
              await api.createBlock({
                taskId,
                title: updates.title ?? task?.title ?? "",
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                blockType: "focus",
              });
              await api.updateTask(taskId, { status: "scheduled" } as any);
            }
          }
          // Refresh to get updated blocks
          await loadData();
        }
      } catch (err) {

        loadData();
      }
    },
    [loadData, blocks, tasks]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      // Remove the task and any linked time blocks from state
      const linkedBlocks = blocks.filter((b) => b.taskId === taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setBlocks((prev) => prev.filter((b) => b.taskId !== taskId));
      try {
        // Delete linked blocks first, then the task
        await Promise.all(linkedBlocks.map((b) => api.deleteBlock(b.id)));
        await api.deleteTask(taskId);
      } catch (err) {

        loadData();
      }
    },
    [loadData, blocks]
  );

  const updateBlockType = useCallback(
    (blockId: string, blockType: string) => {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, type: blockType as any } : b
        )
      );
    },
    []
  );

  const toggleDrawer = useCallback(() => setDrawerOpen((o) => !o), []);

  const commitProposedBlocks = useCallback(async () => {
    setBlocks((prev) =>
      prev.map((b) => (b.committed ? b : { ...b, committed: true }))
    );
    try {
      // Will be wired to /api/calendar/commit in Phase 4
      await api.commitPlan("current");
    } catch (err) {

    }
  }, []);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setWeekRange((prev) => {
      const current = new Date(prev.start + "T00:00:00");
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
      transitionMode,
      drawerOpen,
      weekRange,
      sendMessage,
      toggleTaskDone,
      addTask,
      updateTask,
      deleteTask,
      updateBlockType,
      setCurrentView,
      setTransitionMode,
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
      transitionMode,
      drawerOpen,
      weekRange,
      sendMessage,
      toggleTaskDone,
      addTask,
      updateTask,
      deleteTask,
      updateBlockType,
      setTransitionMode,
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
