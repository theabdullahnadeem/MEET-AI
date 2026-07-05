"use client";

import { Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";

import "@livekit/components-styles";

import { CallLobby, type LobbyChoices } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";
import { CallKnock } from "./call-knock";

interface Props {
  meetingId: string;
  meetingName: string;
  isOwner: boolean;
  userId: string;
  userName: string;
  userImage: string;
}

export const CallConnect = ({ meetingId, meetingName, isOwner }: Props) => {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // MU-3: 403 from the token endpoint → the guest knocks and waits.
  const [knocking, setKnocking] = useState(false);
  const [show, setShow] = useState<"lobby" | "call" | "ended">("lobby");
  const [choices, setChoices] = useState<LobbyChoices>({
    audioEnabled: true,
    videoEnabled: true,
  });

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/livekit-token?room=${encodeURIComponent(meetingId)}`,
      );
      if (res.status === 403) {
        // Not authorized (yet) — enter the knock-to-join flow. CallKnock
        // calls back here once the host admits.
        setKnocking(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch token");
      const data = await res.json();
      setToken(data.token);
      setKnocking(false);
    } catch (e) {
      console.error("LiveKit token fetch failed:", e);
      setError("Could not connect to meeting. Please try again.");
    }
  }, [meetingId]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <p className="text-white text-sm">{error}</p>
      </div>
    );
  }

  if (knocking) {
    return <CallKnock meetingId={meetingId} onApproved={fetchToken} />;
  }

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <Loader2Icon className="size-6 animate-spin text-white" />
      </div>
    );
  }

  if (show === "ended") {
    return <CallEnded />;
  }

  // Lobby is rendered outside <LiveKitRoom>, so we don't connect to the room
  // (and the agent isn't dispatched) until the user clicks "Join Meeting".
  if (show === "lobby") {
    return (
      <CallLobby
        onJoin={(nextChoices) => {
          setChoices(nextChoices);
          setShow("call");
        }}
      />
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL!}
      connect={true}
      audio={choices.audioEnabled}
      video={choices.videoEnabled}
      data-lk-theme="default"
      className="h-full"
      onDisconnected={() => setShow("ended")}
    >
      <CallActive
        meetingName={meetingName}
        meetingId={meetingId}
        isOwner={isOwner}
      />
    </LiveKitRoom>
  );
};
