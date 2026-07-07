"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { CopyIcon, LoaderCircleIcon, OctagonAlertIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// C.7: enrol / disable two-factor authentication (TOTP authenticator apps).
// Enable flow: password → QR code (scan with Google Authenticator/Authy/
// 1Password/...) → verify the first 6-digit code → save backup codes.
export const TwoFactorDialog = ({ open, onOpenChange }: Props) => {
  const { data: session } = authClient.useSession();
  const twoFactorEnabled =
    (session?.user as { twoFactorEnabled?: boolean } | undefined)
      ?.twoFactorEnabled === true;

  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setPassword("");
    setTotpUri(null);
    setBackupCodes([]);
    setCode("");
    setVerified(false);
    setError(null);
    setLoading(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onEnable = async () => {
    setLoading(true);
    setError(null);
    const { data, error: apiError } = await authClient.twoFactor.enable({
      password,
    });
    setLoading(false);
    if (apiError || !data) {
      setError(apiError?.message ?? "Failed to start 2FA setup");
      return;
    }
    setTotpUri(data.totpURI);
    setBackupCodes(data.backupCodes ?? []);
  };

  const onVerify = async () => {
    setLoading(true);
    setError(null);
    const { error: apiError } = await authClient.twoFactor.verifyTotp({
      code,
    });
    setLoading(false);
    if (apiError) {
      setError(apiError.message ?? "Invalid code — try again");
      return;
    }
    setVerified(true);
    toast.success("Two-factor authentication enabled");
  };

  const onDisable = async () => {
    setLoading(true);
    setError(null);
    const { error: apiError } = await authClient.twoFactor.disable({
      password,
    });
    setLoading(false);
    if (apiError) {
      setError(apiError.message ?? "Failed to disable 2FA");
      return;
    }
    toast.success("Two-factor authentication disabled");
    handleOpenChange(false);
  };

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      toast.success("Backup codes copied");
    } catch {
      toast.error("Could not copy the codes");
    }
  };

  return (
    <ResponsiveDialog
      title="Two-factor authentication"
      description={
        twoFactorEnabled
          ? "Your account is protected with an authenticator app."
          : "Add a second sign-in step with an authenticator app."
      }
      open={open}
      onOpenChange={handleOpenChange}
    >
      <div className="flex flex-col gap-4">
        {!!error && (
          <Alert className="bg-destructive/10 border-none">
            <OctagonAlertIcon className="h-4 w-4 text-destructive!" />
            <AlertTitle className="text-destructive">{error}</AlertTitle>
          </Alert>
        )}

        {twoFactorEnabled && !totpUri ? (
          // Already enabled → offer disable (password-confirmed).
          <>
            <Input
              type="password"
              placeholder="Confirm your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              variant="destructive"
              onClick={onDisable}
              disabled={loading || password.length === 0}
            >
              {loading ? (
                <LoaderCircleIcon className="h-4 w-4 animate-spin" />
              ) : (
                "Disable two-factor authentication"
              )}
            </Button>
          </>
        ) : !totpUri ? (
          // Step 1: confirm password to begin enrolment.
          <>
            <Input
              type="password"
              placeholder="Confirm your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              onClick={onEnable}
              disabled={loading || password.length === 0}
            >
              {loading ? (
                <LoaderCircleIcon className="h-4 w-4 animate-spin" />
              ) : (
                "Set up authenticator app"
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Note: two-factor sign-in applies to email &amp; password logins.
              Accounts using only Google/GitHub are protected by those
              providers.
            </p>
          </>
        ) : !verified ? (
          // Step 2: scan the QR, then verify the first code.
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Scan this QR code with your authenticator app (Google
              Authenticator, Authy, 1Password, …), then enter the 6-digit code
              it shows.
            </p>
            <div className="bg-white p-3 rounded-lg">
              <QRCode value={totpUri} size={168} />
            </div>
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              className="w-full"
              onClick={onVerify}
              disabled={loading || code.length !== 6}
            >
              {loading ? (
                <LoaderCircleIcon className="h-4 w-4 animate-spin" />
              ) : (
                "Verify & enable"
              )}
            </Button>
          </div>
        ) : (
          // Step 3: show backup codes once.
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Save these one-time backup codes somewhere safe — each can be
              used once if you lose access to your authenticator app.
            </p>
            <div className="grid grid-cols-2 gap-2 bg-muted rounded-lg p-4 font-mono text-sm">
              {backupCodes.map((backupCode) => (
                <span key={backupCode}>{backupCode}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyBackupCodes}>
                <CopyIcon />
                Copy codes
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
};
