import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { VideoIcon } from "lucide-react";
import Link from "next/link";

interface Props {
    meeetingId: string;
}

export const ActiveState = ({meeetingId}: Props) => {
  return (
    <div className="bg-white rounded-lg px-4 py-5 flex flex-col gap-y-8 items-center justify-center">
      <EmptyState
        image="/upcoming.svg"
        title="Meeting is Active"
        description="Meeting will end once all participants leave."
      />
      <div>
        <Button asChild className="w-full lg:w-auto">
            <Link href={`/call/${meeetingId}`}>
                <VideoIcon />
                Join Meeting
            </Link>
        </Button>
      </div>
    </div>
  );
};
