import {
  CircleXIcon,
  CircleCheckIcon,
  ClockArrowUpIcon,
  VideoIcon,
  LoaderIcon,
  AlertTriangleIcon,
} from "lucide-react";

import { CommandSelect } from "@/components/command-select";

import { MeetingStatus } from "@/constants";
import { useMeetingsFilter } from "../../hooks/use-meetings-filter";

const options = [
  {
    id: MeetingStatus.UPCOMING,
    value: MeetingStatus.UPCOMING,
    children: (
      <div className="flex items-center gap-x-2 capitalize">
        <ClockArrowUpIcon />
        {MeetingStatus.UPCOMING}
      </div>
    ),
  },
  {
    id: MeetingStatus.COMPLETED,
    value: MeetingStatus.COMPLETED,
    children: (
      <div className="flex items-center gap-x-2 capitalize">
        <CircleCheckIcon />
        {MeetingStatus.COMPLETED}
      </div>
    ),
  },
  {
    id: MeetingStatus.CANCELLED,
    value: MeetingStatus.CANCELLED,
    children: (
      <div className="flex items-center gap-x-2 capitalize">
        <CircleXIcon />
        {MeetingStatus.CANCELLED}
      </div>
    ),
  },
  {
    id: MeetingStatus.FAILED,
    value: MeetingStatus.FAILED,
    children: (
      <div className="flex items-center gap-x-2 capitalize">
        <AlertTriangleIcon />
        {MeetingStatus.FAILED}
      </div>
    ),
  },
  {
    id: MeetingStatus.ACTIVE,
    value: MeetingStatus.ACTIVE,
    children: (
      <div className="flex items-center gap-x-2 capitalize">
        <VideoIcon />
        {MeetingStatus.ACTIVE}
      </div>
    ),
  },
  {
    id: MeetingStatus.PROCESSING,
    value: MeetingStatus.PROCESSING,
    children: (
      <div className="flex items-center gap-x-2 capitalize">
        <LoaderIcon />
        {MeetingStatus.PROCESSING}
      </div>
    ),
  },
];

export const StatusFilter = () => {
  const [filters, setFilters] = useMeetingsFilter();

  return (
    <CommandSelect
      placeholder="Status"
      className="h-9"
      options={options}
      onSelect={(value) => setFilters({ status: value as MeetingStatus })}
      value={filters.status ?? ""}
    />
  );
};
