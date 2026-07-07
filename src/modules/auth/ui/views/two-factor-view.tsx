"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon, OctagonAlertIcon, ShieldCheckIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

// C.7: the TOTP challenge shown after password sign-in when 2FA is enabled.
// Supports authenticator codes and single-use backup codes.
export const TwoFactorView = () => {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callbacks = {
    onRequest: () => {
      setLoading(true);
      setError(null);
    },
    onSuccess: () => {
      setLoading(false);
      router.push("/");
    },
    onError: ({ error }: { error: { message: string } }) => {
      setLoading(false);
      setError(error.message || "Invalid code. Please try again.");
    },
  };

  const onVerify = () => {
    if (useBackup) {
      authClient.twoFactor.verifyBackupCode(
        { code: backupCode.trim() },
        callbacks,
      );
    } else {
      authClient.twoFactor.verifyTotp({ code, trustDevice }, callbacks);
    }
  };

  const canSubmit = useBackup ? backupCode.trim().length > 0 : code.length === 6;

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center text-center gap-2">
              <ShieldCheckIcon className="size-8 text-primary" />
              <h1 className="text-2xl font-bold">Two-factor authentication</h1>
              <p className="text-muted-foreground text-balance text-sm">
                {useBackup
                  ? "Enter one of your backup codes."
                  : "Enter the 6-digit code from your authenticator app."}
              </p>
            </div>

            {useBackup ? (
              <Input
                placeholder="Backup code"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                className="max-w-60 text-center"
                autoFocus
              />
            ) : (
              <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            )}

            {!useBackup && (
              <div className="flex items-center gap-x-2">
                <Checkbox
                  id="trust-device"
                  checked={trustDevice}
                  onCheckedChange={(checked) => setTrustDevice(checked === true)}
                />
                <Label
                  htmlFor="trust-device"
                  className="text-sm text-muted-foreground"
                >
                  Trust this device for 60 days
                </Label>
              </div>
            )}

            {!!error && (
              <Alert className="bg-destructive/10 border-none">
                <OctagonAlertIcon className="h-4 w-4 text-destructive!" />
                <AlertTitle className="text-destructive">{error}</AlertTitle>
              </Alert>
            )}

            <Button
              className="w-full"
              onClick={onVerify}
              disabled={loading || !canSubmit}
            >
              {loading ? (
                <LoaderCircleIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Verify"
              )}
            </Button>

            <button
              type="button"
              className="text-sm underline underline-offset-4 text-muted-foreground"
              onClick={() => {
                setUseBackup((value) => !value);
                setError(null);
              }}
            >
              {useBackup
                ? "Use an authenticator code instead"
                : "Use a backup code instead"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
