import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { presignR2Get, r2KeyFromStored } from "@/lib/r2";

// SEC-5 / F-03: authenticated access to meeting recordings. The R2 bucket is
// private; the browser's <video> points here, and after an ownership check we
// 302 to a short-lived presigned URL. When knock-to-join (MU-3) lands, widen
// the check to "owner OR approved membership" — keep deny-by-default.
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

  if (!meeting || meeting.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!meeting.recordingUrl) {
    return NextResponse.json({ error: "No recording" }, { status: 404 });
  }

  // 1h TTL so long playback sessions and seek (range) requests don't outlive
  // the URL mid-viewing.
  const url = await presignR2Get(r2KeyFromStored(meeting.recordingUrl), 3600);

  return NextResponse.redirect(url, 302);
}
