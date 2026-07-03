import { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/trpc/routers/_app";

export type MeetingGetOne = inferRouterOutputs<AppRouter>["meeting"]["getOne"];
export type MeetingGetForCall = inferRouterOutputs<AppRouter>["meeting"]["getForCall"];
export type MeetingGetMany = inferRouterOutputs<AppRouter>["meeting"]["getMany"]["items"];

export type StreamTrancriptItem = {
    speaker_id: string;
    type: string;
    text: string;
    start_ts: number;
    stop_ts: number;
};