"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";

interface Props {
  meetingId: string;
}

// MU-3: the host's waiting-room panel, shown inside the call. Polls pending
// join requests and lets the host admit or deny each knock.
export const JoinRequestsPanel = ({ meetingId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const pendingOptions = trpc.meeting.getPendingRequests.queryOptions({
    meetingId,
  });

  const { data: requests } = useQuery({
    ...pendingOptions,
    refetchInterval: 3000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: pendingOptions.queryKey });

  const admit = useMutation(
    trpc.meeting.admit.mutationOptions({ onSettled: invalidate }),
  );
  const deny = useMutation(
    trpc.meeting.deny.mutationOptions({ onSettled: invalidate }),
  );

  if (!requests || requests.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-24 right-4 z-50 w-72 rounded-lg bg-[#101213] border border-white/10 p-4 flex flex-col gap-y-3 shadow-lg">
      <p className="text-sm font-medium">
        Waiting to join ({requests.length})
      </p>
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex items-center justify-between gap-x-2"
        >
          <span className="text-sm truncate">{request.userName}</span>
          <div className="flex gap-x-1.5 shrink-0">
            <Button
              size="sm"
              onClick={() => admit.mutate({ requestId: request.id })}
              disabled={admit.isPending || deny.isPending}
            >
              Admit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deny.mutate({ requestId: request.id })}
              disabled={admit.isPending || deny.isPending}
            >
              Deny
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
