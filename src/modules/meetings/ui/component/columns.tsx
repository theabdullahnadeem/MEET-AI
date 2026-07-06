"use client";

import { ColumnDef } from "@tanstack/react-table";
import {format} from "date-fns";
import { MeetingGetMany } from "../../types";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { 
  CircleCheckIcon,
  CircleXIcon,
  CornerDownRightIcon,
  ClockArrowUpIcon,
  ClockFadingIcon,
  LoaderIcon
 } from "lucide-react";

import { cn, formatDuration } from "@/lib/utils"; 
import { Badge } from "@/components/ui/badge";

const statusIconMap = {
  upcoming: ClockArrowUpIcon,
  active: LoaderIcon,
  processing: LoaderIcon,
  completed: CircleCheckIcon,
  cancelled: CircleXIcon,
}

const statusColorMap = {
  upcoming: "bg-yellow-500/20 text-yellow-800 border-yellow-800/5",
  active: "bg-blue-500/20 text-blue-800 border-blue-800/5", 
  processing: "bg-gray-300/20 text-gray-800 border-gray-800/5",
  completed: "bg-emerald-500/20 text-emerald-800 border-emerald-800/5",
  cancelled: "bg-rose-500/20 text-rose-800 border-rose-800/5",
}

export const columns: ColumnDef<MeetingGetMany[number]>[] = [
  {
    accessorKey: "name",
    header: "Meeting Name",
    cell: ({ row }) => (
      <div className="flex flex-col gap-y-1">
        <div className="flex items-center gap-x-2">
          <span className="font-semibold">{row.original.name}</span>
          {!row.original.isOwner && (
            <Badge
              variant="outline"
              className="bg-sky-500/20 text-sky-800 border-sky-800/5"
            >
              Shared
            </Badge>
          )}
        </div>
            <div className="flex items-center gap-x-2">
              <div className="flex items-center gap-x-1">
                <CornerDownRightIcon className="size-3 text-muted-foreground" />
                <span className="text-muted-foreground text-sm max-w-[200px] truncate capitalize">
                    {row.original.agent.name}
                </span>
              </div>
              <GeneratedAvatar 
                variant="botttsNeutral"
                seed={row.original.agent.name}
                className="size-4"
              />
              <span className="text-sm text-muted-foreground">
                {row.original.startedAt? format(row.original.startedAt, "MMM d") : ""}
              </span>
            </div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell:({row})=>{
      const Icon = statusIconMap[row.original.status as keyof typeof statusIconMap] ?? CircleXIcon;

      return(
        <Badge
          variant="outline"
          className={cn(
            "capitalize [&>svg]:size-4 text-muted-foreground",
            statusColorMap[row.original.status as keyof typeof statusColorMap]
          )}
        >
          <Icon
            className={cn(
              row.original.status === "processing" && "animate-spin"
            )}
          />
          {row.original.status}
        </Badge>
      )
    },
  },
  {
    accessorKey: "duration",
    header: "Duration",
    cell: ({ row }) => (
     <Badge 
      variant="outline"
      className="capitalize [&>svg]:size-4 flex items-center gap-x-2"
     >
      <ClockFadingIcon className="text-blue-700" />
      {row.original.duration? formatDuration(row.original.duration) : "-"}
     </Badge>
    ),
  },
];
