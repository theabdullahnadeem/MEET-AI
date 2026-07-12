import "server-only";

import { EncodedFileOutput, S3Upload } from "livekit-server-sdk";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import {
  livekitAgentDispatch,
  livekitEgressClient,
  livekitRoomService,
} from "@/lib/livekit";
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

/**
 * (Re)assert the LiveKit room with fresh metadata from the DB.
 *
 * The room is first created at meeting.create with the agent's persona in its
 * metadata — but with a 5-minute emptyTimeout. If nobody joins in time,
 * LiveKit closes the empty room, and a later join auto-creates a bare room
 * with NO metadata; the agent worker then reads empty metadata from the
 * dispatch job and exits ("Missing meetingId or agentId") — the AI silently
 * never joins any meeting entered >5 min after creation. There is also a race
 * where the connecting participant re-creates the room before this server
 * path runs. Both are fixed by ensuring the room exists AND carries current
 * metadata before every agent dispatch. Side effect: instruction edits made
 * after meeting creation now reach the next agent session.
 */
export async function ensureRoomReady(roomName: string) {
  try {
    const [meeting] = await db
      .select({
        meetingName: meetings.name,
        hostUserId: meetings.userId,
        agentId: agents.id,
        agentName: agents.name,
        agentInstructions: agents.instructions,
      })
      .from(meetings)
      .innerJoin(agents, eq(meetings.agentId, agents.id))
      .where(eq(meetings.id, roomName));

    if (!meeting) return; // meeting deleted meanwhile — nothing to assert

    // Same shape meeting.create writes and the agent worker (RoomMeta) reads.
    const metadata = JSON.stringify({
      meetingId: roomName,
      meetingName: meeting.meetingName,
      hostUserId: meeting.hostUserId,
      agentId: meeting.agentId,
      agentName: meeting.agentName,
      agentInstructions: meeting.agentInstructions,
    });

    // createRoom is idempotent: it returns the existing room (metadata
    // untouched) when one is already live — so patch metadata explicitly in
    // that case (covers the auto-created-bare-room race).
    const room = await livekitRoomService.createRoom({
      name: roomName,
      emptyTimeout: 300,
      maxParticipants: 50,
      metadata,
    });

    if (room.metadata !== metadata) {
      await livekitRoomService.updateRoomMetadata(roomName, metadata);
    }
  } catch (err) {
    // Non-fatal — dispatch still proceeds; worst case is the pre-fix
    // behaviour for this one meeting.
    console.error("[meeting-activation] Failed to ensure room metadata:", err);
  }
}

// K.2: dispatch and recording run CONCURRENTLY — the agent's arrival
// shouldn't wait for egress spin-up. Each branch is non-fatal on its own.
export async function activateMeetingResources(roomName: string) {
  // Must complete BEFORE dispatch: the worker reads the room metadata
  // snapshotted into the dispatch job.
  await ensureRoomReady(roomName);
  await Promise.all([dispatchAgentToRoom(roomName), startRoomRecording(roomName)]);
}
