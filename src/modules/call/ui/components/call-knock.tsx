"use client";

import { useEffect, useRef } from "react";
import { Loader2Icon, ShieldXIcon } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";

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

  const { data: myRequest } = useQuery({
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
      </div>
    </div>
  );
};
