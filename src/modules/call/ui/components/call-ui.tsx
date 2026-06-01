import { useState } from "react";
import { CallingState, StreamTheme, useCall } from "@stream-io/video-react-sdk";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
    meetingName: string;
};


export const CallUI = ({meetingName}: Props) => {
    const call = useCall();
    const [show, setShow] = useState<"lobby" | "call" | "ended">("lobby");

    const handleJoin = async () => {
        if(!call) return;

        if (call.state.callingState !== CallingState.IDLE) {
            return; 
        }


        await call.join();

        setShow("call");
    };

    const handleLeave = async () => {
        if(!call) return;

        try {
            await call.endCall();
        } catch (e) {
            // Call may already be ended server-side (e.g. via webhook);
            // fall back to leaving gracefully.
            try { await call.leave(); } catch {}
        }
        setShow("ended");
    };

    return (
        <StreamTheme className="h-full">
            {show === "lobby" && <CallLobby onJoin={handleJoin} />}
            {show === "call" && <CallActive meetingName={meetingName} onLeave={handleLeave} />}
            {show === "ended" && <CallEnded />}
        </StreamTheme>
    )
}