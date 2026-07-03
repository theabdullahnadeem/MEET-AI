"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";

import "@livekit/components-styles";

import { CallLobby, type LobbyChoices } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
  meetingId: string;
  meetingName: string;
  userId: string;
  userName: string;
  userImage: string;
}

export const CallConnect = ({ meetingId, meetingName }: Props) => {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<"lobby" | "call" | "ended">("lobby");
  const [choices, setChoices] = useState<LobbyChoices>({
    audioEnabled: true,
    videoEnabled: true,
  });

  useEffect(() => {
    let isIgnore = false;

    const fetchToken = async () => {
      try {
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(meetingId)}`,
        );
        // MU-2: non-owners can reach this screen from a shared link, but the
        // token endpoint is owner-only until knock-to-join (MU-3) lands —
        // give them a clear message instead of a generic failure.
        if (res.status === 403) {
          if (!isIgnore) {
            setError(
              "You don't have access to this meeting yet. Ask the host to invite you.",
            );
          }
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch token");
        const data = await res.json();
        if (!isIgnore) {
          setToken(data.token);
        }
      } catch (e) {
        console.error("LiveKit token fetch failed:", e);
        if (!isIgnore) {
          setError("Could not connect to meeting. Please try again.");
        }
      }
    };

    fetchToken();

    return () => {
      isIgnore = true;
    };
  }, [meetingId]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <p className="text-white text-sm">{error}</p>
      </div>
    );
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
      <CallActive meetingName={meetingName} />
    </LiveKitRoom>
  );
};
