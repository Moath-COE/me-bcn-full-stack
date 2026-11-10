"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import {
  ErrorText,
  FieldLabel,
  PrimaryButton,
  TextField,
} from "@/components/ui/kit";
import { useAuthReturn } from "@/components/auth/use-auth-return";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/errors";

export function ForgotPasswordForm({ next }: { next: string }) {
  const { destination } = useAuthReturn(next, false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!z.string().email().safeParse(email.trim()).success) {
      setError(authErrorMessage("invalidEmail"));
      document.getElementById("forgot-password-email")?.focus();
      return;
    }
    setError("");
    setPending(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `/reset-password?${new URLSearchParams({ next: destination })}`,
      });
      if (error) setError(authErrorMessage(error));
      else setSent(true);
    } catch {
      setError(authErrorMessage("generic"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {sent ? (
        <p
          role="status"
          className="rounded-xl border border-line bg-tint-aubergine px-4 py-3"
        >
          If you have an account with this email, you’ll receive a message with a password change
          link. Check your inbox and spam folder.
        </p>
      ) : (
        <form onSubmit={submit} noValidate aria-busy={pending}>
          <p className="mb-5 text-ink-2">
            Enter your account’s email to request a password change link.
          </p>
          <FieldLabel htmlFor="forgot-password-email">Email address</FieldLabel>
          <TextField
            id="forgot-password-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            required
            disabled={pending}
            placeholder="name@example.com"
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            invalid={!!error}
            aria-describedby={error ? "forgot-password-error" : undefined}
          />
          <div aria-live="polite">
            {error ? <ErrorText id="forgot-password-error">{error}</ErrorText> : null}
          </div>
          <PrimaryButton type="submit" disabled={pending} className="mt-5 w-full">
            {pending ? "You’re requesting the change link…" : "Send the change link"}
          </PrimaryButton>
        </form>
      )}
      <Link
        href={`/sign-in?${new URLSearchParams({ next: destination })}`}
        className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </>
  );
}
