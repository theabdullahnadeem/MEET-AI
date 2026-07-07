"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Room, Track } from "livekit-client";
import {
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useRoomInfo,
  useTracks,
} from "@livekit/components-react";
import EgressHelper from "@livekit/egress-sdk";

import "@livekit/components-styles";

// Recording template for LiveKit RoomComposite egress (see the livekit-webhook
// route). Egress opens this page in a headless browser with `url` + `token`
// query params; the page joins the room as a hidden recorder and renders the
// SAME view participants see in the call — participant tiles with name/avatar
// placeholders when cameras are off, and screen shares — so recordings are
// never a black screen with voices. Not a user-facing page: without egress's
// query params it renders nothing.

interface RoomMeta {
  meetingName?: string;
}

const RecordingView = () => {
  const roomInfo = useRoomInfo();

  const meetingName = useMemo(() => {
    try {
      return (JSON.parse(roomInfo.metadata || "{}") as RoomMeta).meetingName;
    } catch {
      return undefined;
    }
  }, [roomInfo.metadata]);

  // Mirror CallActive: camera tiles (with placeholders) + screen shares.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-screen overflow-hidden text-white bg-[#0a0a0a]">
      <div className="shrink-0 bg-[#101213] rounded-full p-4 flex items-center gap-4">
        <div className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit h-fit">
          <Image src="/logo.svg" alt="Logo" width={22} height={22} />
        </div>
        <h4 className="text-base">{meetingName ?? "Meeting"}</h4>
      </div>
      <GridLayout tracks={tracks} className="flex-1 min-h-0">
        <ParticipantTile />
      </GridLayout>
      {/* Egress captures the page's audio output — this renders it. */}
      <RoomAudioRenderer />
    </div>
  );
};

const EgressTemplatePage = () => {
  const room = useMemo(() => new Room(), []);
  const [connection, setConnection] = useState<{
    url: string;
    token: string;
  } | null>(null);

  // The egress-appended query params exist only in the browser (EgressHelper
  // reads window.location), so they must be read after mount — the page is
  // prerendered to its empty state at build time. One-time read; the params
  // never change for the lifetime of the recorder page.
  useEffect(() => {
    const url = EgressHelper.getLiveKitURL();
    const token = EgressHelper.getAccessToken();
    if (url && token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnection({ url, token });
    }
  }, []);

  if (!connection) {
    return null;
  }

  return (
    <LiveKitRoom
      room={room}
      serverUrl={connection.url}
      token={connection.token}
      connect={true}
      audio={false}
      video={false}
      data-lk-theme="default"
      className="h-screen"
      onConnected={() => {
        // Tells egress the page is ready; recording auto-ends when all other
        // participants have left the room.
        EgressHelper.setRoom(room);
        EgressHelper.startRecording();
      }}
    >
      <RecordingView />
    </LiveKitRoom>
  );
};

export default EgressTemplatePage;
