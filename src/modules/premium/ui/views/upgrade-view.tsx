"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PricingCard } from "../components/pricing-card";

export const UpgradeView = () => {
    const trpc = useTRPC();
    const { data: currentSubscription } = useSuspenseQuery(
        trpc.premium.getCurrentSubscription.queryOptions()
    )
    const { data: products } = useSuspenseQuery(
        trpc.premium.getProducts.queryOptions()
    )
    const { data: usage } = useSuspenseQuery(
        trpc.premium.getFreeUsage.queryOptions()
    )
    return (
        <div className="flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-10">
            <div className="mt-4 flex-1 flex flex-col gap-y-10 items-center">
                <div className="flex flex-col items-center gap-y-2">
                    <h5 className="font-medium text-2xl md:text-3xl">
                        You are on the{" "}
                        <span className="font-semibold text-primary">
                            {currentSubscription?.name ?? "Free"}
                        </span>{" "}
                        plan
                    </h5>
                    {/* S-2: live usage against the plan's enforced limits. */}
                    <p className="text-sm text-muted-foreground">
                        {usage.meetingLimit !== null
                            ? `${usage.meetingCount} of ${usage.meetingLimit} meetings used this month`
                            : `${usage.meetingCount} meetings this month`}
                        {" · "}
                        {usage.agentLimit !== null
                            ? `${usage.agentCount} of ${usage.agentLimit} agents`
                            : `${usage.agentCount} agents`}
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {products.map((product) => {
                        const isCurrentProduct = currentSubscription?.id === product.id;
                        const isPremium = !!currentSubscription;

                        let buttonText = "Upgrade";
                        let onClick = () => authClient.checkout({products: [product.id]});

                        if(isCurrentProduct){
                            buttonText = "Manage";
                            onClick = () => authClient.customer.portal();
                        } else if(isPremium) {
                        buttonText = "Change Plan"
                        onClick = () => authClient.customer.portal();
                    }

                    return (
                        <PricingCard 
                            key={product.id}
                            buttonText={buttonText}
                            onClick={onClick}
                            variant={product.metadata.variant === "highlighted" ? "highlighted" : "default"}
                            title={product.name}
                            price={
                                product.prices[0].amountType === "fixed"
                                ? (product.prices[0].priceAmount / 100).toString()
                                : "0"
                            }
                            description={product.description}
                            priceSuffix={`/${product.prices[0].recurringInterval}`}
                            features={product.benefits.map(
                                (benefit) => benefit.description
                            )}
                            badge={product.metadata.badge as string | null}
                        /> 
                    )
                }
                )}
                </div>
            </div>
        </div>
    )
}

export const UpgradeViewLoading = () => {
    return (
        <LoadingState title="Loading subscription..." description="Please wait while we load your subscription." />
    )
}

export const UpgradeViewError = () => {
    return (
        <ErrorState title="Error loading subscription" description="Please try again later." />
    )
}