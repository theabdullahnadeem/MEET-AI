"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface Props {
  meetingId: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}

// MU-5: share a meeting without manually copying the URL — copies the
// /call/<meetingId> invite link to the clipboard. Guests who open it go
// through knock-to-join (MU-3).
export const ShareInviteButton = ({
  meetingId,
  variant = "outline",
  size,
  className,
}: Props) => {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = `${window.location.origin}/call/${meetingId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the invite link");
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={copyLink}
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
      Copy invite link
    </Button>
  );
};
