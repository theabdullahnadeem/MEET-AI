import "server-only";

import { AccessToken, AgentDispatchClient, RoomServiceClient, EgressClient } from "livekit-server-sdk";

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

// C.2: explicit (named) agent dispatch — used to add the agent to a room,
// both on first human join (webhook) and when the host re-adds it mid-meeting.
export const livekitAgentDispatch = new AgentDispatchClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

export async function createLiveKitToken(
  userId: string,
  userName: string,
  userImage: string,
  roomName: string,
  options?: { roomAdmin?: boolean },
  // S-3: 15 minutes (was 1 h). The token is only checked when CONNECTING —
  // an established session never expires mid-call, and the client re-fetches
  // a token whenever it (re)joins. The short TTL shrinks the window in which
  // a kicked guest could reuse a cached token to slip back into the room.
  ttlSeconds = 900,
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
    // MU-4: the meeting host gets room-admin permissions; guests don't.
    roomAdmin: options?.roomAdmin ?? false,
  });

  return token.toJwt();
}
