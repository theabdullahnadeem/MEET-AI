import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { meetings, meetingJoinRequests } from "@/db/schema";
import { presignR2Get, r2KeyFromStored } from "@/lib/r2";

// SEC-5 / F-03 + MU-3: authenticated access to meeting recordings. The R2
// bucket is private; the browser's <video> points here, and after the access
// check (owner OR admitted participant) we 302 to a short-lived presigned URL.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json(
      { error: "Missing meetingId parameter" },
      { status: 400 },
    );
  }

  const [meeting] = await db
    .select({
      id: meetings.id,
      userId: meetings.userId,
      recordingUrl: meetings.recordingUrl,
    })
    .from(meetings)
    .where(eq(meetings.id, meetingId));

  if (!meeting) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (meeting.userId !== session.user.id) {
    // MU-3: admitted participants may replay the meeting they were part of.
    const [approved] = await db
      .select({ id: meetingJoinRequests.id })
      .from(meetingJoinRequests)
      .where(
        and(
          eq(meetingJoinRequests.meetingId, meeting.id),
          eq(meetingJoinRequests.userId, session.user.id),
          eq(meetingJoinRequests.status, "approved"),
        ),
      );

    if (!approved) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!meeting.recordingUrl) {
    return NextResponse.json({ error: "No recording" }, { status: 404 });
  }

  // 1h TTL so long playback sessions and seek (range) requests don't outlive
  // the URL mid-viewing.
  const url = await presignR2Get(r2KeyFromStored(meeting.recordingUrl), 3600);

  return NextResponse.redirect(url, 302);
}
