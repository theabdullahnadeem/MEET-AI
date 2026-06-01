import { EmptyState } from "@/components/empty-state";

export const FailedState = () => {
  return (
    <div className="bg-white rounded-lg px-4 py-5 flex flex-col gap-y-8 items-center justify-center">
      <EmptyState
        image="/processing.svg"
        title="Processing Failed"
        description="Something went wrong while processing this meeting. Please try again or contact support if the issue persists."
      />
    </div>
  );
};
