"use client";

import { useEffect, useRef } from "react";
import { usePlanner } from "@/context/planner-context";
import { ChatMessage } from "./chat-message";
import { ChatTypingIndicator } from "./chat-typing-indicator";
import { ChatInput } from "./chat-input";

export function ChatContainer() {
  const { messages, isTyping, sendMessage } = usePlanner();
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
