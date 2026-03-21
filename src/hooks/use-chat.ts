"use client";

import { useState, useCallback } from "react";
import type { ChatMessage } from "@/lib/types";
import { mockChatMessages } from "@/lib/mock-chat";

const simulatedResponses = [
  {
    content: "I've noted that. Let me adjust the schedule for you. Give me a moment to find the best slots...",
    quickActions: ["Show updated map", "What changed?"],
  },
  {
    content: "Done! I've rearranged the blocks to accommodate your request. The map has been updated — take a look and confirm when ready.",
    quickActions: ["Confirm changes", "Undo last change", "Show diff"],
  },
  {
    content: "Good call. I'll keep that in mind for future planning. Anything else you'd like to adjust?",
    quickActions: ["Plan tomorrow", "Show inventory", "I'm done for now"],
  },
];

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(mockChatMessages);
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = useCallback((content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate assistant response
    const responseIndex = Math.floor(Math.random() * simulatedResponses.length);
    const response = simulatedResponses[responseIndex];

    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-r`,
        role: "assistant",
        content: response.content,
        timestamp: new Date().toISOString(),
        quickActions: response.quickActions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 1200 + Math.random() * 800);
  }, []);

  return { messages, isTyping, sendMessage };
}
