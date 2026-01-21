import { ResponsiveDialog } from "@/components/responsive-dialog";
import { MeetingsForm } from "./meetings-form";
import { useRouter } from "next/navigation";

interface NewMeetingDialogueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewMeetingDialogue = ({
  open,
  onOpenChange,
}: NewMeetingDialogueProps) => {

  const router = useRouter();
  return (
    <ResponsiveDialog
      title="New Meeting"
      description="Create a new meeting"
      open={open}
      onOpenChange={onOpenChange}
    >
      <MeetingsForm 
        onSuccess={(id)=>{
          onOpenChange(false);
          router.push(`/meetings/${id}`);
        }}
        onCancel={()=>{
          onOpenChange  ;
        }}
      />
    </ResponsiveDialog>
  );
};
