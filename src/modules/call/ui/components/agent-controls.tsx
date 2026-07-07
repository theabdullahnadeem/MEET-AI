"use client";

import { useState } from "react";
import { BotIcon, BotOffIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react";
import { useDataChannel, useParticipants } from "@livekit/components-react";
import { ParticipantKind } from "livekit-client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  AGENT_CONTROL_TOPIC,
  AGENT_STATE_TOPIC,
  type AgentControlMessage,
  type AgentMode,
  type AgentStateMessage,
} from "../../agent-protocol";

interface Props {
  meetingId: string;
  isOwner: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const buttonClass =
  "bg-white/10 hover:bg-white/20 text-white hover:text-white";

// C.3: in-call AI controls. The host can mute/unmute the agent (muted = it
// keeps listening and transcribing but never speaks). While muted, anyone can
// summon a single answer with "Ask AI". State syncs over data channels.
// C.2: the host can also remove the agent entirely and add it back, any
// number of times — presence is derived live from the room's participants.
export const AgentControls = ({ meetingId, isOwner }: Props) => {
  const trpc = useTRPC();
  const [mode, setMode] = useState<AgentMode>("active");

  const participants = useParticipants();
  const agentPresent = participants.some(
    (participant) => participant.kind === ParticipantKind.AGENT,
  );

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

  const addAgent = useMutation(
    trpc.meeting.addAgent.mutationOptions({
      onError: (error) => toast.error(error.message || "Failed to add the AI"),
    }),
  );
  const removeAgent = useMutation(
    trpc.meeting.removeAgent.mutationOptions({
      onError: (error) =>
        toast.error(error.message || "Failed to remove the AI"),
    }),
  );

  // C.2: no agent in the room — the host can bring it (back) in.
  if (!agentPresent) {
    return (
      <div className="flex items-center gap-x-2">
        {isOwner ? (
          <Button
            variant="ghost"
            size="sm"
            className={buttonClass}
            onClick={() => addAgent.mutate({ meetingId })}
            disabled={addAgent.isPending}
            title="Add the AI agent to the meeting"
          >
            <PlusIcon />
            Add AI
          </Button>
        ) : (
          <div className="flex items-center gap-x-1.5 text-xs px-3 py-1.5 rounded-md bg-white/10">
            <BotOffIcon className="size-4" />
            AI off
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-x-2">
      {mode === "muted" && (
        <Button
          variant="ghost"
          size="sm"
          className={buttonClass}
          onClick={() => sendControl({ type: "ask" })}
          title="Ask the AI to answer now"
        >
          <SparklesIcon />
          Ask AI
        </Button>
      )}
      {isOwner ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className={buttonClass}
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
          <Button
            variant="ghost"
            size="sm"
            className={buttonClass}
            onClick={() => removeAgent.mutate({ meetingId })}
            disabled={removeAgent.isPending}
            title="Remove the AI from the meeting (it can be added back any time)"
          >
            <XIcon />
            Remove AI
          </Button>
        </>
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
