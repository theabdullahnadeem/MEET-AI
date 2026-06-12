import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createLiveKitToken } from "@/lib/livekit";
import { generateAvatarUri } from "@/lib/avatar";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomName = req.nextUrl.searchParams.get("room");
  if (!roomName) {
    return NextResponse.json({ error: "Missing room parameter" }, { status: 400 });
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
