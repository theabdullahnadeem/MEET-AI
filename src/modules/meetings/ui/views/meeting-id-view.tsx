"use client";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { MeetingIdViewHeader } from "../component/meeting-id-header";
import { MeetingGetOne } from "../../types";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/use-confirm";
import { UpdateMeetingDialogue } from "../component/update-meeting-dialogue";
import { useState } from "react";

interface Props {
    meetingId: string;
}

export const MeetingIdView = ({meetingId}: Props) => {

    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [updateMeetingDialogOpen, setUpdateMeetingDialogOpen] = useState(false);
    
    const router = useRouter();
    const { data } = useSuspenseQuery(
        trpc.meeting.getOne.queryOptions({ id: meetingId })
    ) as { data: MeetingGetOne } ;

    const [RemoveConfirmation, confirmRemove] = useConfirm(
        "Are you sure?",
        "This action cannot be undone."
    );

    const removeMeeting = useMutation(
        trpc.meeting.remove.mutationOptions({ 
            onSuccess: () => {
                queryClient.invalidateQueries(
                    trpc.meeting.getOne.queryOptions({ id: meetingId })
                );
                // TODO: Inavlidate free tier usage
                router.push("/meetings");
            }
         })
    ) ;

    const handleRemoveMeeting = async () => {
        const ok = await confirmRemove();
        if (!ok) {
            return;
        } 
        removeMeeting.mutate({ id: meetingId });
    };

    return (
        <>
            <RemoveConfirmation />
            <UpdateMeetingDialogue 
                open={updateMeetingDialogOpen}
                onOpenChange={setUpdateMeetingDialogOpen}
                initialValues={data}
            />
            <div className="flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-4">
                <MeetingIdViewHeader
                    meetingId={meetingId}
                    meetingName={data.name}
                    onEdit={() => setUpdateMeetingDialogOpen(true)}
                    onRemove={handleRemoveMeeting}
                />
                {JSON.stringify(data, null, 2)}
            </div>
        </>
    )
}

export const MeetingIdViewError = () => {
    return (
        <ErrorState
            title="Meeting not found"
            description="The meeting you are trying to access does not exist or has been deleted."
        />
    )
}

export const MeetingIdViewLoading = () => {
    return (
        <LoadingState
            title="Loading meeting..."
            description="Please wait while we load the meeting."
        />
    )
}
