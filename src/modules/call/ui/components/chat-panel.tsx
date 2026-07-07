"use client";

import { useEffect, useRef, useState } from "react";
import type { ReceivedChatMessage } from "@livekit/components-react";
import { SendHorizonalIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  messages: ReceivedChatMessage[];
  onSend: (message: string) => Promise<unknown>;
  isSending: boolean;
  onClose: () => void;
}

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

// MU-5: Google-Meet-style in-call chat. Messages ride LiveKit data channels
// (useChat) — ephemeral by design: visible only to people in the call and gone
// when the meeting ends. The useChat instance lives in CallActive so history
// survives closing/reopening this panel and unread counts work while closed.
export const ChatPanel = ({ messages, onSend, isSending, onClose }: Props) => {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || isSending) return;
    setDraft("");
    await onSend(message).catch(() => {
      // Sending failed (e.g. reconnecting) — put the draft back.
      setDraft(message);
    });
  };

  return (
    <div className="w-72 sm:w-80 shrink-0 rounded-lg bg-[#101213] border border-white/10 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="text-sm font-medium">In-call messages</p>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 text-white/70 hover:text-white hover:bg-white/10"
          onClick={onClose}
          title="Close"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <p className="px-4 py-2 text-xs text-white/50 border-b border-white/10">
        Messages can only be seen by people in the call and are deleted when
        the call ends.
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-white/50 text-center my-auto">
            No messages yet
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-y-0.5">
            <div className="flex items-baseline gap-x-2">
              <span className="text-xs font-medium truncate">
                {message.from?.isLocal
                  ? "You"
                  : message.from?.name || message.from?.identity || "Unknown"}
              </span>
              <span className="text-[10px] text-white/40 shrink-0">
                {formatTime(message.timestamp)}
              </span>
            </div>
            <p className="text-sm text-white/90 break-words whitespace-pre-wrap">
              {message.message}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        className="shrink-0 p-3 border-t border-white/10 flex items-center gap-x-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleSend();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Send a message"
          className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
        />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="size-9 p-0 text-white/70 hover:text-white hover:bg-white/10 shrink-0"
          disabled={!draft.trim() || isSending}
          title="Send"
        >
          <SendHorizonalIcon className="size-4" />
        </Button>
      </form>
    </div>
  );
};
