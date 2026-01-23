import { ResponsiveDialog } from "@/components/responsive-dialog";
import { MeetingsForm } from "./meetings-form";
import { MeetingGetOne } from "../../types";

interface UpdateMeetingDialogueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: MeetingGetOne;
}

export const UpdateMeetingDialogue = ({
  open,
  onOpenChange,
  initialValues,
}: UpdateMeetingDialogueProps) => {

  return (
    <ResponsiveDialog
      title="Update Meeting"
      description="Update meeting details"
      open={open}
      onOpenChange={onOpenChange}
    >
      <MeetingsForm 
        initialValues={initialValues}
        onSuccess={()=>{
          onOpenChange(false);
        }}
        onCancel={()=>{
          onOpenChange(false)  ;
        }}
      />
    </ResponsiveDialog>
  );
};
