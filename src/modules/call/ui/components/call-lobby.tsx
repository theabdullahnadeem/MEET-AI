"use client";

import Link from "next/link";
import { LogInIcon } from "lucide-react";
import {
  useLocalParticipant,
  TrackToggle,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { generateAvatarUri } from "@/lib/avatar";

interface Props {
  onJoin: () => void;
}

export const CallLobby = ({ onJoin }: Props) => {
  const { data } = authClient.useSession();
  const { localParticipant, cameraTrack, isCameraEnabled } =
    useLocalParticipant();

  const avatarUrl =
    data?.user.image ??
    generateAvatarUri({ seed: data?.user.name ?? "", variant: "initials" });

  return (
    <div className="flex flex-col items-center justify-center h-full bg-radial from-sidebar-accent to-sidebar">
      <div className="py-4 px-8 flex flex-1 items-center justify-center flex-col gap-4">
        <div className="flex flex-col items-center justify-center gap-y-6 bg-background rounded-lg p-10 shadow-sm">
          <div className="flex flex-col gap-y-2 text-center">
            <h6 className="text-lg font-medium">Ready to join?</h6>
            <p className="text-sm text-muted-foreground">
              Set up your camera and microphone
            </p>
          </div>
          <div className="w-64 h-48 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            {cameraTrack && isCameraEnabled ? (
              <VideoTrack
                trackRef={{
                  participant: localParticipant,
                  publication: cameraTrack,
                  source: Track.Source.Camera,
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={data?.user.name ?? "You"}
                className="w-16 h-16 rounded-full"
              />
            )}
          </div>
          <div className="flex gap-x-2">
            <TrackToggle source={Track.Source.Microphone} />
            <TrackToggle source={Track.Source.Camera} />
          </div>
          <div className="flex gap-x-2 justify-between w-full">
            <Button asChild variant="ghost">
              <Link href="/meetings">Cancel</Link>
            </Button>
            <Button onClick={onJoin}>
              <LogInIcon />
              Join Meeting
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
