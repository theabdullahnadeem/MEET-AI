"use client";

import { useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
  meetingName: string;
}

export const CallUI = ({ meetingName }: Props) => {
  const room = useRoomContext();
  const [show, setShow] = useState<"lobby" | "call" | "ended">("lobby");

  useEffect(() => {
    const handleDisconnected = () => setShow("ended");

    room.on(RoomEvent.Disconnected, handleDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [room]);

  const handleJoin = () => {
    setShow("call");
  };

  return (
    <div className="h-full">
      {show === "lobby" && <CallLobby onJoin={handleJoin} />}
      {show === "call" && <CallActive meetingName={meetingName} />}
      {show === "ended" && <CallEnded />}
    </div>
  );
};
