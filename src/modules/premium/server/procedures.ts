import { polarClient } from "@/lib/polar";
import {
    createTRPCRouter,
    protectedProcedure
} from "@/trpc/init";
import { getPlanLimits, getPlanUsage } from "./quotas";

export const premiumRouter = createTRPCRouter({
    // Both Polar reads are guarded: a Polar-side hiccup or a product edited
    // into an unexpected shape must degrade the upgrade page, not crash it
    // (Next redacts server errors in prod, which made this class of failure
    // undebuggable — the console.error below is what shows up in Vercel logs).
    getCurrentSubscription: protectedProcedure.query(async ({ctx}) => {
        try {
            const customer = await polarClient.customers.getStateExternal({
                externalId: ctx.auth.user.id
            });

            const subscription = customer.activeSubscriptions[0];

            if(!subscription){
                return null;
            }

            const product = await polarClient.products.get({
                id: subscription.productId,
            });

            return product;
        } catch (err) {
            console.error("[premium] getCurrentSubscription failed:", err);
            return null;
        }
    }),
    getProducts: protectedProcedure.query(async () => {
        try {
            const products = await polarClient.products.list({
                isArchived: false,
                isRecurring: true,
                sorting: ["price_amount"]
            });

            return products.result.items;
        } catch (err) {
            console.error("[premium] getProducts failed:", err);
            return [];
        }
    }),
    // S-2: usage vs plan limits, for free AND paid users (the name predates
    // that — kept so every existing invalidation of this query keeps working).
    // meetingCount is this calendar month; limits of null mean unlimited.
    // Returns null when Polar is unreachable — consumers hide the widget.
    getFreeUsage: protectedProcedure.query( async ({ctx}) => {
        let customer;
        try {
            customer = await polarClient.customers.getStateExternal({
                externalId: ctx.auth.user.id
            });
        } catch (err) {
            console.error("[premium] getFreeUsage failed:", err);
            return null;
        }

        const [limits, usage] = await Promise.all([
            getPlanLimits(customer),
            getPlanUsage(ctx.auth.user.id),
        ]);

        return {
            planName: limits.planName,
            isPremium: limits.isPremium,
            agentCount: usage.agentCount,
            agentLimit: limits.maxAgents,
            meetingCount: usage.meetingCount,
            meetingLimit: limits.maxMeetingsPerMonth,
        }
    })
})
