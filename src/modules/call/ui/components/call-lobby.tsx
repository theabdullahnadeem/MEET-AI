"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  LogInIcon,
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { usePreviewTracks } from "@livekit/components-react";
import { LocalVideoTrack, Track } from "livekit-client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { RecordingConsentNotice } from "@/components/recording-consent-notice";
import { generateAvatarUri } from "@/lib/avatar";

export interface LobbyChoices {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

interface Props {
  onJoin: (choices: LobbyChoices) => void;
}

// Pre-join screen. This is intentionally rendered OUTSIDE of <LiveKitRoom> so
// the user is NOT connected to the room yet — the AI agent only dispatches once
// a participant actually connects, which now happens when "Join Meeting" is
// clicked (not while the user is still setting up here). usePreviewTracks gives
// a local camera/mic preview without any server connection and releases the
// devices when this component unmounts.
export const CallLobby = ({ onJoin }: Props) => {
  const { data } = authClient.useSession();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const videoEl = useRef<HTMLVideoElement>(null);

  const tracks = usePreviewTracks({
    audio: audioEnabled,
    video: videoEnabled,
  });

  const videoTrack = tracks?.find(
    (track): track is LocalVideoTrack => track.kind === Track.Kind.Video,
  );

  useEffect(() => {
    const el = videoEl.current;
    if (videoTrack && el) {
      videoTrack.attach(el);
      return () => {
        videoTrack.detach(el);
      };
    }
  }, [videoTrack]);

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
            {videoTrack && videoEnabled ? (
              <video
                ref={videoEl}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
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
            <Button
              type="button"
              variant={audioEnabled ? "secondary" : "outline"}
              size="icon"
              onClick={() => setAudioEnabled((v) => !v)}
              aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </Button>
            <Button
              type="button"
              variant={videoEnabled ? "secondary" : "outline"}
              size="icon"
              onClick={() => setVideoEnabled((v) => !v)}
              aria-label={videoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {videoEnabled ? <VideoIcon /> : <VideoOffIcon />}
            </Button>
          </div>
          {/* S-4: recording consent — participants must know before joining
              (two-party consent laws + GDPR transparency). */}
          <RecordingConsentNotice className="text-center max-w-64" />
          <div className="flex gap-x-2 justify-between w-full">
            <Button asChild variant="ghost">
              <Link href="/meetings">Cancel</Link>
            </Button>
            <Button onClick={() => onJoin({ audioEnabled, videoEnabled })}>
              <LogInIcon />
              Join Meeting
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
