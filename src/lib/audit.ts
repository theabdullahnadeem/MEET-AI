import "server-only";

import { db } from "@/db";
import { auditLog } from "@/db/schema";

// S-6: append-only audit trail. Writes are best-effort and never throw — an
// audit failure must not block the action being audited (it is logged so a
// misconfigured table shows up in Vercel logs, e.g. before db:push ran).

export type AuditAction =
  | "auth.sign_in"
  | "account.deleted"
  | "meeting.deleted"
  | "meeting.admit"
  | "meeting.deny"
  | "meeting.kick"
  | "meeting.mute"
  | "meeting.agent_added"
  | "meeting.agent_removed";

export async function audit(entry: {
  actorId: string;
  action: AuditAction;
  targetId?: string;
  meetingId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetId: entry.targetId,
      meetingId: entry.meetingId,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    });
  } catch (err) {
    console.error(`[audit] failed to record ${entry.action}:`, err);
  }
}
