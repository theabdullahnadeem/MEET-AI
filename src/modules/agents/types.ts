import { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/trpc/routers/_app";

export type AgentGetOne = inferRouterOutputs<AppRouter>["agent"]["getOne"];
export type AgentGetMany = inferRouterOutputs<AppRouter>["agent"]["getMany"]["items"];
