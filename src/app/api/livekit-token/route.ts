import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { meetings } from "@/db/schema";
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

  // F-01 / SEC-1: authorize the caller against the meeting before issuing a token.
  // `room` IS the meeting id; today only the owner may join (deny-by-default).
  // When knock-to-join (MU-3) lands, widen this to "owner OR approved membership".
  const [meeting] = await db
    .select({ id: meetings.id, userId: meetings.userId })
    .from(meetings)
    .where(eq(meetings.id, roomName));

  if (!meeting || meeting.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userImage =
    session.user.image ??
    generateAvatarUri({ seed: session.user.name, variant: "initials" });

  const token = await createLiveKitToken(
    session.user.id,
    session.user.name,
    userImage,
    roomName,
  );

  return NextResponse.json({ token });
}
