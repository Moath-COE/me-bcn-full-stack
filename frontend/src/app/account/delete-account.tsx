"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGoogleRedirect } from "@/components/auth/use-google-redirect";
import { useHasPassword } from "@/components/auth/use-has-password";
import { ErrorText, FieldLabel, GhostButton, TextField } from "@/components/ui/kit";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, authErrorMessage, oauthErrorMessage } from "@/lib/auth/errors";
import { googleReauthRequest } from "@/lib/auth/google";
import { runAccountMutation } from "./auth-mutations";
import { planDelete } from "./delete-flow";

const PHRASE = "Delete my account";

type FormError = { field: "phrase" | "password" | "form"; text: string };

/* Deleting needs a typed phrase, so it cannot happen by a stray click, plus the current password.
   A Google-only account has no password: the backend then requires a recent sign-in, and when the
   session is too old the student is sent through Google again and returns here. */
export function DeleteAccount({ googleError }: { googleError: string }) {
  const router = useRouter();
  const hasPassword = useHasPassword();
  const { redirecting, start: startGoogle } = useGoogleRedirect();
  const [needsFreshSession, setNeedsFreshSession] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError | null>(() => {
    const text = oauthErrorMessage(googleError);
    return text ? { field: "form", text } : null;
  });
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 2500);
    return () => clearTimeout(timer);
  }, [done, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    if (phrase.trim() !== PHRASE) {
      setError({ field: "phrase", text: `Type “${PHRASE}” exactly to confirm this is intentional` });
      document.getElementById("del-confirm")?.focus();
      return;
    }
    const plan = planDelete(hasPassword, password);
    if (plan.kind === "wait") return;
    if (plan.kind === "needPassword") {
      setError({ field: "password", text: "Enter your current password to confirm deletion" });
      document.getElementById("del-password")?.focus();
      return;
    }

    busy.current = true;
    setPending(true);
    setError(null);
    setNeedsFreshSession(false);
    try {
      const result = await runAccountMutation(() =>
        plan.password === null ? authClient.deleteUser() : authClient.deleteUser({ password: plan.password }),
      );
      if (!result.error) {
        setPassword("");
        setDone(true);
      } else if (!hasPassword && authErrorKey(result.error) === "sessionNotFresh") {
        setNeedsFreshSession(true);
      } else {
        setError({ field: hasPassword ? "password" : "form", text: authErrorMessage(result.error) });
      }
    } catch {
      setError({ field: hasPassword ? "password" : "form", text: authErrorMessage(null) });
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  if (done) {
    return (
      <div role="status" aria-live="polite" className="mt-4 rounded-xl bg-tint-amber p-5">
        <p className="font-bold text-ink">You deleted your account</p>
        <p className="mt-2 max-w-measure leading-base text-ink-2">
          Your account is permanently deleted. You’ll now return to the homepage.
        </p>
        <p className="mt-4">
          <Link href="/" className="font-semibold text-pressable underline underline-offset-4">
            Back to the homepage
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form className="mt-4" onSubmit={submit} noValidate>
      <fieldset disabled={pending || redirecting} aria-busy={pending} className="min-w-0">
        <FieldLabel htmlFor="del-confirm" hint={`Type this exactly: ${PHRASE}`}>
          Type the phrase to confirm
        </FieldLabel>
        <TextField
          id="del-confirm"
          name="confirm"
          autoComplete="off"
          value={phrase}
          invalid={error?.field === "phrase"}
          aria-describedby={error?.field === "phrase" ? "del-err" : undefined}
          onChange={(event) => {
            setPhrase(event.target.value);
            setError(null);
          }}
        />
        {error?.field === "phrase" ? (
          <div role="alert">
            <ErrorText id="del-err">{error.text}</ErrorText>
          </div>
        ) : null}

        {hasPassword ? (
          <div className="mt-4">
            <FieldLabel htmlFor="del-password">Current password</FieldLabel>
            <TextField
              id="del-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              invalid={error?.field === "password"}
              aria-describedby={error?.field === "password" ? "del-password-err" : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
            {error?.field === "password" ? (
              <div role="alert">
                <ErrorText id="del-password-err">{error.text}</ErrorText>
              </div>
            ) : null}
          </div>
        ) : null}

        {error?.field === "form" ? (
          <div role="alert">
            <ErrorText id="del-form-err">{error.text}</ErrorText>
          </div>
        ) : null}

        {needsFreshSession ? (
          <div role="alert" className="mt-4">
            <ErrorText id="del-fresh-err">To protect your account, sign in again and then try once more.</ErrorText>
            <GhostButton
              className="mt-3 w-full gap-3 sm:w-auto"
              disabled={redirecting}
              onClick={() =>
                void startGoogle(googleReauthRequest()).then((failure) => {
                  if (failure) setError({ field: "form", text: authErrorMessage(failure) });
                })
              }
            >
              {redirecting ? "You’re heading to Google…" : "Sign in with Google again"}
            </GhostButton>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={hasPassword === null}
          className="mt-5 inline-flex h-14 items-center justify-center rounded-pill border border-ink px-8 text-lg font-semibold text-ink disabled:opacity-60"
        >
          {pending ? "Deleting your account…" : "Permanently delete my account"}
        </button>
      </fieldset>
    </form>
  );
}
