"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  ErrorText,
  FieldLabel,
  PrimaryButton,
  TextField,
} from "@/components/ui/kit";
import { PasswordField } from "@/components/auth/password-field";
import {
  useAuthReturn,
  useSignedInRedirect,
} from "@/components/auth/use-auth-return";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, authErrorMessage } from "@/lib/auth/errors";
import { signInOutcome } from "@/lib/auth/two-factor";

export function SignInForm({
  next,
  resetSuccess,
}: {
  next: string;
  resetSuccess: boolean;
}) {
  const router = useRouter();
  const { destination, clearReturn } = useAuthReturn(next);
  useSignedInRedirect(destination, clearReturn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState<{
    field: "email" | "password" | "form";
    message: string;
  } | null>(null);
  useEffect(() => {
    if (issue) document.getElementById(`sign-in-${issue.field}`)?.focus();
  }, [issue]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!z.string().email().safeParse(email.trim()).success) {
      setIssue({ field: "email", message: authErrorMessage("invalidEmail") });
      return;
    }
    if (!password) {
      setIssue({ field: "password", message: "Enter your password." });
      return;
    }
    setIssue(null);
    setPending(true);
    try {
      const { data, error } = await authClient.signIn.email({ email: email.trim(), password });
      if (error) {
        const key = authErrorKey(error);
        setIssue({
          field: key === "invalidEmail"
            ? "email"
            : key === "invalidCredentials" || key === "invalidPassword"
              ? "password"
              : "form",
          message: authErrorMessage(key),
        });
      } else {
        const outcome = signInOutcome(data);
        if (outcome === "twoFactor") {
          /* Sign-in is not complete yet: the destination stays stored, and the
             verification page is the one that finishes it. */
          router.replace(`/two-factor?${new URLSearchParams({ next: destination })}`);
        } else if (outcome === "signedIn") {
          clearReturn();
          router.replace(destination);
        } else {
          setIssue({ field: "form", message: authErrorMessage("generic") });
        }
      }
    } catch {
      setIssue({ field: "form", message: authErrorMessage("generic") });
    } finally {
      setPending(false);
    }
  };

  const query = new URLSearchParams({ next: destination });
  return (
    <>
      {resetSuccess ? (
        <p
          role="status"
          className="mb-5 rounded-xl border border-line bg-tint-aubergine px-4 py-3"
        >
          You changed your password. Sign in with the new password.
        </p>
      ) : null}
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-4">
          <div>
            <FieldLabel htmlFor="sign-in-email">Email address</FieldLabel>
            <TextField
              id="sign-in-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              required
              placeholder="name@example.com"
              onChange={(event) => {
                setEmail(event.target.value);
                setIssue(null);
              }}
              invalid={issue?.field === "email"}
              aria-describedby={issue?.field === "email" ? "sign-in-email-error" : undefined}
            />
            {issue?.field === "email" ? (
              <ErrorText id="sign-in-email-error">{issue.message}</ErrorText>
            ) : null}
          </div>
          <PasswordField
            id="sign-in-password"
            label="Password"
            value={password}
            autoComplete="current-password"
            onChange={(value) => {
              setPassword(value);
              setIssue(null);
            }}
            error={issue?.field === "password" ? issue.message : undefined}
          />
          <div id="sign-in-form" tabIndex={-1} aria-live="polite">
            {issue?.field === "form" ? (
              <ErrorText id="sign-in-form-error">{issue.message}</ErrorText>
            ) : null}
          </div>
          <PrimaryButton type="submit" disabled={pending} className="w-full">
            {pending ? "You’re signing in…" : "Sign in"}
          </PrimaryButton>
        </fieldset>
      </form>
      <div className="mt-4 flex flex-col items-start">
        <Link
          href={`/forgot-password?${query}`}
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Forgot your password?
        </Link>
        <Link
          href={`/join?${query}`}
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Don’t have an account? Create one
        </Link>
      </div>
    </>
  );
}
