"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PlusIcon, XCircleIcon } from "lucide-react";
import { NewMeetingDialogue } from "./new-meeting-dialogue";
import { useState } from "react";
import { SearchFilter } from "./meetings-search-filter";
import { StatusFilter } from "./status-filter";
import { AgentIdFilter } from "./agent-id-filter";
import { useMeetingsFilter } from "../../hooks/use-meetings-filter";
import { DEFAULT_PAGE } from "@/constants";

export const ListHeader = () => {
  const [filters, setFilters] = useMeetingsFilter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isAnyFilterModified =
    !!filters.agentId || !!filters.status || !!filters.search;

  const onClearFilters = () => {
    setFilters({
      status: null,
      agentId: null,
      search: "",
      page: DEFAULT_PAGE,
    });
  };

  return (
    <>
      <NewMeetingDialogue open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      <div className="py-4 px-4 md:px-8 flex flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <h5 className="font-medium text-xl">My Meetings</h5>
          <Button
            onClick={() => {
              setIsDialogOpen(true);
            }}
          >
            <PlusIcon />
            New Meeting
          </Button>
        </div>
        <ScrollArea>
        <div className="flex items-center gap-x-2 p-1">
          <SearchFilter />
          <StatusFilter />
          <AgentIdFilter />
          {isAnyFilterModified && (
            <Button
            variant="outline"
            size="sm"
            className="[&>svg]:text-emerald-500"
            onClick={onClearFilters}
            >
              <XCircleIcon />
              Clear Filters
            </Button>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      </div>
    </>
  );
};
