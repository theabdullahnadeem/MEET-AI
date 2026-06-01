"use client";

import { useState } from "react";
import { format } from "date-fns";
import { SearchIcon, PencilIcon, CheckIcon, XIcon } from "lucide-react";
import Highlighter from "react-highlight-words";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { generateAvatarUri } from "@/lib/avatar";

interface Props {
  meetingId: string;
}

export const Transcript = ({ meetingId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useQuery(
    trpc.meeting.getTranscript.queryOptions({ id: meetingId }),
  );

  const [searcQuery, setSearchQuery] = useState("");
  const [editingSpeaker, setEditingSpeaker] = useState<{
    speakerId: string;
    currentName: string;
  } | null>(null);
  const [editName, setEditName] = useState("");

  const updateSpeakerName = useMutation(
    trpc.meeting.updateSpeakerName.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.meeting.getTranscript.queryOptions({ id: meetingId })
        );
        setEditingSpeaker(null);
        setEditName("");
      },
    })
  );

  const handleStartEdit = (speakerId: string, currentName: string) => {
    setEditingSpeaker({ speakerId, currentName });
    setEditName(currentName);
  };

  const handleSaveEdit = () => {
    if (!editingSpeaker || !editName.trim()) return;
    updateSpeakerName.mutate({
      meetingId,
      speakerId: editingSpeaker.speakerId,
      name: editName.trim(),
    });
  };

  const handleCancelEdit = () => {
    setEditingSpeaker(null);
    setEditName("");
  };

  const filteredData = (data ?? []).filter((item) =>
    item.text.toString().toLowerCase().includes(searcQuery.toLowerCase()),
  );

  // Determine if a speaker name looks like an auto-generated fallback
  const isFallbackName = (name: string) =>
    name.startsWith("Participant ") || name === "Unknown";

  return (
    <div className="bg-white rounded-lg border px-4 py-5 flex flex-col gap-y-4 w-full">
      <p className="text-sm font-medium">Transcript</p>
      <div className="relative">
        <Input
          placeholder="Search Transcript"
          className="pl-7 h-9 w-[240px]"
          value={searcQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      </div>
      <ScrollArea>
        <div className="flex flex-col gap-y-4">
            {filteredData.map((item)=>{
                const isEditing =
                  editingSpeaker?.speakerId === item.speaker_id;

                return (
                    <div key={item.start_ts} className="group flex flex-col gap-y-2 hover:bg-muted p-4 rounded-md border">
                        <div className="flex gap-x-2 items-center">
                            <Avatar className="size-6">
                                <AvatarImage src={item.user.image ?? generateAvatarUri({seed: item.user.name, variant: "initials"})} alt="user avatar" />
                            </Avatar>

                            {isEditing ? (
                              <div className="flex items-center gap-x-1">
                                <Input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="h-6 text-sm w-[160px] px-1"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEdit();
                                    if (e.key === "Escape") handleCancelEdit();
                                  }}
                                />
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={updateSpeakerName.isPending}
                                  className="p-0.5 rounded hover:bg-emerald-100 text-emerald-600 transition-colors"
                                  title="Save"
                                >
                                  <CheckIcon className="size-3.5" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="p-0.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                                  title="Cancel"
                                >
                                  <XIcon className="size-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-x-1">
                                <p className="text-sm font-medium">{item.user.name}</p>
                                {isFallbackName(item.user.name) && (
                                  <button
                                    onClick={() =>
                                      handleStartEdit(
                                        item.speaker_id,
                                        item.user.name
                                      )
                                    }
                                    className="p-0.5 rounded hover:bg-blue-100 text-muted-foreground hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Edit speaker name"
                                  >
                                    <PencilIcon className="size-3" />
                                  </button>
                                )}
                              </div>
                            )}

                            <p className="text-sm text-blue-500 font-medium ml-auto">
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
