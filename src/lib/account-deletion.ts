import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { meetings } from "@/db/schema";
import { deleteR2Objects, r2KeyFromStored } from "@/lib/r2";
import { livekitRoomService } from "@/lib/livekit";
import { streamChat } from "@/lib/stream-chat";
import { polarClient } from "@/lib/polar";

// S-5: right-to-erasure. Runs as better-auth's beforeDelete hook — the DB
// rows themselves (meetings, agents, join requests, sessions, accounts, 2FA)
// all cascade from the user row via FKs, so this purges everything the
// database CANNOT reach: media in R2, chat data in Stream, live LiveKit
// rooms, and the Polar subscription (so a deleted account stops billing).
//
// Every step is best-effort: a vendor hiccup logs the orphan for manual
// cleanup but never blocks the erasure the user is legally entitled to.
export async function purgeUserData(userId: string): Promise<void> {
  const userMeetings = await db
    .select({
      id: meetings.id,
      status: meetings.status,
      recordingUrl: meetings.recordingUrl,
      transcriptUrl: meetings.transcriptUrl,
    })
    .from(meetings)
    .where(eq(meetings.userId, userId));

  // 1. Recordings + transcripts (same key set meeting.remove purges).
  const mediaKeys = new Set<string>();
  for (const meeting of userMeetings) {
    mediaKeys.add(`recordings/${meeting.id}.mp4`);
    mediaKeys.add(`transcripts/${meeting.id}.jsonl`);
    mediaKeys.add(`transcripts/${meeting.id}.en.jsonl`);
    if (meeting.recordingUrl) mediaKeys.add(r2KeyFromStored(meeting.recordingUrl));
    if (meeting.transcriptUrl) mediaKeys.add(r2KeyFromStored(meeting.transcriptUrl));
  }
  await deleteR2Objects([...mediaKeys]);

  // 2. End any meeting that is live right now (disconnects participants;
  // the room_finished webhook finds no rows after the cascade and no-ops).
  await Promise.all(
    userMeetings
      .filter((meeting) => meeting.status === "active")
      .map((meeting) =>
        livekitRoomService.deleteRoom(meeting.id).catch((err: unknown) => {
          console.error(`[account-deletion] Failed to end room ${meeting.id}:`, err);
        }),
      ),
  );

  // 3. Stream Chat: the post-meeting "Ask AI" channels + the user itself.
  if (userMeetings.length > 0) {
    try {
      await streamChat.deleteChannels(
        userMeetings.map((meeting) => `messaging:${meeting.id}`),
        { hard_delete: true },
      );
    } catch (err) {
      console.error("[account-deletion] Failed to delete chat channels:", err);
    }
  }
  try {
    await streamChat.deleteUsers([userId], { user: "hard", messages: "hard" });
  } catch (err) {
    console.error("[account-deletion] Failed to delete chat user:", err);
  }

  // 4. Cancel any active subscription so a deleted account stops billing.
  // Polar (merchant of record) retains invoices/tax records as legally
  // required — documented in docs/PRIVACY.md.
  try {
    const customer = await polarClient.customers.getStateExternal({
      externalId: userId,
    });
    for (const subscription of customer.activeSubscriptions) {
      await polarClient.subscriptions.revoke({ id: subscription.id });
      console.log(`[account-deletion] Revoked subscription ${subscription.id}`);
    }
  } catch (err) {
    console.error("[account-deletion] Failed to revoke subscription:", err);
  }
}
