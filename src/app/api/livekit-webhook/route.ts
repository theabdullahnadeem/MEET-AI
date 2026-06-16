import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { ParticipantInfo_Kind } from "@livekit/protocol";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { meetings } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { MeetingStatus } from "@/constants";

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

// The LiveKit room is named after the meeting id (see meeting.create).
export async function POST(req: NextRequest) {
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

    await db
      .update(meetings)
      .set({ status: MeetingStatus.ACTIVE, startedAt: new Date() })
      .where(
        and(
          eq(meetings.id, roomName),
          eq(meetings.status, MeetingStatus.UPCOMING),
        ),
      );

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

  return NextResponse.json({ status: "ignored" });
}
