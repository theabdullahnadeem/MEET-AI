import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient, trpc } from "@/trpc/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { UpgradeView, UpgradeViewError, UpgradeViewLoading } from "@/modules/premium/ui/views/upgrade-view";


const Page = async () => {

    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session?.user) {
        redirect("/sign-in")
    }

    const queryClient = getQueryClient();
    // AWAITED (not void): dehydrate settled data instead of streaming pending
    // promises. If a streamed promise rejects, useSuspenseQuery retries during
    // SSR through the cookie-less HTTP link → 401 → React #419 fallback. With
    // settled data the suspense render reads straight from the cache.
    await Promise.all([
        queryClient.prefetchQuery(
            trpc.premium.getCurrentSubscription.queryOptions()
        ),
        queryClient.prefetchQuery(
            trpc.premium.getProducts.queryOptions()
        ),
        queryClient.prefetchQuery(
            trpc.premium.getFreeUsage.queryOptions()
        ),
    ])

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <Suspense fallback={<UpgradeViewLoading />} >
                <ErrorBoundary fallback={<UpgradeViewError />} >
                    <UpgradeView />
                </ErrorBoundary>
            </Suspense>
        </HydrationBoundary>
    )
}

export default Page;