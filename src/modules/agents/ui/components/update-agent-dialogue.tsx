import { ResponsiveDialog } from "@/components/responsive-dialog";
import { AgentsForm } from "./agents-form";
import { AgentGetOne } from "../../types";

interface UpdateAgentDialogueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: AgentGetOne;
}

export const UpdateAgentDialogue = ({
  open,
  onOpenChange,
  initialValues
}: UpdateAgentDialogueProps) => {
  return (
    <ResponsiveDialog
      title="Edit Agent"
      description="Edit the agent"
      open={open}
      onOpenChange={onOpenChange}
    >
      <AgentsForm
        onSuccess={() => onOpenChange(false)}
        onCancel={() => onOpenChange(false)}
        initialValues={initialValues}
      />
    </ResponsiveDialog>
  );
};
