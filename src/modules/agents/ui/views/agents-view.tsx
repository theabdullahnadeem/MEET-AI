"use client";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "../components/data-table";
import { columns } from "../components/columns";
import { EmptyState } from "@/components/empty-state";
import { AgentGetOne } from "../../types";
import { useAgentsFilter } from "@/app/(dashboard)/agents/hooks/use-agents-filter";
import { DataPagination } from "../components/data-pagination";

export const AgentsView = () => {

  const [filters, setFilters] = useAgentsFilter()

  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.agent.getMany.queryOptions({
    ...filters
  })) as {
    data: { items: AgentGetOne[]; total: number; totalPages: number };
  };

  return (
    <div className="flex-1 pb-4 px-4 md:px-8 flex flex-col gap-y-4">
      <DataTable data={data.items} columns={columns} />
      <DataPagination
        page={filters.page}
        totalPages={data.totalPages}
        onPageChange={(page)=>setFilters({page})}
      />
      {data.items.length === 0 && (
        <EmptyState
          title="Create Your First Agent"
          description="Each agent has its own personality and can be used to transcribe and summarize meetings. You can create as many agents as you want and call them in different meetings."
        />
      )}
    </div>
  );
};

export const AgentsViewLoading = () => {
  return (
    <LoadingState
      title="Loading Agents"
      description="Please wait while we load the agents"
    />
  );
};

export const AgentsViewError = () => {
  return (
    <ErrorState
      title="Error loading agents"
      description="Please try again later"
    />
  );
};
