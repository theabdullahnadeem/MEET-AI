"use client";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { MeetingIdViewHeader } from "../component/meeting-id-header";
import { MeetingGetOne } from "../../types";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/use-confirm";
import { UpdateMeetingDialogue } from "../component/update-meeting-dialogue";
import { useState } from "react";
import { UpcomingState } from "../component/upcoming-state";
import { ActiveState } from "../component/active-state";
import { CancelledState } from "../component/cancelled-state";
import { ProcessingState } from "../component/processing-state";
import { CompletedState } from "../component/completed-state";

interface Props {
  meetingId: string;
}

export const MeetingIdView = ({ meetingId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [updateMeetingDialogOpen, setUpdateMeetingDialogOpen] = useState(false);

  const router = useRouter();
  const { data } = useSuspenseQuery({
    ...trpc.meeting.getOne.queryOptions({ id: meetingId }),
    // K.1: status advances server-side (upcoming→active via webhook,
    // active→processing on room_finished, processing→completed by Inngest),
    // so poll while the meeting is in a non-terminal state — the page then
    // reflects each transition without a manual refresh.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "upcoming" ||
        status === "active" ||
        status === "processing"
        ? 5000
        : false;
    },
  }) as { data: MeetingGetOne };

  const [RemoveConfirmation, confirmRemove] = useConfirm(
    "Are you sure?",
    "This action cannot be undone.",
  );

  const cancelMutation = useMutation(
  trpc.meeting.cancelMeeting.mutationOptions({
    onSuccess: () => {
      // Invalidate the meeting query to refetch updated data
      queryClient.invalidateQueries({ queryKey: trpc.meeting.getOne.queryKey({ id: meetingId }) })
      router.push("/meetings");
      // Optionally show a toast notification
    }
  })
)

  const removeMeeting = useMutation(
    trpc.meeting.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.meeting.getOne.queryOptions({ id: meetingId }),
        );
        await queryClient.invalidateQueries(trpc.premium.getFreeUsage.queryOptions());
        router.push("/meetings");
      },
    }),
  );

  const handleRemoveMeeting = async () => {
    const ok = await confirmRemove();
    if (!ok) {
      return;
    }
    removeMeeting.mutate({ id: meetingId });
  };

  const isActive = data.status === "active";
  const isUpcoming = data.status === "upcoming";
  const isCompleted = data.status === "completed";
  const isCancelled = data.status === "cancelled";
  const isProcessing = data.status === "processing";

  return (
    <>
      <RemoveConfirmation />
      {data.isOwner && (
        <UpdateMeetingDialogue
          open={updateMeetingDialogOpen}
          onOpenChange={setUpdateMeetingDialogOpen}
          initialValues={data}
        />
      )}
      <div className="flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-4">
        <MeetingIdViewHeader
          meetingId={meetingId}
          meetingName={data.name}
          isOwner={data.isOwner}
          onEdit={() => setUpdateMeetingDialogOpen(true)}
          onRemove={handleRemoveMeeting}
        />
        {isCancelled && <CancelledState />}
        {isCompleted && <CompletedState data={data} />}
        {isProcessing && <ProcessingState />}
        {isActive && <ActiveState meetingId={meetingId} />}
        {isUpcoming && (
          <UpcomingState
            meetingId={meetingId}
            canCancel={data.isOwner}
            onCancelMeeting={()=> cancelMutation.mutate({id: meetingId})}
            isCancelling={cancelMutation.isPending}
          />
        )}
      </div>
    </>
  );
};

export const MeetingIdViewError = () => {
  return (
    <ErrorState
      title="Meeting not found"
      description="The meeting you are trying to access does not exist or has been deleted."
    />
  );
};

export const MeetingIdViewLoading = () => {
  return (
    <LoadingState
      title="Loading meeting..."
      description="Please wait while we load the meeting."
    />
  );
};
