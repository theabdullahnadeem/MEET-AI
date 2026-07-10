import { auth } from "@/lib/auth";
import { polarClient } from "@/lib/polar";
import { getPlanLimits, getPlanUsage } from "@/modules/premium/server/quotas";
import { TRPCError, initTRPC } from "@trpc/server";
import { headers } from "next/headers";
import { cache } from "react";
export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { userId: "user_123" };
});
// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  // transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  return next({ ctx: { ...ctx, auth: session } });
});
// S-2: quota gate for creates. Free limits come from constants; paid limits
// come from the subscribed Polar product's metadata (maxAgents,
// maxMeetingsPerMonth — null/unset = unlimited, i.e. the pre-S-2 behaviour).
// Meeting quotas are per calendar month for everyone. Clients already
// redirect FORBIDDEN to /upgrade.
export const premiumProcedure = (entity: "meetings" | "agents") =>
  protectedProcedure.use(async ({ ctx, next }) => {
    const customer = await polarClient.customers.getStateExternal({
      externalId: ctx.auth.user.id,
    });

    const limits = await getPlanLimits(customer);
    const usage = await getPlanUsage(ctx.auth.user.id);

    if (
      entity === "meetings" &&
      limits.maxMeetingsPerMonth !== null &&
      usage.meetingCount >= limits.maxMeetingsPerMonth
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: limits.isPremium
          ? `Your ${limits.planName ?? "current"} plan includes ${limits.maxMeetingsPerMonth} meetings per month — you've used them all. Upgrade for more.`
          : "Free trial limit reached",
      });
    }

    if (
      entity === "agents" &&
      limits.maxAgents !== null &&
      usage.agentCount >= limits.maxAgents
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: limits.isPremium
          ? `Your ${limits.planName ?? "current"} plan includes ${limits.maxAgents} agents — remove one or upgrade for more.`
          : "Free trial limit reached",
      });
    }

    return next({ ctx: { ...ctx, customer } });
  });
