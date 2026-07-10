import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { ParticipantInfo_Kind } from "@livekit/protocol";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { meetings } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { activateMeetingResources } from "@/lib/meeting-activation";
import { MeetingStatus } from "@/constants";
import { rateLimitOk, clientIp } from "@/lib/ratelimit";
import { isNewWebhookEvent } from "@/lib/webhook-idempotency";

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

// S-1: real LiveKit webhook events are a few KB — anything bigger is abuse.
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

// The LiveKit room is named after the meeting id (see meeting.create).
export async function POST(req: NextRequest) {
  // SEC-4 / F-04: rate-limit per IP (no-op until Upstash is configured).
  if (!(await rateLimitOk("webhook", clientIp(req)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // S-1: reject oversized payloads before buffering them (the header check
  // fast-rejects; the length check after covers chunked bodies).
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const body = await req.text();
  if (body.length > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 },
    );
  }

  let event;
  try {
    // receive() is async in livekit-server-sdk v2 and validates the JWT signature.
    event = await receiver.receive(body, authHeader);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  // F-07: idempotency — a replayed/retried webhook becomes a no-op (the handlers
  // below are also status-guarded). Fails open if the dedupe store is unavailable.
  if (event.id && !(await isNewWebhookEvent(`livekit:${event.id}`))) {
    return NextResponse.json({ status: "duplicate" });
  }

  const roomName = event.room?.name;

  // A human joined → mark the meeting active. Only STANDARD participants count;
  // the AI agent (kind AGENT) and any ingress/egress/SIP participants are skipped.
  if (event.event === "participant_joined") {
    if (!roomName) {
      return NextResponse.json({ status: "skipped: no room name" });
    }
    if (event.participant?.kind !== ParticipantInfo_Kind.STANDARD) {
      return NextResponse.json({ status: "skipped: non-human participant" });
    }

    const [activated] = await db
      .update(meetings)
      .set({ status: MeetingStatus.ACTIVE, startedAt: new Date() })
      .where(
        and(
          eq(meetings.id, roomName),
          eq(meetings.status, MeetingStatus.UPCOMING),
        ),
      )
      .returning();

    // The atomic upcoming→active flip means only one caller wins — normally
    // meeting.activateMeeting already did this at the user's Join click (for
    // a faster agent arrival), and this webhook is the fallback. Whoever wins
    // the flip dispatches the agent + starts the recording, exactly once.
    if (activated) {
      await activateMeetingResources(roomName);
    }

    return NextResponse.json({ status: "ok" });
  }

  // MU-4 host-departure policy (explicit product decision, reversing the
  // original "never end on participant_left" design): when the HOST leaves an
  // active meeting, it ends for everyone — after a grace period handled by
  // Inngest, so a page refresh lets the host reconnect without killing the call.
  if (event.event === "participant_left") {
    if (!roomName) {
      return NextResponse.json({ status: "skipped: no room name" });
    }
    if (event.participant?.kind !== ParticipantInfo_Kind.STANDARD) {
      return NextResponse.json({ status: "skipped: non-human participant" });
    }

    const identity = event.participant?.identity;
    const [meeting] = await db
      .select({ userId: meetings.userId, status: meetings.status })
      .from(meetings)
      .where(eq(meetings.id, roomName));

    if (
      meeting &&
      meeting.status === MeetingStatus.ACTIVE &&
      identity === meeting.userId
    ) {
      await inngest.send({
        name: "meetings/host-left",
        data: { meetingId: roomName, hostIdentity: identity },
      });
    }

    return NextResponse.json({ status: "ok" });
  }

  // The room closed (fires once, after it empties out past emptyTimeout, or
  // immediately when the room is deleted — agent guardrails / host departure).
  if (event.event === "room_finished") {
    if (!roomName) {
      return NextResponse.json({ status: "skipped: no room name" });
    }

    const [meeting] = await db
      .update(meetings)
      .set({ status: MeetingStatus.PROCESSING, endedAt: new Date() })
      .where(
        and(
          eq(meetings.id, roomName),
          eq(meetings.status, MeetingStatus.ACTIVE),
        ),
      )
      .returning();

    // Kick off summarization once a transcript exists (wired up in PR 6).
    if (meeting?.transcriptUrl) {
      await inngest.send({
        name: "meetings/processing",
        data: {
          meetingId: meeting.id,
          transcriptUrl: meeting.transcriptUrl,
        },
      });
    } else if (meeting) {
      // MU-4: no transcript yet. A force-ended room (host left / guardrails)
      // fires room_finished before the agent's upload lands — or the agent
      // never joined at all. Schedule a delayed finalize instead of leaving
      // the meeting stuck at "processing" forever.
      await inngest.send({
        name: "meetings/finalize",
        data: { meetingId: meeting.id },
      });
    }

    return NextResponse.json({ status: "ok" });
  }

  // Recording finished and uploaded → save its public URL on the meeting.
  if (event.event === "egress_ended") {
    const egressRoom = event.egressInfo?.roomName;
    const produced = (event.egressInfo?.fileResults?.length ?? 0) > 0;

    if (egressRoom && produced) {
      await db
        .update(meetings)
        .set({
          // SEC-5: store the object KEY — the bucket is private, and reads go
          // through /api/media/recording (presigned).
          recordingUrl: `recordings/${egressRoom}.mp4`,
        })
        .where(eq(meetings.id, egressRoom));
    }

    return NextResponse.json({ status: "ok" });
  }

  return NextResponse.json({ status: "ignored" });
}
