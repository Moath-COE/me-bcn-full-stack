"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  ErrorText,
  FieldLabel,
  PrimaryButton,
  TextField,
} from "@/components/ui/kit";
import { useAuthReturn } from "@/components/auth/use-auth-return";
import { AuthCard } from "@/components/auth/auth-card";
import { authClient, useAccount } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/errors";
import { cooldownSeconds } from "@/lib/auth/cooldown";

export function VerifyEmailForm({
  next,
  email: initialEmail,
  queryError,
}: {
  next: string;
  email: string;
  /* The `?error=` code the backend adds when the emailed link fails. */
  queryError: string;
}) {
  const { destination, verifyCallbackURL, clearReturn } = useAuthReturn(next, false);
  const { account, isPending } = useAccount();
  const router = useRouter();
  const hasEmail = z.string().email().safeParse(initialEmail.trim()).success;
  const [email, setEmail] = useState(initialEmail);
  const [remaining, setRemaining] = useState(queryError || !hasEmail ? 0 : 60);
  const deadline = useRef(0);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!queryError && account?.emailVerified) {
      clearReturn();
      router.replace(destination);
    }
  }, [account, queryError, clearReturn, destination, router]);

  useEffect(() => {
    deadline.current = queryError || !hasEmail ? 0 : Date.now() + 60_000;
    const timer = window.setInterval(
      () => setRemaining(cooldownSeconds(deadline.current, Date.now())),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [queryError, initialEmail, hasEmail]);

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || cooldownSeconds(deadline.current, Date.now()) > 0) return;
    if (!z.string().email().safeParse(email.trim()).success) {
      setError(authErrorMessage("invalidEmail"));
      document.getElementById("verify-email-address")?.focus();
      return;
    }
    setError("");
    setSent(false);
    setPending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: verifyCallbackURL,
      });
      if (error) {
        setError(authErrorMessage(error));
        if (error.status !== 429) return;
      } else {
        clearReturn();
        setSent(true);
      }
      deadline.current = Date.now() + 60_000;
      setRemaining(60);
    } catch {
      setError(authErrorMessage("generic"));
    } finally {
      setPending(false);
    }
  };

  if (!queryError && (account?.emailVerified || (!hasEmail && isPending))) return null;

  return (
    <AuthCard prefix="Verify your" word="email">
      <p className="text-ink-2">
        Check your inbox and open the verification link to sign in to your account. If you can’t
        find the message, check your spam folder.
      </p>
      {hasEmail ? (
        <p className="mt-3 break-all font-semibold">
          {initialEmail}
        </p>
      ) : null}
      {queryError ? (
        <div role="alert" className="mt-4">
          <ErrorText id="verify-email-link-error">
            {authErrorMessage({ code: queryError })}
          </ErrorText>
        </div>
      ) : null}
      <form onSubmit={resend} noValidate aria-busy={pending} className="mt-5">
        {queryError || !hasEmail ? (
          <div className="mb-4">
            <FieldLabel htmlFor="verify-email-address">Email address</FieldLabel>
            <TextField
              id="verify-email-address"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              required
              placeholder="name@example.com"
              disabled={pending}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              invalid={!!error}
              aria-describedby={error ? "verify-email-error" : undefined}
            />
          </div>
        ) : null}
        <div aria-live="polite">
          {error ? <ErrorText id="verify-email-error">{error}</ErrorText> : null}
          {sent ? (
            <p className="mb-4 text-sm leading-base text-ink-2">
              You requested a new link. Check your inbox.
            </p>
          ) : null}
        </div>
        <PrimaryButton
          type="submit"
          disabled={pending || remaining > 0}
          className="w-full"
        >
          {pending ? "You’re requesting a new link…" : "Resend the link"}
        </PrimaryButton>
        {remaining > 0 ? (
          <p className="mt-3 text-sm leading-base text-ink-2">
            You can request a new link in {remaining} {remaining === 1 ? "second" : "seconds"}.
          </p>
        ) : null}
      </form>
      <Link
        href={`/sign-in?${new URLSearchParams({ next: destination })}`}
        className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </AuthCard>
  );
}
