import Link from "next/link";

import { cn } from "@/lib/utils";

// ⚠️ DRAFT WORDING — REQUIRES HUMAN LAWYER REVIEW BEFORE PRODUCTION USE.
//
// S-4 / legal: the pre-join recording consent notice, shown to EVERY
// participant BEFORE they connect — the host in the lobby and guests on the
// knock screen. Guests are third parties whose voice is recorded into a
// meeting they don't own, so this notice states who the recording belongs to
// and links to the Privacy Policy (which explains guest rights). Joining
// after seeing this notice is the consent event the Privacy Policy and Terms
// rely on — do not render a pre-join screen without it.
export const RecordingConsentNotice = ({
  className,
}: {
  className?: string;
}) => (
  <p className={cn("text-xs text-muted-foreground", className)}>
    This meeting is <strong>recorded and transcribed</strong>, and an AI
    assistant may listen and speak. The recording and transcript belong to
    the meeting&apos;s host. By joining, you consent to this — see our{" "}
    <Link
      href="/privacy"
      target="_blank"
      className="underline underline-offset-2"
    >
      Privacy Policy
    </Link>
    .
  </p>
);
