"use client";

import { useEffect, useRef, useMemo } from "react";
import { usePlanner } from "@/context/planner-context";
import { ChatMessage } from "./chat-message";
import { ChatTypingIndicator } from "./chat-typing-indicator";
import { ChatInput } from "./chat-input";

export function ChatContainer() {
  const { messages, isTyping, sendMessage, user } = usePlanner();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto archivist-scroll px-6 py-6"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
          {messages.length === 0 && (
            <WelcomeMessage name={user.name.split(" ")[0]} onSend={sendMessage} />
          )}
          {messages.map((msg, i) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onQuickAction={sendMessage}
              isLast={i === messages.length - 1}
            />
          ))}
          {isTyping && <ChatTypingIndicator />}
        </div>
      </div>
      <ChatInput onSend={sendMessage} disabled={isTyping} />
    </div>
  );
}

const greetings = [
  (name: string) =>
    `Hail, ${name}. The Oracle awaits your voice — speak your quests, and we shall chart the path together.`,
  (name: string) =>
    `Welcome back, ${name}. The Oracle stirs at your presence — tell me of the tasks that weigh upon your mind, and I'll help map your week.`,
  (name: string) =>
    `Ah, ${name} — the Oracle glows warmly in greeting. What adventures does this week hold? Let us plan your journey.`,
  (name: string) =>
    `The Oracle pulses at your presence, ${name}. Share your quests for the days ahead, and together we'll forge a worthy schedule.`,
];

function WelcomeMessage({ name, onSend }: { name: string; onSend: (msg: string) => void }) {
  const greeting = useMemo(() => {
    const pick = greetings[Math.floor(Math.random() * greetings.length)];
    return pick(name);
  }, [name]);

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 gap-6">
      <div className="text-tertiary opacity-70">
        <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="9" opacity="0.4" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <p className="font-body text-body-lg text-on-surface max-w-md leading-relaxed">
        {greeting}
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {["Plan my week", "Show my quests", "What's on today?"].map((hint) => (
          <button
            key={hint}
            onClick={() => onSend(hint)}
            className="font-label text-label-sm text-primary border border-primary/40 rounded-none px-3 py-1 hover:bg-primary/10 hover:text-on-surface transition-colors cursor-pointer"
          >
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}
