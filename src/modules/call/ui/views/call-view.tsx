"use client";

import { ErrorState } from "@/components/error-state";
import { MeetingGetForCall } from "@/modules/meetings/types";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CallProvider } from "../components/call-provider";

interface Props {
    meetingId: string;
}

export const CallView = ({meetingId}: Props) => {

    const trpc = useTRPC();
    // MU-2: call-scoped read so guests with the link can reach the call screen.
    const { data } = useSuspenseQuery(
        trpc.meeting.getForCall.queryOptions({ id: meetingId })
    ) as { data: MeetingGetForCall };

    if(data.status === "completed"){
        return (
            <div className="flex h-screen items-center justify-center">
                <ErrorState
                    title="Meeting Completed"
                    description="This meeting has already ended. Please check the meeting details or contact the organizer if you believe this is a mistake."
                />
            </div>
        )
    }

    return (
        <CallProvider
            meetingId={meetingId}
            meetingName={data.name}
            isOwner={data.isOwner}
        />
    )
}