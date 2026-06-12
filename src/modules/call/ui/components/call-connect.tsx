"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";

import "@livekit/components-styles";

import { CallUI } from "./call-ui";

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

  useEffect(() => {
    let isIgnore = false;

    const fetchToken = async () => {
      try {
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(meetingId)}`,
        );
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

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL!}
      connect={true}
      audio={true}
      video={true}
      data-lk-theme="default"
      className="h-full"
    >
      <CallUI meetingName={meetingName} />
    </LiveKitRoom>
  );
};
