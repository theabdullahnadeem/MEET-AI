import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { auth } from "@/lib/auth";
import { MeetingStatus } from "@/constants";
import { getQueryClient, trpc } from "@/trpc/server";
import { HomeView } from "@/modules/home/ui/views/home-view";

const Page = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Prefetch everything the dashboard shows so it paints with data instead
  // of skeletons; HomeView reads these via useQuery (non-suspending, so a
  // failed query degrades to its skeleton rather than erroring the page).
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(
    trpc.meeting.getMany.queryOptions({ pageSize: 5 }),
  );
  void queryClient.prefetchQuery(
    trpc.meeting.getMany.queryOptions({
      pageSize: 1,
      status: MeetingStatus.UPCOMING,
    }),
  );
  void queryClient.prefetchQuery(
    trpc.meeting.getMany.queryOptions({
      pageSize: 1,
      status: MeetingStatus.COMPLETED,
    }),
  );
  void queryClient.prefetchQuery(
    trpc.agent.getMany.queryOptions({ pageSize: 4 }),
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeView userName={session.user.name} />
    </HydrationBoundary>
  );
};

export default Page;
