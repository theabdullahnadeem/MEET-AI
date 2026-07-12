"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// S-5: permanent account deletion. Everything cascades server-side (meetings,
// agents, recordings, transcripts, chats, subscription) — see
// lib/account-deletion.ts and docs/PRIVACY.md.
export const DeleteAccountDialog = ({ open, onOpenChange }: Props) => {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);

  const confirmed = confirmText.trim().toUpperCase() === "DELETE";

  const handleDelete = async () => {
    if (!confirmed || pending) return;
    setPending(true);

    const { error } = await authClient.deleteUser({
      // Email+password accounts must confirm with their password; social
      // accounts leave it blank (better-auth then requires a fresh session).
      password: password || undefined,
    });

    if (error) {
      setPending(false);
      toast.error(
        error.message ??
          "Could not delete the account. If you signed in a while ago, sign out and back in, then try again.",
      );
      return;
    }

    toast.success("Your account and all its data have been deleted.");
    router.push("/sign-up");
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Delete account"
      description="This permanently deletes your account, agents, meetings, recordings, transcripts, summaries, and chats, and cancels any active subscription. This cannot be undone."
    >
      <div className="flex flex-col gap-y-4 pt-2">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="delete-account-password">
            Password{" "}
            <span className="text-muted-foreground font-normal">
              (leave blank if you sign in with Google/GitHub)
            </span>
          </Label>
          <Input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="delete-account-confirm">
            Type <span className="font-semibold">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-account-confirm"
            autoComplete="off"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
        </div>
        <div className="flex flex-col-reverse lg:flex-row gap-2 justify-end pt-2">
          <Button
            variant="outline"
            className="w-full lg:w-auto"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="w-full lg:w-auto"
            disabled={!confirmed || pending}
            onClick={handleDelete}
          >
            <TrashIcon />
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
};
