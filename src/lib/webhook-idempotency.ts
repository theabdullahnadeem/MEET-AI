import "server-only";

import { db } from "@/db";
import { webhookEvents } from "@/db/schema";

/**
 * Record a webhook event id and report whether it is the first time we have seen
 * it (F-07). Returns `true` if the event is NEW (process it) and `false` if it is
 * a DUPLICATE (skip it).
 *
 * Fails OPEN: if the dedupe store is unavailable — e.g. the `webhook_events` table
 * has not been migrated yet (`npm run db:push`), or a transient DB error — it
 * returns `true` so legitimate events are never dropped.
 */
export async function isNewWebhookEvent(eventId: string): Promise<boolean> {
  try {
    const inserted = await db
      .insert(webhookEvents)
      .values({ id: eventId })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    return inserted.length > 0;
  } catch (err) {
    console.error("[webhook-idempotency] failing open:", err);
    return true;
  }
}
