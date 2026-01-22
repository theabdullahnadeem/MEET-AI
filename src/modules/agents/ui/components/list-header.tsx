"use client";

import { Button } from "@/components/ui/button"
import { PlusIcon, XCircleIcon } from "lucide-react";
import { NewAgentDialogue } from "./new-agent-dialogue";
import { useState } from "react";
import { useAgentsFilter } from "@/app/(dashboard)/agents/hooks/use-agents-filter";
import { SearchFilter } from "./agents-search-filter";
import { DEFAULT_PAGE } from "@/constants";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export const ListHeader = () => {

    const [filters,setFilters] = useAgentsFilter();
    const [isDialogueOpen,setIsDialogueOpen] = useState(false);

    const isAnyFilterModified = !!filters.search;

    const onClearFilters = () => {
        setFilters({
            search: "",
            page: DEFAULT_PAGE,
        })
    }

    return (
        <>
            <NewAgentDialogue open={isDialogueOpen} onOpenChange={setIsDialogueOpen} />
            <div className="py-4 px-4 md:px-8 flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
                <h5 className="font-medium text-xl">My Agents</h5>
                <Button onClick={()=>setIsDialogueOpen(true)}>
                    <PlusIcon />
                    New Agent
                </Button>
            </div>
            <ScrollArea>
            <div className="flex items-center gap-x-2 p-1">
                <SearchFilter />
                {isAnyFilterModified && (
                    <Button variant="outline" size="sm" onClick={onClearFilters}>
                        <XCircleIcon />
                        Clear
                    </Button>
                )}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
        </div>
        </>
    )
} 