import "server-only";

import { count, eq, gte, and } from "drizzle-orm";
import { startOfMonth } from "date-fns";

import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import { polarClient } from "@/lib/polar";
import { MAX_FREE_AGENTS, MAX_FREE_MEETINGS } from "../constants";

// S-2: plan quotas. Paid limits live in the Polar product's metadata
// (maxAgents, maxMeetingsPerMonth) so pricing can be tuned from the Polar
// dashboard without a deploy. A missing/invalid metadata value means
// UNLIMITED — which is exactly the pre-S-2 behaviour, so products that
// haven't been configured yet keep working.

export interface PlanLimits {
  /** Product name for display; null = free tier. */
  planName: string | null;
  isPremium: boolean;
  /** Max agents owned at once; null = unlimited. */
  maxAgents: number | null;
  /** Max meetings created per calendar month; null = unlimited. */
  maxMeetingsPerMonth: number | null;
}

export interface PlanUsage {
  /** Agents currently owned (agents are persistent, so this is a total). */
  agentCount: number;
  /** Meetings created since the start of the current calendar month. */
  meetingCount: number;
}

const toLimit = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
};

export async function getPlanLimits(customer: {
  activeSubscriptions: { productId: string }[];
}): Promise<PlanLimits> {
  const subscription = customer.activeSubscriptions[0];

  if (!subscription) {
    return {
      planName: null,
      isPremium: false,
      maxAgents: MAX_FREE_AGENTS,
      maxMeetingsPerMonth: MAX_FREE_MEETINGS,
    };
  }

  try {
    const product = await polarClient.products.get({
      id: subscription.productId,
    });

    return {
      planName: product.name,
      isPremium: true,
      maxAgents: toLimit(product.metadata.maxAgents),
      maxMeetingsPerMonth: toLimit(product.metadata.maxMeetingsPerMonth),
    };
  } catch (err) {
    // Fail-open (unlimited): a Polar hiccup must never block a paying
    // customer from creating a meeting.
    console.error("[quotas] Failed to load product limits:", err);
    return {
      planName: null,
      isPremium: true,
      maxAgents: null,
      maxMeetingsPerMonth: null,
    };
  }
}

export async function getPlanUsage(userId: string): Promise<PlanUsage> {
  const [userAgents] = await db
    .select({ count: count(agents.id) })
    .from(agents)
    .where(eq(agents.userId, userId));

  const [userMeetings] = await db
    .select({ count: count(meetings.id) })
    .from(meetings)
    .where(
      and(
        eq(meetings.userId, userId),
        // Quotas are per calendar month — old meetings never lock an
        // account forever (the free tier used to be 1 meeting EVER).
        gte(meetings.createdAt, startOfMonth(new Date())),
      ),
    );

  return {
    agentCount: userAgents.count,
    meetingCount: userMeetings.count,
  };
}
