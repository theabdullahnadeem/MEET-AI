import { NextRequest, NextResponse } from "next/server";
import {
  EncodedFileOutput,
  S3Upload,
  WebhookReceiver,
} from "livekit-server-sdk";
import { ParticipantInfo_Kind } from "@livekit/protocol";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { meetings } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { livekitEgressClient } from "@/lib/livekit";
import { MeetingStatus } from "@/constants";
import { rateLimitOk, clientIp } from "@/lib/ratelimit";
import { isNewWebhookEvent } from "@/lib/webhook-idempotency";

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

// Record the room to Cloudflare R2 (S3-compatible). The file path is
// deterministic so egress_ended can reconstruct the public URL.
async function startRecording(roomName: string) {
  try {
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
    );
    console.log(`[livekit-webhook] Started recording for room: ${roomName}`);
  } catch (err) {
    // Non-fatal — the meeting continues without a recording.
    console.error("[livekit-webhook] Failed to start egress:", err);
  }
}

// The LiveKit room is named after the meeting id (see meeting.create).
export async function POST(req: NextRequest) {
  // SEC-4 / F-04: rate-limit per IP (no-op until Upstash is configured).
  if (!(await rateLimitOk("webhook", clientIp(req)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.text();
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

    // The update only changes a row on the FIRST human join (status was
    // upcoming), so recording starts exactly once per meeting.
    if (activated) {
      await startRecording(roomName);
    }

    return NextResponse.json({ status: "ok" });
  }

  // The room closed (fires once, after it empties out past emptyTimeout). This is
  // the multi-user-safe end signal — we deliberately do NOT end on participant_left,
  // so one of several humans leaving never ends the meeting for everyone.
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
          recordingUrl: `${process.env.R2_PUBLIC_URL}/recordings/${egressRoom}.mp4`,
        })
        .where(eq(meetings.id, egressRoom));
    }

    return NextResponse.json({ status: "ok" });
  }

  return NextResponse.json({ status: "ignored" });
}
