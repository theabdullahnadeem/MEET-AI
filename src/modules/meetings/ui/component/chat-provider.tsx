"use client";

import { authClient } from "@/lib/auth-client";
import { LoadingState } from "@/components/loading-state";
import { ChatUI } from "./chat-ui";

interface Props {
    meetingId: string;
}

export const ChatProvider = ({ meetingId }: Props) => {
    const {data, isPending} = authClient.useSession();

    if(isPending || !data?.user) return <LoadingState title="Loading..." description="Please wait while we load your chat." />

    return (
        <ChatUI
            meetingId={meetingId}
            userId={data.user.id}
            userName={data.user.name}
            userImage={data.user.image ?? ""}
        />
    )
}
