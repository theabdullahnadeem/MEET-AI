import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { meetings, meetingJoinRequests } from "@/db/schema";
import { headers } from "next/headers";
import { createLiveKitToken } from "@/lib/livekit";
import { generateAvatarUri } from "@/lib/avatar";
import { rateLimitOk } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomName = req.nextUrl.searchParams.get("room");
  if (!roomName) {
    return NextResponse.json({ error: "Missing room parameter" }, { status: 400 });
  }

  // SEC-4 / F-04: rate-limit per user (no-op until Upstash is configured).
  if (!(await rateLimitOk("token", session.user.id))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // F-01 / SEC-1 + MU-3: authorize the caller against the meeting before
  // issuing a token — the owner, OR a guest whose join request the host
  // approved (knock-to-join). Deny-by-default.
  const [meeting] = await db
    .select({ id: meetings.id, userId: meetings.userId })
    .from(meetings)
    .where(eq(meetings.id, roomName));

  if (!meeting) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isOwner = meeting.userId === session.user.id;

  if (!isOwner) {
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

  const userImage =
    session.user.image ??
    generateAvatarUri({ seed: session.user.name, variant: "initials" });

  const token = await createLiveKitToken(
    session.user.id,
    session.user.name,
    userImage,
    roomName,
    // MU-4: the host gets roomAdmin (kick/mute); guests get normal perms.
    { roomAdmin: isOwner },
  );

  return NextResponse.json({ token });
}
