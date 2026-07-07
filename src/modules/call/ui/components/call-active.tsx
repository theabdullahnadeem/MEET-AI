"use client";

import Link from "next/link";
import Image from "next/image";
import { RoomAudioRenderer, ControlBar } from "@livekit/components-react";

import { ShareInviteButton } from "@/components/share-invite-button";
import { AgentControls } from "./agent-controls";
import { JoinRequestsPanel } from "./join-requests-panel";
import { MeetingLayout } from "./meeting-layout";

interface Props {
  meetingName: string;
  meetingId: string;
  isOwner: boolean;
}

export const CallActive = ({ meetingName, meetingId, isOwner }: Props) => {
  return (
    <div className="relative flex flex-col gap-4 p-4 h-full overflow-hidden text-white">
      {/* MU-3: host-only waiting-room panel (admit/deny knocks). */}
      {isOwner && <JoinRequestsPanel meetingId={meetingId} />}
      <div className="shrink-0 bg-[#101213] rounded-full p-4 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit h-fit"
        >
          <Image src="/logo.svg" alt="Logo" width={22} height={22} />
        </Link>
        <h4 className="text-base">{meetingName}</h4>
        <div className="ml-auto flex items-center gap-x-2">
          {/* C.3: mute/unmute the AI (host) + Ask AI while muted (everyone). */}
          <AgentControls isOwner={isOwner} />
          <ShareInviteButton
            meetingId={meetingId}
            variant="ghost"
            size="sm"
            className="bg-white/10 hover:bg-white/20 text-white hover:text-white"
          />
        </div>
      </div>
      {/* C.4: screens take the stage when shared (supports several at once). */}
      <MeetingLayout />
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
