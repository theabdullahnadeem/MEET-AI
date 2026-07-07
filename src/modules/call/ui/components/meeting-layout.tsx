"use client";

import {
  CarouselLayout,
  GridLayout,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";

// C.4: the meeting stage, shared by the live call (CallActive) and the egress
// recording template so recordings always look like the meeting.
// - Nobody sharing: the usual camera grid (placeholder tiles when cams are off).
// - 1..N screens shared (multiple people can share at once): the screens take
//   the stage — side by side in a grid — and cameras drop to a strip below.
export const MeetingLayout = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const screenTracks = tracks.filter(
    (track) => track.source === Track.Source.ScreenShare,
  );
  const cameraTracks = tracks.filter(
    (track) => track.source !== Track.Source.ScreenShare,
  );

  if (screenTracks.length === 0) {
    return (
      <GridLayout tracks={tracks} className="flex-1 min-h-0">
        <ParticipantTile />
      </GridLayout>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <GridLayout tracks={screenTracks} className="flex-1 min-h-0">
        <ParticipantTile />
      </GridLayout>
      <div className="h-28 shrink-0">
        <CarouselLayout tracks={cameraTracks} orientation="horizontal">
          <ParticipantTile />
        </CarouselLayout>
      </div>
    </div>
  );
};
