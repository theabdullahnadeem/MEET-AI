import "server-only";

import { AccessToken, RoomServiceClient, EgressClient } from "livekit-server-sdk";

if (!process.env.LIVEKIT_API_KEY) throw new Error("LIVEKIT_API_KEY is not set");
if (!process.env.LIVEKIT_API_SECRET) throw new Error("LIVEKIT_API_SECRET is not set");
if (!process.env.LIVEKIT_URL) throw new Error("LIVEKIT_URL is not set");

export const livekitRoomService = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

export const livekitEgressClient = new EgressClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

export async function createLiveKitToken(
  userId: string,
  userName: string,
  userImage: string,
  roomName: string,
  ttlSeconds = 3600,
): Promise<string> {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: userId,
      name: userName,
      metadata: JSON.stringify({ image: userImage }),
      ttl: ttlSeconds,
    },
  );

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: false,
  });

  return token.toJwt();
}
