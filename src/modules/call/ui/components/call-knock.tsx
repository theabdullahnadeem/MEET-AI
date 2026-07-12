"use client";

import { useEffect, useRef } from "react";
import { Loader2Icon, RefreshCwIcon, ShieldXIcon, TriangleAlertIcon } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";

interface Props {
  meetingId: string;
  onApproved: () => void;
}

// MU-3: the guest waiting room. Shown when the token endpoint returns 403 —
// knocks once (requestToJoin), then polls the request status until the host
// admits (→ onApproved re-fetches the token) or denies.
export const CallKnock = ({ meetingId, onApproved }: Props) => {
  const trpc = useTRPC();

  const requestToJoin = useMutation(
    trpc.meeting.requestToJoin.mutationOptions(),
  );

  const knocked = useRef(false);
  useEffect(() => {
    if (!knocked.current) {
      knocked.current = true;
      requestToJoin.mutate({ meetingId });
    }
  }, [meetingId, requestToJoin]);

  const {
    data: myRequest,
    isError: pollFailed,
    refetch,
  } = useQuery({
    ...trpc.meeting.getMyJoinRequest.queryOptions({ meetingId }),
    // Poll while the host decides; stop once approved/denied.
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || !query.state.data ? 3000 : false,
  });

  const status = myRequest?.status;

  useEffect(() => {
    if (status === "approved") {
      onApproved();
    }
  }, [status, onApproved]);

  // If the knock itself failed there is no request row to poll, and if polling
  // fails the guest can't see the host's decision — either way, surface it and
  // let them retry instead of waiting forever.
  if (status !== "denied" && (requestToJoin.isError || pollFailed)) {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <div className="flex flex-col items-center gap-y-4 bg-background rounded-lg p-10 shadow-sm text-center">
          <TriangleAlertIcon className="size-8 text-destructive" />
          <h6 className="text-lg font-medium">Couldn&apos;t reach the meeting</h6>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your request to join could not be sent or checked. Please try again.
          </p>
          <Button
            onClick={() => {
              requestToJoin.mutate({ meetingId });
              refetch();
            }}
            disabled={requestToJoin.isPending}
          >
            <RefreshCwIcon />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <div className="flex flex-col items-center gap-y-4 bg-background rounded-lg p-10 shadow-sm text-center">
          <ShieldXIcon className="size-8 text-destructive" />
          <h6 className="text-lg font-medium">Request declined</h6>
          <p className="text-sm text-muted-foreground max-w-sm">
            The host declined your request to join this meeting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
      <div className="flex flex-col items-center gap-y-4 bg-background rounded-lg p-10 shadow-sm text-center">
        <Loader2Icon className="size-6 animate-spin" />
        <h6 className="text-lg font-medium">Asking to join…</h6>
        <p className="text-sm text-muted-foreground max-w-sm">
          You&apos;ll join the meeting as soon as the host lets you in.
        </p>
        {/* S-4: recording consent — guests see this before they ever connect. */}
        <p className="text-xs text-muted-foreground max-w-sm">
          This meeting is recorded and transcribed, and an AI assistant may
          listen and speak. By joining, you consent to this.
        </p>
      </div>
    </div>
  );
};
