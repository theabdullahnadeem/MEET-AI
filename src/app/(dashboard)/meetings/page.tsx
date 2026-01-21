import { auth } from "@/lib/auth";
import { ListHeader } from "@/modules/meetings/ui/component/list-header";
import { MeetingsView, MeetingsViewError, MeetingsViewLoading } from "@/modules/meetings/ui/views/meetings-view";
import { getQueryClient, trpc } from "@/trpc/server";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

const Page = async () => {

    const queryClient = getQueryClient();
    void queryClient.prefetchQuery(
        trpc.meeting.getMany.queryOptions({})
    );

    const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in")
  }



    return (
       <>
       <ListHeader />
        <HydrationBoundary state={dehydrate(queryClient)}>
         <Suspense fallback={<MeetingsViewLoading />}>
            <ErrorBoundary fallback={<MeetingsViewError />}>
                <MeetingsView />
            </ErrorBoundary>
         </Suspense>
        </HydrationBoundary>
       </>
    )
}



export default Page;