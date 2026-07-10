import { polarClient } from "@/lib/polar";
import {
    createTRPCRouter,
    protectedProcedure
} from "@/trpc/init";
import { getPlanLimits, getPlanUsage } from "./quotas";

export const premiumRouter = createTRPCRouter({
    getCurrentSubscription: protectedProcedure.query(async ({ctx}) => {
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
    }),
    getProducts: protectedProcedure.query(async () => {
        const products = await polarClient.products.list({
            isArchived: false,
            isRecurring: true,
            sorting: ["price_amount"]
        });

        return products.result.items;
    }),
    // S-2: usage vs plan limits, for free AND paid users (the name predates
    // that — kept so every existing invalidation of this query keeps working).
    // meetingCount is this calendar month; limits of null mean unlimited.
    getFreeUsage: protectedProcedure.query( async ({ctx}) => {
        const customer = await polarClient.customers.getStateExternal({
            externalId: ctx.auth.user.id
        });

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
