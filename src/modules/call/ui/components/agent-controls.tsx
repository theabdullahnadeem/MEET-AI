"use client";

import { useState } from "react";
import { BotIcon, BotOffIcon, SparklesIcon } from "lucide-react";
import { useDataChannel } from "@livekit/components-react";

import { Button } from "@/components/ui/button";
import {
  AGENT_CONTROL_TOPIC,
  AGENT_STATE_TOPIC,
  type AgentControlMessage,
  type AgentMode,
  type AgentStateMessage,
} from "../../agent-protocol";

interface Props {
  isOwner: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// C.3: in-call AI controls. The host can mute/unmute the agent (muted = it
// keeps listening and transcribing but never speaks). While muted, anyone can
// summon a single answer with "Ask AI". State syncs over data channels.
export const AgentControls = ({ isOwner }: Props) => {
  const [mode, setMode] = useState<AgentMode>("active");

  useDataChannel(AGENT_STATE_TOPIC, (msg) => {
    try {
      const message = JSON.parse(
        decoder.decode(msg.payload),
      ) as AgentStateMessage;
      if (message.type === "mode_changed") {
        setMode(message.mode);
      }
    } catch {
      // ignore malformed messages
    }
  });

  const { send } = useDataChannel(AGENT_CONTROL_TOPIC);

  const sendControl = (message: AgentControlMessage) =>
    send(encoder.encode(JSON.stringify(message)), { reliable: true });

  const toggleMode = () => {
    const next: AgentMode = mode === "active" ? "muted" : "active";
    // Optimistic — the agent confirms via a mode_changed broadcast.
    setMode(next);
    sendControl({ type: "set_mode", mode: next });
  };

  return (
    <div className="flex items-center gap-x-2">
      {mode === "muted" && (
        <Button
          variant="ghost"
          size="sm"
          className="bg-white/10 hover:bg-white/20 text-white hover:text-white"
          onClick={() => sendControl({ type: "ask" })}
          title="Ask the AI to answer now"
        >
          <SparklesIcon />
          Ask AI
        </Button>
      )}
      {isOwner ? (
        <Button
          variant="ghost"
          size="sm"
          className="bg-white/10 hover:bg-white/20 text-white hover:text-white"
          onClick={toggleMode}
          title={
            mode === "active"
              ? "Mute the AI — it keeps listening and transcribing, but only answers when asked"
              : "Unmute the AI — it answers on its own again"
          }
        >
          {mode === "active" ? <BotIcon /> : <BotOffIcon />}
          {mode === "active" ? "AI on" : "AI muted"}
        </Button>
      ) : (
        <div className="flex items-center gap-x-1.5 text-xs px-3 py-1.5 rounded-md bg-white/10">
          {mode === "active" ? (
            <BotIcon className="size-4" />
          ) : (
            <BotOffIcon className="size-4" />
          )}
          {mode === "active" ? "AI on" : "AI muted"}
        </div>
      )}
    </div>
  );
};
