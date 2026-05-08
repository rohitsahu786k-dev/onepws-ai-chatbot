"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { Bot, CheckCheck, Paperclip, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button, Card, Input } from "@onepws/ui";
import type { ChatAttachment } from "@onepws/types";
import { useChatStore } from "../store/chat-store";

const quickReplies = [
  "We need a control room setup",
  "Do you handle raised access flooring?",
  "I want modular OT consultation",
];

const solutionOptions = ["Control room", "Raised access flooring", "Corporate interiors", "Modular OT"];
const timelineOptions = ["Urgent", "1-3 months", "3-6 months"];

function renderMessageContent(content: string) {
  return content.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
    <p key={`paragraph-${paragraphIndex}`} className={paragraphIndex > 0 ? "mt-3" : undefined}>
      {paragraph.split("\n").map((line, lineIndex) => (
        <span key={`line-${paragraphIndex}-${lineIndex}`}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => {
            if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
              return (
                <strong key={`part-${paragraphIndex}-${lineIndex}-${partIndex}`} className="font-semibold text-inherit">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return <span key={`part-${paragraphIndex}-${lineIndex}-${partIndex}`}>{part}</span>;
          })}
          {lineIndex < line.split("\n").length - 1 ? <br /> : null}
        </span>
      ))}
    </p>
  ));
}

function formatMessageTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ChatWidget({ embedded }: { embedded: boolean }) {
  const [open, setOpen] = useState(!embedded);
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [identityName, setIdentityName] = useState("");
  const [identityEmail, setIdentityEmail] = useState("");
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const [guidedSolution, setGuidedSolution] = useState(solutionOptions[0]);
  const [guidedTimeline, setGuidedTimeline] = useState(timelineOptions[1]);
  const [guidedLocation, setGuidedLocation] = useState("");
  const { sessionId, messages, typing, setSessionId, addMessage, setMessages, setTyping } = useChatStore();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const apiBaseUrl = useMemo(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return configuredUrl || "http://localhost:5000";
    }

    if (typeof window !== "undefined" && configuredUrl) {
      try {
        const configuredHost = new URL(configuredUrl).hostname;
        if (window.location.hostname === "chat.onepws.com" && configuredHost === "api.chat.onepws.com") {
          return "";
        }
      } catch {
        return configuredUrl;
      }
    }

    return configuredUrl || "";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedSessionId = window.localStorage.getItem("onepws-session-id");
    const storedVisitorId = window.localStorage.getItem("onepws-visitor-id");
    const storedName = window.localStorage.getItem("onepws-user-name");
    const storedEmail = window.localStorage.getItem("onepws-user-email");
    const pageUrl = window.location.href;

    async function boot() {
      const { data: session } = await axios.post(`${apiBaseUrl}/api/widget/init`, {
        visitorId: storedVisitorId ?? undefined,
        sessionId: storedSessionId ?? undefined,
        pageUrl,
        pageTitle: document.title,
        referrer: document.referrer,
        utmSource: new URLSearchParams(window.location.search).get("utm_source") ?? undefined,
        utmMedium: new URLSearchParams(window.location.search).get("utm_medium") ?? undefined,
        utmCampaign: new URLSearchParams(window.location.search).get("utm_campaign") ?? undefined,
      });

      window.localStorage.setItem("onepws-session-id", session.sessionId);
      window.localStorage.setItem("onepws-visitor-id", session.visitorId);
      setSessionId(session.sessionId);
      setIdentityName(storedName ?? "");
      setIdentityEmail(storedEmail ?? "");

      if (storedName && storedEmail) {
        try {
          const { data } = await axios.post(`${apiBaseUrl}/api/chat/identify`, {
            sessionId: session.sessionId,
            fullName: storedName,
            email: storedEmail,
          });
          window.localStorage.setItem("onepws-session-id", data.sessionId);
          setSessionId(data.sessionId);
          setMessages(
            data.messages.map((message: { senderType: "user" | "assistant"; content: string; createdAt?: string }) => ({
              senderType: message.senderType,
              content: message.content,
              createdAt: message.createdAt,
            }))
          );
          setIdentityReady(true);
          return;
        } catch {
          window.localStorage.removeItem("onepws-user-name");
          window.localStorage.removeItem("onepws-user-email");
        }
      }

      const { data } = await axios.get(`${apiBaseUrl}/api/chat/history/${session.sessionId}`);
      setMessages(
        data.map((message: { senderType: "user" | "assistant"; content: string; createdAt?: string }) => ({
          senderType: message.senderType,
          content: message.content,
          createdAt: message.createdAt,
        }))
      );
    }

    void boot().finally(() => {
      if (!storedName || !storedEmail) setIdentityReady(false);
    });
  }, [apiBaseUrl, setMessages, setSessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  useEffect(() => {
    if (!embedded || typeof window === "undefined") return;
    window.parent.postMessage({ type: "ONEPWS_CHATBOT_SIZE", open }, "*");
  }, [embedded, open]);

  useEffect(() => {
    if (!embedded || typeof document === "undefined") return;
    const previousHtmlBackground = document.documentElement.style.background;
    const previousBodyBackground = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = previousHtmlBackground;
      document.body.style.background = previousBodyBackground;
    };
  }, [embedded]);

  async function sendMessage(content: string) {
    if (!sessionId || !identityReady || (!content.trim() && attachments.length === 0)) return;
    setChatError("");
    const normalizedContent = content.trim() || "Please review the attached file and guide me.";
    const attachmentNote =
      attachments.length > 0
        ? `\n\nAttached: ${attachments.map((attachment) => attachment.name).join(", ")}`
        : "";
    addMessage({ senderType: "user", content: `${normalizedContent}${attachmentNote}`.trim(), createdAt: new Date().toISOString() });
    setTyping(true);
    setInput("");

    try {
      const { data } = await axios.post(`${apiBaseUrl}/api/chat/message`, {
        sessionId,
        content: normalizedContent,
        metadata: attachments.length > 0 ? { attachments } : undefined,
      });
      if (data.sessionId && data.sessionId !== sessionId) {
        window.localStorage.setItem("onepws-session-id", data.sessionId);
        setSessionId(data.sessionId);
        const { data: history } = await axios.get(`${apiBaseUrl}/api/chat/history/${data.sessionId}`);
        setMessages(
          history.map((message: { senderType: "user" | "assistant"; content: string; createdAt?: string }) => ({
            senderType: message.senderType,
            content: message.content,
            createdAt: message.createdAt,
          }))
        );
      } else {
        addMessage({ senderType: "assistant", content: data.reply, createdAt: new Date().toISOString() });
      }
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setChatError("I could not reach the OnePWS assistant. Please try again.");
    } finally {
      setTyping(false);
    }
  }

  async function readFileAsAttachment(file: File): Promise<ChatAttachment> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unsupported file"));
          return;
        }
        resolve({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          data: result,
        });
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 4);
    if (files.length === 0) return;

    try {
      const nextAttachments = await Promise.all(files.map((file) => readFileAsAttachment(file)));
      setAttachments(nextAttachments);
      setChatError("");
    } catch {
      setChatError("I could not read one of the selected files.");
    }
  }

  async function handleIdentitySubmit() {
    if (!sessionId || !identityName.trim() || !identityEmail.trim()) return;
    setIdentityLoading(true);
    setChatError("");

    try {
      const { data } = await axios.post(`${apiBaseUrl}/api/chat/identify`, {
        sessionId,
        fullName: identityName.trim(),
        email: identityEmail.trim(),
      });
      window.localStorage.setItem("onepws-user-name", identityName.trim());
      window.localStorage.setItem("onepws-user-email", identityEmail.trim().toLowerCase());
      window.localStorage.setItem("onepws-session-id", data.sessionId);
      setSessionId(data.sessionId);
      setMessages(
        data.messages.map((message: { senderType: "user" | "assistant"; content: string; createdAt?: string }) => ({
          senderType: message.senderType,
          content: message.content,
          createdAt: message.createdAt,
        }))
      );
      setIdentityReady(true);
    } catch {
      setChatError("I could not restore your conversation right now.");
    } finally {
      setIdentityLoading(false);
    }
  }

  function sendGuidedBrief() {
    const brief = [
      `Requirement: ${guidedSolution}`,
      `Timeline: ${guidedTimeline}`,
      guidedLocation.trim() ? `Project location: ${guidedLocation.trim()}` : "",
      "Please suggest the best next step.",
    ]
      .filter(Boolean)
      .join("\n");

    void sendMessage(brief);
  }

  return (
    <div className={embedded ? "flex h-screen w-full items-end justify-end p-2 sm:p-4" : "flex items-end justify-end"}>
      {!open ? (
        <Button
          className="relative h-14 gap-2 overflow-visible rounded-full bg-[linear-gradient(135deg,#111114_0%,#ea2d2d_100%)] px-4 text-white shadow-xl shadow-black/20 sm:px-5"
          aria-label="Open OnePWS chat"
          onClick={() => setOpen(true)}
        >
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full ring-2 ring-[#ea2d2d]/30"
            animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0.1, 0.7] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/14">
            <Bot className="h-5 w-5" />
            <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-white" />
          </span>
          <span className="hidden sm:inline">Chat With OnePWS</span>
        </Button>
      ) : null}
      <AnimatePresence>
        {open ? (
          <motion.div
          initial={{ opacity: 0, y: 24 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={embedded ? "h-full w-full max-w-[420px] sm:max-w-[540px]" : "w-full max-w-[540px]"}
        >
          <Card className="flex h-[min(610px,calc(100vh-16px))] min-h-0 flex-col overflow-hidden rounded-[18px] border border-black/8 bg-white p-0 shadow-[0_30px_80px_rgba(23,19,15,0.16)] sm:h-[min(760px,calc(100vh-24px))] sm:rounded-[20px]">
            <div className="shrink-0 bg-[linear-gradient(180deg,#111114_0%,#0c0c0f_100%)] px-4 py-3 text-white sm:px-5 sm:py-4">
              <div className="flex items-start gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-11 items-center rounded-[12px] bg-black/12 px-2 backdrop-blur sm:h-14">
                    <Image src="/onepws-logo.webp" alt="OnePWS" width={138} height={36} className="h-auto w-[112px] sm:w-[138px]" priority />
                  </div>
                  <div className="hidden h-14 w-px bg-white/10 sm:block" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[14px] font-semibold leading-[1.1] sm:text-[17px]">
                      <span className="text-white">OnePWS </span>
                      <span className="text-[#EA2D2D]">Assistant</span>
                    </h2>
                    <p className="mt-1 text-[11px] leading-[1.2] text-white/88 sm:text-[12px]">We&apos;re here to help!</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] leading-[1.2] text-white/86 sm:text-[12px]">
                      <span className="h-2 w-2 rounded-full bg-[#21c45d] sm:h-2.5 sm:w-2.5" />
                      Online
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/18 focus:outline-none focus:ring-2 focus:ring-white/60 sm:h-12 sm:w-12"
                  aria-label="Close OnePWS chat"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                </button>
              </div>
            </div>
            <div className="shrink-0 bg-[linear-gradient(135deg,#ea2d2d_0%,#cf1a28_100%)] px-4 py-3 text-white sm:px-5 sm:py-5">
              <div className="flex items-center gap-4">
                <p className="text-[11px] font-medium leading-[1.4] sm:text-[14px]">
                  Control rooms, flooring, interiors, healthcare infra, and modular OT enquiries.
                </p>
              </div>
            </div>
            {!identityReady ? (
              <div className="flex min-h-0 flex-1 items-center bg-white px-4 py-4 sm:px-5 sm:py-6">
                <div className="w-full rounded-[16px] border border-black/8 bg-[#faf8f6] p-4 shadow-[0_10px_24px_rgba(23,19,15,0.05)] sm:rounded-[18px] sm:p-5">
                  <div className="text-[14px] font-semibold leading-[1.2] text-black/88 sm:text-[15px]">Start your conversation</div>
                  <p className="mt-2 text-[11px] leading-[1.45] text-black/62 sm:text-[12px]">
                    Enter your name and work email first. Existing users will resume their previous chat. New users will start a fresh conversation.
                  </p>
                  <div className="mt-4 space-y-3">
                    <Input
                      value={identityName}
                      onChange={(event) => setIdentityName(event.target.value)}
                      placeholder="Your name"
                      className="h-10 rounded-[14px] border-black/8 px-4 text-[12px] sm:h-11 sm:text-[13px]"
                    />
                    <Input
                      value={identityEmail}
                      onChange={(event) => setIdentityEmail(event.target.value)}
                      placeholder="Work email"
                      type="email"
                      className="h-10 rounded-[14px] border-black/8 px-4 text-[12px] sm:h-11 sm:text-[13px]"
                    />
                    <Button
                      type="button"
                      disabled={identityLoading || !identityName.trim() || !identityEmail.trim()}
                      onClick={() => void handleIdentitySubmit()}
                      className="h-10 w-full rounded-[14px] bg-[linear-gradient(135deg,#ea2d2d_0%,#cf1a28_100%)] px-4 text-[12px] font-medium text-white sm:h-11 sm:text-[13px]"
                    >
                      {identityLoading ? "Checking..." : "Start chat"}
                    </Button>
                  </div>
                  {chatError ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{chatError}</div> : null}
                </div>
              </div>
            ) : (
              <>
            <div ref={scrollRef} className="onepws-chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto bg-white px-4 py-4 scroll-smooth sm:space-y-5 sm:px-5 sm:py-5">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-[11px] leading-[1.45] text-black/68 sm:text-[12px]">Start with your project need. The assistant will guide the conversation and help you quickly.</p>
                  <div className="flex flex-wrap gap-2">
                    {quickReplies.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        className="rounded-full border border-[#ea2d2d]/12 bg-[#fff1f1] px-3 py-2 text-left text-[11px] font-medium leading-[1.2] text-[#8f1414] transition hover:-translate-y-0.5 hover:bg-[#ffe4e4]"
                        onClick={() => void sendMessage(reply)}
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <AnimatePresence initial={false}>
                {messages.map((message, index) => (
                <motion.div
                  key={`${message.senderType}-${index}`}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className={message.senderType === "user" ? "flex justify-end" : "flex items-start gap-4"}
                >
                  {message.senderType === "assistant" ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_10px_22px_rgba(23,19,15,0.10)] ring-1 ring-black/6 sm:h-12 sm:w-12">
                      <Bot className="h-5 w-5 text-[#ea2d2d] sm:h-6 sm:w-6" />
                    </div>
                  ) : null}
                  <div
                    className={
                      message.senderType === "user"
                        ? "max-w-[84%] rounded-[14px] rounded-br-[8px] bg-[linear-gradient(135deg,#ea2d2d_0%,#cf1a28_100%)] px-4 py-3 text-[11px] leading-[1.5] text-white shadow-[0_14px_28px_rgba(234,45,45,0.22)] sm:max-w-[82%] sm:rounded-[16px] sm:px-5 sm:py-4 sm:text-[12px]"
                        : "max-w-[84%] rounded-[14px] rounded-bl-[8px] border border-black/6 bg-white px-4 py-3 text-[11px] leading-[1.5] text-black/86 shadow-[0_14px_30px_rgba(23,19,15,0.08)] sm:max-w-[82%] sm:rounded-[16px] sm:px-5 sm:py-4 sm:text-[12px]"
                    }
                  >
                    {renderMessageContent(message.content)}
                    <div className={message.senderType === "user" ? "mt-3 flex items-center justify-end gap-2 text-[11px] text-white/76" : "mt-3 text-[11px] text-black/28"}>
                      <span>{formatMessageTime(message.createdAt)}</span>
                      {message.senderType === "user" ? <CheckCheck className="h-4 w-4" strokeWidth={2.1} /> : null}
                    </div>
                  </div>
                </motion.div>
                ))}
              </AnimatePresence>
              {typing ? (
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_10px_22px_rgba(23,19,15,0.10)] ring-1 ring-black/6 sm:h-12 sm:w-12">
                    <Bot className="h-5 w-5 text-[#ea2d2d] sm:h-6 sm:w-6" />
                  </div>
                  <div className="flex items-center gap-2 rounded-[18px] rounded-bl-[8px] border border-black/6 bg-white px-4 py-3 text-sm text-black/55 shadow-[0_14px_30px_rgba(23,19,15,0.08)]">
                    <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-black/35" />
                    <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-black/35 [animation-delay:120ms]" />
                    <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-black/35 [animation-delay:240ms]" />
                  </div>
                </div>
              ) : null}
              {chatError ? <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{chatError}</div> : null}
            </div>
            <form
              className="shrink-0 border-t border-black/6 bg-white px-4 py-3 sm:px-5 sm:py-4"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(input);
              }}
            >
              {messages.length <= 2 ? (
                <div className="mb-3 rounded-[14px] border border-black/8 bg-[#faf8f6] p-3 sm:mb-4 sm:rounded-[16px]">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                    <label className="text-[11px] font-medium text-black/58">
                      Solution
                      <select
                        value={guidedSolution}
                        onChange={(event) => setGuidedSolution(event.target.value)}
                        className="mt-1 h-10 w-full rounded-[12px] border border-black/8 bg-white px-3 text-[12px] font-medium text-black/82 outline-none focus:ring-2 focus:ring-[#ea2d2d]/24"
                      >
                        {solutionOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-black/58">
                      Location
                      <Input
                        value={guidedLocation}
                        onChange={(event) => setGuidedLocation(event.target.value)}
                        placeholder="City / site"
                        className="mt-1 h-10 rounded-[12px] border-black/8 px-3 text-[12px]"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {timelineOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setGuidedTimeline(option)}
                        className={
                          guidedTimeline === option
                            ? "rounded-full bg-[#ea2d2d] px-3 py-2 text-[11px] font-semibold text-white"
                            : "rounded-full border border-black/8 bg-white px-3 py-2 text-[11px] font-medium text-black/70"
                        }
                      >
                        {option}
                      </button>
                    ))}
                    <Button
                      type="button"
                      onClick={sendGuidedBrief}
                      disabled={!identityReady || typing}
                      className="ml-auto h-9 rounded-full bg-black px-4 text-[11px] font-semibold text-white"
                    >
                      Share brief
                    </Button>
                  </div>
                </div>
              ) : null}
              {attachments.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <span key={attachment.name} className="inline-flex items-center rounded-full bg-[#fff1f1] px-3 py-1 text-[11px] font-medium text-[#8f1414]">
                      {attachment.name}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.md,.csv,.json"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleFilesSelected(event)}
                />
                <button
                  type="button"
                  disabled={!identityReady}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white text-black shadow-[0_10px_22px_rgba(23,19,15,0.08)] transition hover:bg-[#fafafa] sm:h-12 sm:w-12"
                  aria-label="Attach image or document"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={2.2} />
                </button>
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Type your message..."
                  disabled={!identityReady}
                  className="h-10 rounded-full border-black/8 bg-white px-4 text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:h-12 sm:px-6 sm:text-[13px]"
                />
                <Button type="submit" disabled={!identityReady || typing || (!input.trim() && attachments.length === 0)} aria-label="Send message" className="h-10 w-10 shrink-0 rounded-full bg-[linear-gradient(135deg,#ea2d2d_0%,#d51f3a_48%,#b80d37_100%)] p-0 text-white shadow-[0_14px_28px_rgba(234,45,45,0.26)] sm:h-12 sm:w-12">
                  <Send className="h-[18px] w-[18px] text-white sm:h-5 sm:w-5" fill="currentColor" strokeWidth={1.8} />
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-black/50 sm:mt-4 sm:text-[12px]">
                <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.1} />
                <span>
                  Your conversation is secure with <span className="font-semibold text-black/82">OnePWS</span>
                </span>
              </div>
            </form>
              </>
            )}
          </Card>
        </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
