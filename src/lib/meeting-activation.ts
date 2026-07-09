import "server-only";

import { EncodedFileOutput, S3Upload } from "livekit-server-sdk";

import { livekitAgentDispatch, livekitEgressClient } from "@/lib/livekit";
import { MEETING_AGENT_NAME } from "@/modules/call/agent-protocol";

// First-human-join side effects (agent dispatch + recording), shared by the
// two activation paths:
//  - meeting.activateMeeting (tRPC) — fired from the client at the moment the
//    user clicks "Join Meeting", so the agent arrives within a couple of
//    seconds of them (no webhook round-trip / cold start in the way);
//  - the LiveKit participant_joined webhook — the fallback when the client
//    call never happens (older tab, network hiccup).
// Exactly-once is guaranteed by the caller's atomic upcoming→active status
// flip, not here.

// Record the room to Cloudflare R2 (S3-compatible). The file path is
// deterministic so egress_ended can reconstruct the object key.
export async function startRoomRecording(roomName: string) {
  try {
    // Record through the app's own template (/egress-template) so the video
    // shows what participants see — tiles with name/avatar placeholders when
    // cameras are off, screen shares, etc. — instead of the default
    // template's black screen when no camera is published. Falls back to the
    // default LiveKit template if NEXT_PUBLIC_APP_URL is unset.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    await livekitEgressClient.startRoomCompositeEgress(
      roomName,
      new EncodedFileOutput({
        filepath: `recordings/${roomName}.mp4`,
        output: {
          case: "s3",
          value: new S3Upload({
            accessKey: process.env.R2_ACCESS_KEY_ID!,
            secret: process.env.R2_SECRET_ACCESS_KEY!,
            bucket: process.env.R2_BUCKET!,
            endpoint: process.env.R2_ENDPOINT!,
            region: "auto",
          }),
        },
      }),
      appUrl ? { customBaseUrl: `${appUrl}/egress-template` } : {},
    );
    console.log(`[meeting-activation] Started recording for room: ${roomName}`);
  } catch (err) {
    // Non-fatal — the meeting continues without a recording.
    console.error("[meeting-activation] Failed to start egress:", err);
  }
}

// C.2: the worker is a NAMED agent (no automatic dispatch), so activation is
// when we explicitly send the agent in.
export async function dispatchAgentToRoom(roomName: string) {
  try {
    await livekitAgentDispatch.createDispatch(roomName, MEETING_AGENT_NAME);
    console.log(`[meeting-activation] Dispatched agent to room: ${roomName}`);
  } catch (err) {
    // Non-fatal — the meeting continues without the agent; the host can
    // add it from the call header.
    console.error("[meeting-activation] Failed to dispatch agent:", err);
  }
}

// K.2: dispatch and recording run CONCURRENTLY — the agent's arrival
// shouldn't wait for egress spin-up. Each branch is non-fatal on its own.
export async function activateMeetingResources(roomName: string) {
  await Promise.all([dispatchAgentToRoom(roomName), startRoomRecording(roomName)]);
}
