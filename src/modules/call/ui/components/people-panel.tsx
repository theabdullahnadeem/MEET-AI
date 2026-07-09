"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useIsMuted,
  useParticipants,
  useRoomInfo,
} from "@livekit/components-react";
import { ParticipantKind, Track, type Participant } from "livekit-client";
import { MicIcon, MicOffIcon, UserXIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useConfirm } from "@/hooks/use-confirm";
import { generateAvatarUri } from "@/lib/avatar";
import type { MeetingPendingRequests } from "@/modules/meetings/types";

interface Props {
  meetingId: string;
  isOwner: boolean;
  /** Pending knocks, polled by CallActive so the badge/chime work while the panel is closed. */
  pendingRequests: MeetingPendingRequests;
  onClose: () => void;
}

// Tokens put the user's avatar in participant metadata (see createLiveKitToken).
const participantImage = (participant: Participant) => {
  try {
    const image = (JSON.parse(participant.metadata ?? "{}") as { image?: string })
      .image;
    if (image) return image;
  } catch {
    // fall through to a generated avatar
  }
  return generateAvatarUri({
    seed: participant.name || participant.identity,
    variant: "initials",
  });
};

const rowButtonClass =
  "size-7 p-0 text-white/70 hover:text-white hover:bg-white/10";

// One row per human in the meeting. Split out so each row can subscribe to its
// own mic-mute state without re-rendering the whole panel.
const ParticipantRow = ({
  participant,
  meetingId,
  isOwner,
  hostUserId,
}: {
  participant: Participant;
  meetingId: string;
  isOwner: boolean;
  hostUserId: string | null;
}) => {
  const trpc = useTRPC();
  const micMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
  });

  const [KickConfirm, confirmKick] = useConfirm(
    `Remove ${participant.name || "this participant"}?`,
    "They will leave the meeting immediately. They can ask to join again.",
  );

  const kick = useMutation(
    trpc.meeting.kickParticipant.mutationOptions({
      onError: (error) =>
        toast.error(error.message || "Failed to remove participant"),
    }),
  );
  const mute = useMutation(
    trpc.meeting.muteParticipant.mutationOptions({
      onError: (error) =>
        toast.error(error.message || "Failed to mute participant"),
    }),
  );

  const handleKick = async () => {
    const ok = await confirmKick();
    if (!ok) return;
    kick.mutate({ meetingId, participantIdentity: participant.identity });
  };

  const isSelf = participant.isLocal;
  const isHost = hostUserId !== null && participant.identity === hostUserId;

  return (
    <div className="flex items-center gap-x-2">
      <KickConfirm />
      <Avatar className="size-8">
        <AvatarImage src={participantImage(participant)} alt="Avatar" />
        <AvatarFallback>
          {(participant.name || "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">
          {participant.name || participant.identity}
          {isSelf && <span className="text-white/50"> (You)</span>}
        </p>
        {isHost && <p className="text-xs text-white/50">Host</p>}
      </div>
      <div className="flex items-center gap-x-1 shrink-0">
        {/* MU-4 host controls: mute-for-everyone + kick. Never against self. */}
        {isOwner && !isSelf ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className={rowButtonClass}
              onClick={() =>
                mute.mutate({
                  meetingId,
                  participantIdentity: participant.identity,
                })
              }
              disabled={micMuted || mute.isPending}
              title={
                micMuted ? "Microphone is off" : "Mute for everyone"
              }
            >
              {micMuted ? (
                <MicOffIcon className="size-4" />
              ) : (
                <MicIcon className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`${rowButtonClass} hover:text-red-400`}
              onClick={handleKick}
              disabled={kick.isPending}
              title="Remove from the meeting"
            >
              <UserXIcon className="size-4" />
            </Button>
          </>
        ) : (
          <span
            className="text-white/50"
            title={micMuted ? "Microphone off" : "Microphone on"}
          >
            {micMuted ? (
              <MicOffIcon className="size-4" />
            ) : (
              <MicIcon className="size-4" />
            )}
          </span>
        )}
      </div>
    </div>
  );
};

// MU-5: the Google-Meet-style People side panel — everyone in the meeting plus
// (for the host) the persistent waiting-to-join list. Supersedes the floating
// MU-3 knock panel, which vanished whenever no request was pending.
export const PeoplePanel = ({
  meetingId,
  isOwner,
  pendingRequests,
  onClose,
}: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { metadata } = useRoomInfo();

  // The room metadata carries the host's user id (set at room creation) —
  // participant identities are user ids, so this labels the host row.
  const hostUserId = useMemo(() => {
    try {
      return (
        (JSON.parse(metadata ?? "{}") as { hostUserId?: string }).hostUserId ??
        null
      );
    } catch {
      return null;
    }
  }, [metadata]);

  const participants = useParticipants();
  const humans = participants.filter(
    (participant) => participant.kind !== ParticipantKind.AGENT,
  );
  const agents = participants.filter(
    (participant) => participant.kind === ParticipantKind.AGENT,
  );

  const invalidateRequests = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.meeting.getPendingRequests.queryOptions({ meetingId })
        .queryKey,
    });

  const admit = useMutation(
    trpc.meeting.admit.mutationOptions({
      onError: (error) =>
        toast.error(error.message || "Failed to admit participant"),
      onSettled: invalidateRequests,
    }),
  );
  const deny = useMutation(
    trpc.meeting.deny.mutationOptions({
      onError: (error) =>
        toast.error(error.message || "Failed to deny participant"),
      onSettled: invalidateRequests,
    }),
  );

  return (
    // Mobile: overlay the whole stage (the tiles keep their size underneath);
    // sm+: a fixed-width inline sidebar next to the stage.
    <div className="absolute inset-0 z-20 sm:static sm:z-auto sm:w-80 sm:shrink-0 rounded-lg bg-[#101213] border border-white/10 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="text-sm font-medium">People</p>
        <Button
          variant="ghost"
          size="sm"
          className={rowButtonClass}
          onClick={onClose}
          title="Close"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-y-5">
        {isOwner && pendingRequests.length > 0 && (
          <div className="flex flex-col gap-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-white/50">
              Waiting to join ({pendingRequests.length})
            </p>
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between gap-x-2"
              >
                <div className="flex items-center gap-x-2 min-w-0">
                  <Avatar className="size-8">
                    <AvatarImage
                      src={
                        request.userImage ??
                        generateAvatarUri({
                          seed: request.userName,
                          variant: "initials",
                        })
                      }
                      alt="Avatar"
                    />
                    <AvatarFallback>
                      {request.userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate">{request.userName}</span>
                </div>
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
        )}
        <div className="flex flex-col gap-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">
            In the meeting ({humans.length})
          </p>
          {humans.map((participant) => (
            <ParticipantRow
              key={participant.identity}
              participant={participant}
              meetingId={meetingId}
              isOwner={isOwner}
              hostUserId={hostUserId}
            />
          ))}
        </div>
        {agents.length > 0 && (
          <div className="flex flex-col gap-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-white/50">
              AI
            </p>
            {/* The agent is managed via the AI controls in the header, not here. */}
            {agents.map((agent) => (
              <div key={agent.identity} className="flex items-center gap-x-2">
                <Avatar className="size-8">
                  <AvatarImage
                    src={generateAvatarUri({
                      seed: agent.name || agent.identity,
                      variant: "botttsNeutral",
                    })}
                    alt="Avatar"
                  />
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
                <p className="text-sm truncate flex-1">
                  {agent.name || agent.identity}
                </p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70 shrink-0">
                  AI
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
