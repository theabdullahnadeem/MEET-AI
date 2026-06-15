"use client";

import Link from "next/link";
import Image from "next/image";
import {
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  ControlBar,
} from "@livekit/components-react";
import { Track } from "livekit-client";

interface Props {
  meetingName: string;
}

export const CallActive = ({ meetingName }: Props) => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-hidden text-white">
      <div className="shrink-0 bg-[#101213] rounded-full p-4 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit h-fit"
        >
          <Image src="/logo.svg" alt="Logo" width={22} height={22} />
        </Link>
        <h4 className="text-base">{meetingName}</h4>
      </div>
      <GridLayout tracks={tracks} className="flex-1 min-h-0">
        <ParticipantTile />
      </GridLayout>
      <RoomAudioRenderer />
      <div className="shrink-0 bg-[#101213] rounded-full px-4">
        <ControlBar
          controls={{
            camera: true,
            microphone: true,
            screenShare: false,
            chat: false,
            settings: false,
            leave: true,
          }}
        />
      </div>
    </div>
  );
};
