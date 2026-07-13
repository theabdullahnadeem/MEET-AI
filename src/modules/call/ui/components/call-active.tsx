"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  RoomAudioRenderer,
  ControlBar,
  useChat,
  useParticipants,
} from "@livekit/components-react";
import { ParticipantKind } from "livekit-client";
import { MessageSquareTextIcon, UsersIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ShareInviteButton } from "@/components/share-invite-button";
import { AgentControls } from "./agent-controls";
import { MeetingLayout } from "./meeting-layout";
import { PeoplePanel } from "./people-panel";
import { ChatPanel } from "./chat-panel";

interface Props {
  meetingName: string;
  meetingId: string;
  isOwner: boolean;
}

type SidePanel = "people" | "chat" | null;

const headerButtonClass =
  "relative bg-white/10 hover:bg-white/20 text-white hover:text-white";

// MU-5: a soft two-tone chime when someone knocks, so the host notices even
// with the People panel closed. WebAudio (no asset); safe to fail silently —
// the badge still shows.
const playKnockChime = () => {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);
    [660, 880].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.15);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 700);
  } catch {
    // no audio available
  }
};

export const CallActive = ({ meetingName, meetingId, isOwner }: Props) => {
  const trpc = useTRPC();
  const [panel, setPanel] = useState<SidePanel>(null);

  const participants = useParticipants();
  const humanCount = participants.filter(
    (participant) => participant.kind !== ParticipantKind.AGENT,
  ).length;

  // MU-5: knocks are polled here (not in the panel) so the badge count and
  // chime keep working while the panel is closed — a knock can't be missed.
  const { data: pendingRequests } = useQuery({
    ...trpc.meeting.getPendingRequests.queryOptions({ meetingId }),
    refetchInterval: 3000,
    enabled: isOwner,
  });
  const pendingCount = pendingRequests?.length ?? 0;

  const prevPendingCount = useRef(0);
  useEffect(() => {
    if (pendingCount > prevPendingCount.current) {
      playKnockChime();
    }
    prevPendingCount.current = pendingCount;
  }, [pendingCount]);

  // MU-5: the single useChat instance for the whole call — panel unmounts
  // must not drop history, and unread counting needs the stream while closed.
  const { chatMessages, send, isSending } = useChat();

  // "Read up to here" is only bumped in the open/close handlers below — while
  // the chat panel is open the badge shows 0 regardless.
  const [readCount, setReadCount] = useState(0);
  const unreadCount =
    panel === "chat"
      ? 0
      : chatMessages
          .slice(readCount)
          .filter((message) => !message.from?.isLocal).length;

  const togglePanel = (next: Exclude<SidePanel, null>) => {
    // Entering or leaving chat marks everything so far as read.
    if (next === "chat" || panel === "chat") {
      setReadCount(chatMessages.length);
    }
    setPanel(panel === next ? null : next);
  };

  const closePanel = () => {
    if (panel === "chat") {
      setReadCount(chatMessages.length);
    }
    setPanel(null);
  };

  return (
    <div className="relative flex flex-col gap-4 p-4 h-full overflow-hidden text-white">
      {/* Mobile: the bar scrolls horizontally (scrollbar hidden) instead of
          clipping the buttons — the meeting name truncates first. */}
      <div className="shrink-0 bg-[#101213] rounded-full p-4 flex items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/"
          className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit h-fit shrink-0"
        >
          <Image src="/logo.svg" alt="Logo" width={22} height={22} />
        </Link>
        <h4 className="text-base truncate">{meetingName}</h4>
        <div className="ml-auto flex items-center gap-x-2 shrink-0">
          {/* C.3: mute/unmute the AI (host) + Ask AI while muted (everyone).
              C.2: host can remove/re-add the agent any time. */}
          <AgentControls meetingId={meetingId} isOwner={isOwner} />
          {/* MU-5: People panel — members + (host) the waiting-to-join list. */}
          <Button
            variant="ghost"
            size="sm"
            className={headerButtonClass}
            onClick={() => togglePanel("people")}
            title="People"
            aria-label={`People — ${humanCount} in the meeting${
              pendingCount > 0 ? `, ${pendingCount} waiting to join` : ""
            }`}
          >
            <UsersIcon />
            {humanCount}
            {pendingCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-amber-500 text-black text-xs font-medium"
              >
                {pendingCount}
              </span>
            )}
          </Button>
          {/* MU-5: in-call chat with an unread badge while the panel is closed. */}
          <Button
            variant="ghost"
            size="sm"
            className={headerButtonClass}
            onClick={() => togglePanel("chat")}
            title="In-call messages"
            aria-label={
              unreadCount > 0
                ? `In-call messages — ${unreadCount} unread`
                : "In-call messages"
            }
          >
            <MessageSquareTextIcon />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-medium"
              >
                {unreadCount}
              </span>
            )}
          </Button>
          <ShareInviteButton
            meetingId={meetingId}
            variant="ghost"
            size="sm"
            className="bg-white/10 hover:bg-white/20 text-white hover:text-white"
          />
        </div>
      </div>
      {/* relative: on small screens the side panels overlay this stage area
          (Google-Meet style) instead of squeezing the video tiles. */}
      <div className="relative flex-1 min-h-0 flex gap-4">
        {/* C.4: screens take the stage when shared (supports several at once). */}
        <MeetingLayout />
        {panel === "people" && (
          <PeoplePanel
            meetingId={meetingId}
            isOwner={isOwner}
            pendingRequests={pendingRequests ?? []}
            onClose={closePanel}
          />
        )}
        {panel === "chat" && (
          <ChatPanel
            messages={chatMessages}
            onSend={send}
            isSending={isSending}
            onClose={closePanel}
          />
        )}
      </div>
      <RoomAudioRenderer />
      <div className="shrink-0 bg-[#101213] rounded-full px-4">
        <ControlBar
          controls={{
            camera: true,
            microphone: true,
            screenShare: true,
            chat: false,
            settings: false,
            leave: true,
          }}
        />
      </div>
    </div>
  );
};
