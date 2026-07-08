"use client";

import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  BotIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockArrowUpIcon,
  CornerDownRightIcon,
  LoaderIcon,
  PlusIcon,
  VideoIcon,
} from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";
import { MeetingStatus } from "@/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GeneratedAvatar } from "@/components/generated-avatar";

interface Props {
  userName: string;
}

// Same status treatment as the meetings table, kept local so the home module
// doesn't import the table column definitions.
const statusIconMap = {
  upcoming: ClockArrowUpIcon,
  active: LoaderIcon,
  processing: LoaderIcon,
  completed: CircleCheckIcon,
  cancelled: CircleXIcon,
};

const statusColorMap = {
  upcoming: "bg-yellow-500/20 text-yellow-800 border-yellow-800/5",
  active: "bg-blue-500/20 text-blue-800 border-blue-800/5",
  processing: "bg-gray-300/20 text-gray-800 border-gray-800/5",
  completed: "bg-emerald-500/20 text-emerald-800 border-emerald-800/5",
  cancelled: "bg-rose-500/20 text-rose-800 border-rose-800/5",
};

const StatusBadge = ({ status }: { status: string }) => {
  const Icon =
    statusIconMap[status as keyof typeof statusIconMap] ?? CircleXIcon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize [&>svg]:size-4 text-muted-foreground shrink-0",
        statusColorMap[status as keyof typeof statusColorMap],
      )}
    >
      <Icon className={cn(status === "processing" && "animate-spin")} />
      {status}
    </Badge>
  );
};

const StatTile = ({
  icon: Icon,
  label,
  value,
  iconClass,
  href,
}: {
  icon: typeof VideoIcon;
  label: string;
  value: number | undefined;
  iconClass: string;
  href: string;
}) => (
  <Link
    href={href}
    className="bg-white rounded-lg border p-5 flex items-center gap-x-4 transition-colors hover:border-primary/20 hover:bg-primary/[0.02]"
  >
    <div
      className={cn(
        "size-11 rounded-lg flex items-center justify-center shrink-0",
        iconClass,
      )}
    >
      <Icon className="size-5" />
    </div>
    <div className="flex flex-col">
      {value === undefined ? (
        <Skeleton className="h-7 w-10 mb-0.5" />
      ) : (
        <span className="text-2xl font-semibold leading-7">{value}</span>
      )}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  </Link>
);

const RowSkeleton = () => (
  <div className="flex items-center gap-x-3 px-4 py-3.5">
    <Skeleton className="size-9 rounded-full shrink-0" />
    <div className="flex-1 flex flex-col gap-y-1.5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);

export const HomeView = ({ userName }: Props) => {
  const trpc = useTRPC();

  // Recent meetings drives the list AND the total-meetings tile; the two
  // status-filtered queries only read `total`; agents drives list + tile.
  const { data: recent } = useQuery(
    trpc.meeting.getMany.queryOptions({ pageSize: 5 }),
  );
  const { data: upcoming } = useQuery(
    trpc.meeting.getMany.queryOptions({
      pageSize: 1,
      status: MeetingStatus.UPCOMING,
    }),
  );
  const { data: completed } = useQuery(
    trpc.meeting.getMany.queryOptions({
      pageSize: 1,
      status: MeetingStatus.COMPLETED,
    }),
  );
  const { data: agents } = useQuery(
    trpc.agent.getMany.queryOptions({ pageSize: 4 }),
  );

  const firstName = userName.split(" ")[0] || userName;

  return (
    <div className="flex-1 overflow-y-auto py-4 px-4 md:px-8 flex flex-col gap-y-4">
      {/* Hero — same brand gradient as the auth panels and call screens. */}
      <div className="relative overflow-hidden rounded-xl bg-radial from-sidebar-accent to-sidebar text-white p-6 md:p-10">
        <div className="relative z-10 flex flex-col gap-y-4 max-w-2xl">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Welcome back, {firstName}
          </h1>
          <p className="text-white/70 text-sm md:text-base">
            Spin up a meeting with an AI agent that listens, answers, and
            writes the summary for you — or build a new agent for your next
            conversation.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button asChild className="bg-white text-sidebar hover:bg-white/90">
              <Link href="/meetings">
                <PlusIcon />
                New meeting
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/agents">
                <BotIcon />
                New agent
              </Link>
            </Button>
          </div>
        </div>
        <Image
          src="/logo.svg"
          alt=""
          width={280}
          height={280}
          aria-hidden
          className="absolute -right-12 -bottom-16 opacity-10 pointer-events-none select-none hidden sm:block"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          icon={VideoIcon}
          label="Total meetings"
          value={recent?.total}
          iconClass="bg-blue-500/15 text-blue-700"
          href="/meetings"
        />
        <StatTile
          icon={ClockArrowUpIcon}
          label="Upcoming"
          value={upcoming?.total}
          iconClass="bg-yellow-500/15 text-yellow-700"
          href="/meetings?status=upcoming"
        />
        <StatTile
          icon={CircleCheckIcon}
          label="Completed"
          value={completed?.total}
          iconClass="bg-emerald-500/15 text-emerald-700"
          href="/meetings?status=completed"
        />
        <StatTile
          icon={BotIcon}
          label="Agents"
          value={agents?.total}
          iconClass="bg-violet-500/15 text-violet-700"
          href="/agents"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 pb-4">
        {/* Recent meetings */}
        <div className="lg:col-span-2 bg-white rounded-lg border overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3.5 border-b">
            <h2 className="font-medium">Recent meetings</h2>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href="/meetings">
                View all
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
          {!recent ? (
            <div className="divide-y">
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : recent.items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-y-3 px-4 py-12 text-center">
              <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                <VideoIcon className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No meetings yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first meeting and let an AI agent join you.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/meetings">
                  <PlusIcon />
                  New meeting
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {recent.items.map((meeting) => (
                <Link
                  key={meeting.id}
                  href={`/meetings/${meeting.id}`}
                  className="flex items-center gap-x-3 px-4 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <GeneratedAvatar
                    variant="botttsNeutral"
                    seed={meeting.agent.name}
                    className="size-9 border shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-y-0.5">
                    <div className="flex items-center gap-x-2">
                      <span className="font-medium truncate">
                        {meeting.name}
                      </span>
                      {!meeting.isOwner && (
                        <Badge
                          variant="outline"
                          className="bg-sky-500/20 text-sky-800 border-sky-800/5 shrink-0"
                        >
                          Shared
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-x-1.5 text-sm text-muted-foreground">
                      <CornerDownRightIcon className="size-3 shrink-0" />
                      <span className="truncate capitalize">
                        {meeting.agent.name}
                      </span>
                      {meeting.startedAt && (
                        <span className="shrink-0">
                          · {format(meeting.startedAt, "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={meeting.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agents */}
        <div className="bg-white rounded-lg border overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3.5 border-b">
            <h2 className="font-medium">Your agents</h2>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href="/agents">
                View all
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
          {!agents ? (
            <div className="divide-y">
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : agents.items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-y-3 px-4 py-12 text-center">
              <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                <BotIcon className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No agents yet</p>
                <p className="text-sm text-muted-foreground">
                  Agents are the AI personas that join your meetings.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/agents">
                  <PlusIcon />
                  New agent
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {agents.items.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="flex items-center gap-x-3 px-4 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <GeneratedAvatar
                    variant="botttsNeutral"
                    seed={agent.name}
                    className="size-9 border shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-y-0.5">
                    <span className="font-medium truncate capitalize">
                      {agent.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {agent.meetingCount}{" "}
                      {agent.meetingCount === 1 ? "meeting" : "meetings"}
                    </span>
                  </div>
                  <ArrowRightIcon className="size-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
