import { useMemo } from "react";
import {useMutation} from "@tanstack/react-query";
import {
    useCreateChatClient,
    Chat,
    Channel,
    MessageInput,
    MessageList,
    Thread,
    Window
} from "stream-chat-react";

import { useTRPC } from "@/trpc/client";
import { LoadingState } from "@/components/loading-state";

import "stream-chat-react/dist/css/v2/index.css";

interface Props {
    meetingId: string;
    userId: string;
    userName: string;
    userImage: string | undefined;
}

export const ChatUI = ({meetingId, userId, userName, userImage}: Props) => {
    const trpc = useTRPC();
    const { mutateAsync: generateChatToken } = useMutation(
        trpc.meeting.generateChatToken.mutationOptions(),
    );

    const client = useCreateChatClient({
        apiKey: process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY!,
        tokenOrProvider: generateChatToken,
        userData: {
            id: userId,
            name: userName,
            image: userImage
        }
    })

    // client.channel() is a synchronous factory (returns the same instance per
    // id), so the channel is derived state — no useState/useEffect needed.
    const channel = useMemo(() => {
        if(!client) return undefined;

        return client.channel("messaging", meetingId, {
            members: [userId]
        });
    }, [client, meetingId, userId])

    if(!client){
        return (
            <LoadingState title="Loading..." description="Please wait while we load your chat." />
        )
    }

    return(
        <div className="bg-white rounded-lg border overflow-hidden">
            <Chat client={client}>
                <Channel channel={channel}>
                    <Window>
                        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-23rem)] border-b">
                            <MessageList />
                        </div>
                        <MessageInput />
                    </Window>
                    <Thread />
                </Channel>
            </Chat>
        </div>
    )
}