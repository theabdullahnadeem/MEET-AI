import { auth } from "@/lib/auth";
import { CallView } from "@/modules/call/ui/views/call-view";
import { getQueryClient, trpc } from "@/trpc/server";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

interface Props {
    params: Promise<{
        meetingId: string;
    }>;
}

const Page = async ({params}: Props) => {

    const session = await auth.api.getSession({
        headers: await headers(),
    });
    
    if (!session) {
         redirect('/sign-in');
    }

    const {meetingId} = await params;

    const queryClient = getQueryClient();
    // MU-2: call-scoped read (not owner-filtered) so guests can load the call
    // screen from a shared link. Room entry stays gated by the token endpoint.
    void queryClient.prefetchQuery(
        trpc.meeting.getForCall.queryOptions({
            id: meetingId
        })
    );

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <CallView meetingId={meetingId} />
        </HydrationBoundary>
    )

}

export default Page;