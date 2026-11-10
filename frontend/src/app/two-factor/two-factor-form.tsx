"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ErrorText,
  FieldLabel,
  PrimaryButton,
  TextField,
} from "@/components/ui/kit";
import {
  useAuthReturn,
  useSignedInRedirect,
} from "@/components/auth/use-auth-return";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, authErrorMessage, type AuthErrorKey } from "@/lib/auth/errors";
import { normalizeTotpCode, TOTP_LENGTH } from "@/lib/auth/two-factor";

type Mode = "totp" | "backup";

/* Completes a sign-in the backend is holding for a second step. There is no "trust this
   device": every sign-in asks again. */
export function TwoFactorForm({ next }: { next: string }) {
  const router = useRouter();
  const { destination, clearReturn } = useAuthReturn(next);
  useSignedInRedirect(destination, clearReturn);
  const [mode, setMode] = useState<Mode>("totp");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [issue, setIssue] = useState<{ key: AuthErrorKey | "required" } | null>(null);
  const inputId = mode === "totp" ? "two-factor-code" : "two-factor-backup";
  useEffect(() => {
    if (issue) document.getElementById(inputId)?.focus();
  }, [issue, inputId]);

  const signInHref = `/sign-in?${new URLSearchParams({ next: destination })}`;

  const verify = async (value: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIssue(null);
    setPending(true);
    try {
      const { error } = mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: value })
        : await authClient.twoFactor.verifyBackupCode({ code: value.trim() });
      if (error) {
        setIssue({ key: authErrorKey(error) });
        setCode("");
        return;
      }
      clearReturn();
      router.replace(destination);
    } catch {
      setIssue({ key: "generic" });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (mode === "totp") {
      if (code.length === TOTP_LENGTH) void verify(code);
      else setIssue({ key: "required" });
    } else if (backupCode.trim()) {
      void verify(backupCode);
    } else {
      setIssue({ key: "required" });
    }
  };

  const switchMode = () => {
    setMode(mode === "totp" ? "backup" : "totp");
    setCode("");
    setBackupCode("");
    setIssue(null);
  };

  /* Without a pending sign-in there is nothing to continue: send the student to start over. */
  if (issue?.key === "twoFactorExpired") {
    return (
      <>
        <p role="alert" className="mb-5 text-error font-semibold">
          {authErrorMessage("twoFactorExpired")}
        </p>
        <PrimaryButton href={signInHref} className="w-full">
          Sign in again
        </PrimaryButton>
      </>
    );
  }

  const message = issue
    ? issue.key === "required"
      ? mode === "totp" ? "Enter the 6-digit code." : "Enter the backup code."
      : authErrorMessage(issue.key)
    : "";
  const errorId = `${inputId}-error`;

  return (
    <>
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-4">
          <p className="text-ink-2">
            {mode === "totp"
              ? "Open your authenticator app and enter the 6-digit code."
              : "Enter one of your backup codes. Each code works only once."}
          </p>
          <div>
            <FieldLabel htmlFor={inputId}>
              {mode === "totp" ? "Verification code" : "Backup code"}
            </FieldLabel>
            {mode === "totp" ? (
              <TextField
                id={inputId}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                placeholder="000000"
                className="text-center text-2xl tracking-widest"
                onChange={(event) => {
                  const next = normalizeTotpCode(event.target.value);
                  setCode(next);
                  setIssue(null);
                  if (next.length === TOTP_LENGTH) void verify(next);
                }}
                invalid={!!issue}
                aria-describedby={issue ? errorId : undefined}
              />
            ) : (
              <TextField
                id={inputId}
                name="backup-code"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={backupCode}
                onChange={(event) => {
                  setBackupCode(event.target.value);
                  setIssue(null);
                }}
                invalid={!!issue}
                aria-describedby={issue ? errorId : undefined}
              />
            )}
            <div aria-live="polite">
              {issue ? <ErrorText id={errorId}>{message}</ErrorText> : null}
            </div>
          </div>
          <PrimaryButton type="submit" disabled={pending} className="w-full">
            {pending ? "You’re verifying the code…" : "Verify"}
          </PrimaryButton>
        </fieldset>
      </form>
      <div className="mt-4 flex flex-col items-start">
        <button
          type="button"
          onClick={switchMode}
          disabled={pending}
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          {mode === "totp" ? "Use a backup code" : "Use your authenticator app"}
        </button>
        <Link
          href={signInHref}
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </div>
    </>
  );
}
