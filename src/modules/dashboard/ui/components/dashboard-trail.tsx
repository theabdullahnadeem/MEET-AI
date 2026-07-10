"use client";

import Link from "next/link";
import { RocketIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {Progress} from "@/components/ui/progress";

// S-2: live plan-usage widget. Shows the current plan and this month's
// consumption against its limits — for free AND paid users (a limit of null
// means unlimited and renders without a bar). Every create/remove flow
// invalidates premium.getFreeUsage, so this updates in real time.
export const DashboardTrial = () => {
    const trpc = useTRPC();
    const { data } = useQuery(
        trpc.premium.getFreeUsage.queryOptions()
    );

    if(!data) {
        return null;
    }

    return (
        <div className="border border-border/10 rounded-lg w-full bg-white/5 flex flex-col gap-y-2">
            <div className="p-3 flex flex-col gap-y-4">
                <div className="flex items-center gap-2">
                    <RocketIcon className="size-4" />
                    <p className="text-sm font-medium">
                        {data.planName ?? "Free Trial"}
                    </p>
                </div>
                <div className="flex flex-col gap-y-2">
                    <p className="text-xs">
                        {data.agentLimit !== null
                            ? `${data.agentCount}/${data.agentLimit} Agents`
                            : `${data.agentCount} Agents · Unlimited`}
                    </p>
                    {data.agentLimit !== null && (
                        <Progress value={(data.agentCount / data.agentLimit) * 100} />
                    )}
                </div>
                <div className="flex flex-col gap-y-2">
                    <p className="text-xs">
                        {data.meetingLimit !== null
                            ? `${data.meetingCount}/${data.meetingLimit} Meetings this month`
                            : `${data.meetingCount} Meetings this month · Unlimited`}
                    </p>
                    {data.meetingLimit !== null && (
                        <Progress value={(data.meetingCount / data.meetingLimit) * 100} />
                    )}
                </div>
            </div>
            <Button
                className="bg-transparent border-t border-border/10 hover:bg-white/10 rounded-t-none"
                asChild
            >
                <Link href="/upgrade">
                    {data.isPremium ? "Manage plan" : "Upgrade"}
                </Link>
            </Button>
        </div>
    )
}
