"use client";

import { useTRPC } from "@/trpc/client";
import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AgentGetOne } from "../../types";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { AgentIdViewHeader } from "../components/agent-id-header";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { Badge } from "@/components/ui/badge";
import { VideoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { UpdateAgentDialogue } from "../components/update-agent-dialogue";

interface Props {
    agentId: string
}
    
export const AgentIdView = ({agentId}: Props) =>{
    const trpc = useTRPC();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [updateDialogueOpen, setUpdateDialogueOpen] = useState(false);
    
    const {data} = useSuspenseQuery(trpc.agent.getOne.queryOptions({id: agentId})) as {data: AgentGetOne} ;

    const removeAgent = useMutation(
      trpc.agent.remove.mutationOptions({
        onSuccess: async () => {
         await queryClient.invalidateQueries(trpc.agent.getMany.queryOptions({}));
          // TODO : Invalidate free tier usage
          router.push("/agents");
        },
        onError: (error) => {
          toast.error(error.message);
        }
      })
    );

    const [RemoveConfirmation, ConfirmRemove] = useConfirm(
      "Are you sure?",
      `This action will permanently delete the agent "${data.name}" and all of its associated data. This action cannot be undone.`
    );

    const handleRemoveAgent = async () => {
      const ok = await ConfirmRemove();
      if(!ok) return;
      await removeAgent.mutateAsync({id: agentId});
    };

    return(
      <>
      <RemoveConfirmation />
      <UpdateAgentDialogue 
        open={updateDialogueOpen}
        onOpenChange={setUpdateDialogueOpen}
        initialValues={data}
      />
        <div className="flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-4">
            <AgentIdViewHeader 
                agentId={agentId}
                agentName={data.name}
                onEdit={()=>setUpdateDialogueOpen(true)}
                onRemove={handleRemoveAgent}
            />
            <div className="bg-white rounded-lg border">
                <div className="px-4 py-5 gap-y-5 flex flex-col col-span-5">
                    <div className="flex items-center gap-x-3">
                        <GeneratedAvatar 
                            variant="botttsNeutral"
                            seed={data.name}
                            className="size-10"
                        />
                        <h2 className="text-2xl font-medium">{data.name}</h2>
                    </div>
                    <Badge variant="outline" className="flex items-center gap-x-2 [&>svg]:size-4">
                        <VideoIcon className="text-blue-700" />
                        {data.meetingCount} {data.meetingCount === 1 ? "Meeting" : "Meetings"}
                    </Badge>
                    <div className="flex flex-col gap-y-4">
                        <p className="text-lg font-medium">Instructions</p>
                        <p className="text-neutral-800">{data.instructions}</p>
                    </div>
                </div>
            </div>
        </div>
        </>
    )
}

export const AgentIdViewLoading = () => {
  return (
    <LoadingState
      title="Loading Agent"
      description="Please wait while we load the agent"
    />
  );
};

export const AgentIdViewError = () => {
  return (
    <ErrorState
      title="Error loading agent"
      description="Please try again later"
    />
  );
};