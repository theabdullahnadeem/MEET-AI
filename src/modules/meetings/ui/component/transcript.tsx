"use client";

import { useState } from "react";
import { format } from "date-fns";
import { DownloadIcon, SearchIcon } from "lucide-react";
import Highlighter from "react-highlight-words";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { generateAvatarUri } from "@/lib/avatar";
import { downloadTextFile, sanitizeFilename } from "@/lib/export-file";

interface Props {
  meetingId: string;
  meetingName?: string;
}

export const Transcript = ({ meetingId, meetingName }: Props) => {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.meeting.getTranscript.queryOptions({ id: meetingId }),
  );

  const [searcQuery, setSearchQuery] = useState("");
  const filteredData = (data ?? []).filter((item) =>
    item.text.toString().toLowerCase().includes(searcQuery.toLowerCase()),
  );

  // C.6: export the full (unfiltered) transcript as speaker-labelled text.
  const downloadTranscript = () => {
    if (!data || data.length === 0) return;
    const lines = data.map(
      (item) =>
        `[${format(new Date(0, 0, 0, 0, 0, 0, item.start_ts), "mm:ss")}] ${item.user.name}: ${item.text}`,
    );
    downloadTextFile(
      `${sanitizeFilename(meetingName ?? meetingId)} transcript.txt`,
      lines.join("\n"),
    );
  };

  return (
    <div className="bg-white rounded-lg border px-4 py-5 flex flex-col gap-y-4 w-full">
      <p className="text-sm font-medium">Transcript</p>
      <div className="flex items-center justify-between gap-x-2">
        <div className="relative">
          <Input
            placeholder="Search Transcript"
            className="pl-7 h-9 w-[240px]"
            value={searcQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadTranscript}
          disabled={!data || data.length === 0}
        >
          <DownloadIcon />
          Download
        </Button>
      </div>
      <ScrollArea>
        <div className="flex flex-col gap-y-4">
            {filteredData.map((item)=>{
                return (
                    <div key={item.start_ts} className="flex flex-col gap-y-2 hover:bg-muted p-4 rounded-md border">
                        <div className="flex gap-x-2 items-center">
                            <Avatar className="size-6">
                                <AvatarImage src={item.user.image ?? generateAvatarUri({seed: item.user.name, variant: "initials"})} alt="user avatar" />
                            </Avatar>
                            <p className="text-sm font-medium">{item.user.name}</p>
                            <p className="text-sm text-blue-500 font-medium">
                                {format(
                                    new Date(0,0,0,0,0,0, item.start_ts),
                                    "mm:ss"
                                )}
                            </p>
                        </div>
                        <Highlighter
                            className="text-sm text-neutral-700"
                            searchWords={[searcQuery]}
                            textToHighlight={item.text}
                            highlightClassName="bg-yellow-200"
                            autoEscape={true}
                        />
                    </div>
                )
            })}
        </div>
      </ScrollArea>
    </div>
  );
};
