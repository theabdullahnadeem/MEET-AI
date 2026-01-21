"use client";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { toast } from "sonner";
import { CommandSelect } from "@/components/command-select";
import { GeneratedAvatar } from "@/components/generated-avatar";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2Icon } from "lucide-react";
import { meetingsInsertSchema } from "../../schema";
import { MeetingGetOne } from "../../types";
import { useState } from "react";
import { NewAgentDialogue } from "@/modules/agents/ui/components/new-agent-dialogue";

interface MeetingsFormProps {
  onSuccess?: (id?: string) => void;
  onCancel?: () => void;
  initialValues?: MeetingGetOne;
}

export const MeetingsForm = ({
  onSuccess,
  onCancel,
  initialValues,
}: MeetingsFormProps) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [openNewAgentDialog, setOpenNewAgentDialog] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");

  const agents = useQuery(
    trpc.agent.getMany.queryOptions({
      pageSize: 100,
      search: agentSearch,
    }),
  );

  const createMeetingMethod = useMutation(
    trpc.meeting.create.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries(
          trpc.meeting.getMany.queryOptions({}),
        );

        // TODO: Invalidate free tier usage

        onSuccess?.(data.id);
      },
      onError: (error) => {
        toast.error(error.message);

        // TODO: Check if error code is "FORBIDDEN", redirect to /upgrade
      },
    }),
  );

  const updateMeetingMethod = useMutation(
    trpc.meeting.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.meeting.getMany.queryOptions({}),
        );

        if (initialValues?.id) {
          await queryClient.invalidateQueries(
            trpc.meeting.getOne.queryOptions({ id: initialValues.id }),
          );
        }
        onSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message);

        // TODO: Check if error code is "FORBIDDEN", redirect to /upgrade
      },
    }),
  );

  const form = useForm<z.infer<typeof meetingsInsertSchema>>({
    resolver: zodResolver(meetingsInsertSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      agentId: initialValues?.agentId ?? "",
    },
  });

  const isEdit = !!initialValues?.id;
  const isPending =
    createMeetingMethod.isPending || updateMeetingMethod.isPending;

  const onSubmit = (values: z.infer<typeof meetingsInsertSchema>) => {
    if (isEdit) {
      updateMeetingMethod.mutate({
        id: initialValues.id,
        ...values,
      });
    } else {
      createMeetingMethod.mutate(values);
    }
  };

  return (
    <>
    <NewAgentDialogue open={openNewAgentDialog} onOpenChange={setOpenNewAgentDialog} />
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          name="name"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g Personal Coaching" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="agentId"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Agent</FormLabel>
              <FormControl>
                <CommandSelect
                  options={(agents.data?.items ?? []).map((agent) => ({
                    id: agent.id,
                    value: agent.id,
                    children: (
                      <div className="flex items-center gap-x-2">
                        <GeneratedAvatar
                          seed={agent.name}
                          variant="botttsNeutral"
                          className="border size-6"
                        />
                        <span>{agent.name}</span>
                      </div>
                    ),
                  }))}
                  onSelect={field.onChange}
                  onSearch={setAgentSearch}
                  value={field.value}
                  placeholder="Select an agent"
                />
              </FormControl>
              <FormDescription>
                Not found what you are looking for?{" "}
                <button
                  className="text-primary hover:underline"
                  type="button"
                  onClick={() => setOpenNewAgentDialog(true)}
                >
                  Create a new agent
                </button>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-between gap-x-2">
          {onCancel && (
            <Button
              variant="destructive"
              disabled={isPending}
              type="button"
              onClick={() => onCancel()}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" />}
            {isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Form>
    </>
  );
};
