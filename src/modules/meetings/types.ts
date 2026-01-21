import { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/trpc/routers/_app";

export type MeetingGetOne = inferRouterOutputs<AppRouter>["meeting"]["getOne"];
export type MeetingGetMany = inferRouterOutputs<AppRouter>["meeting"]["getMany"]["items"];