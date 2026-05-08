"use client";

import { create } from "zustand";

type Message = {
  senderType: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type ChatState = {
  sessionId?: string;
  messages: Message[];
  typing: boolean;
  setSessionId: (sessionId: string) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setTyping: (typing: boolean) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  typing: false,
  setSessionId: (sessionId) => set({ sessionId }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  setTyping: (typing) => set({ typing }),
}));
