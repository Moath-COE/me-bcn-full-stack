"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ErrorText,
  FieldLabel,
  GhostButton,
  PrimaryButton,
  SelectField,
  TextField,
} from "@/components/ui/kit";
import { PasswordField } from "@/components/auth/password-field";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { useGoogleRedirect } from "@/components/auth/use-google-redirect";
import {
  useAuthReturn,
  useSignedInRedirect,
} from "@/components/auth/use-auth-return";
import { authClient } from "@/lib/auth/client";
import type { Institution } from "@/lib/institutions";
import {
  authErrorKey,
  authErrorMessage,
  oauthErrorKey,
  type AuthErrorKey,
} from "@/lib/auth/errors";
import { toE164Saudi } from "@/lib/auth/phone";
import {
  googleSignUpRequest,
  saveGoogleJoinDraft,
  takeGoogleJoinDraft,
} from "@/lib/auth/google";
import {
  joinIssueTarget,
  joinStart,
  planJoinSubmit,
  type JoinField as Field,
  type JoinIssue as Issue,
  type JoinState,
} from "@/lib/auth/join-mode";

export function JoinForm({
  next,
  institutions,
  initialGoogle = false,
  noAccountNotice = false,
  oauthError = "",
}: {
  next: string;
  institutions: Institution[];
  /* Google mode from the URL: reached from a Google sign-in whose email has no account, or
     from an error Google returned. */
  initialGoogle?: boolean;
  noAccountNotice?: boolean;
  oauthError?: string;
}) {
  const router = useRouter();
  const { destination, verifyCallbackURL, clearReturn } = useAuthReturn(next);
  useSignedInRedirect(destination, clearReturn);
  const [state, setState] = useState<JoinState>(() => joinStart(initialGoogle));
  const { step, method } = state;
  const google = method === "google";
  const { redirecting, start: startGoogle } = useGoogleRedirect();
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    phoneNumber: "",
    institutionId: "",
    majorId: "",
  });
  const [issue, setIssue] = useState<Issue | null>(() => {
    const key = initialGoogle ? oauthErrorKey(oauthError) : null;
    return key ? { ...joinIssueTarget(key, "google"), key } : null;
  });
  const [submitting, setSubmitting] = useState(false);
  const pending = submitting || redirecting;
  const [retrying, startRetry] = useTransition();
  const majors = institutions.find(
    (item) => item.id === values.institutionId,
  )?.majors ?? [];

  useEffect(() => {
    if (issue) document.getElementById(`join-${issue.field}`)?.focus();
  }, [issue, step]);

  /* The student came back from Google with an error: restore the university, major and phone
     number instead of asking again. Storage does not exist during server rendering, so the
     draft is read after mount, not as the initial state. */
  useEffect(() => {
    if (!initialGoogle || !oauthError) return;
    const draft = takeGoogleJoinDraft();
    if (draft) queueMicrotask(() => setValues((current) => ({ ...current, ...draft })));
  }, [initialGoogle, oauthError]);

  const message = (field: Field | "form") => issue?.field === field
    ? issue.key === "nameRequired" ? "Enter your name." : authErrorMessage(issue.key)
    : undefined;
  const change = (field: Field, value: string) => {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "institutionId" ? { majorId: "" } : {}),
    }));
    setIssue(null);
  };

  const goToStepTwo = () => {
    requestAnimationFrame(
      () => document.getElementById("join-phoneNumber")?.focus(),
    );
  };

  const showError = (key: AuthErrorKey) => {
    const target = joinIssueTarget(key, method);
    setState((current) => ({ ...current, step: target.step }));
    setIssue({ field: target.field, key });
  };

  const submitGoogle = async () => {
    setIssue(null);
    saveGoogleJoinDraft(values);
    /* The destination comes back in the error URL (`next`); the stored copy is no longer needed. */
    clearReturn();
    const error = await startGoogle(googleSignUpRequest(destination, values));
    if (error) showError(authErrorKey(error));
  };

  const submitEmail = async () => {
    setIssue(null);
    setSubmitting(true);
    try {
      const { error } = await authClient.signUp.email({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        phoneNumber: toE164Saudi(values.phoneNumber)!,
        institutionId: values.institutionId,
        majorId: values.majorId,
        callbackURL: verifyCallbackURL,
      });
      if (error) {
        showError(authErrorKey(error));
        return;
      }
      /* The email link and the `next` parameter carry the destination; do not leave a stale
         copy behind for a later sign-in. */
      clearReturn();
      router.push(
        `/verify-email?${new URLSearchParams({ email: values.email.trim(), next: destination })}`,
      );
    } catch {
      setIssue({ field: "form", key: "generic" });
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const plan = planJoinSubmit(state, values, institutions);
    if (plan.kind === "issue") {
      setState((current) => ({ ...current, step: plan.step }));
      setIssue(plan.issue);
    } else if (plan.kind === "advance") {
      setIssue(null);
      setState({ method: "email", step: 2 });
      goToStepTwo();
    } else if (plan.kind === "google") {
      await submitGoogle();
    } else {
      await submitEmail();
    }
  };

  return (
    <div className="mt-6 w-full">
      {noAccountNotice && google ? (
        <div
          role="status"
          className="mb-5 rounded-xl border border-line bg-tint-aubergine px-4 py-3"
        >
          <p className="font-semibold text-ink">You don’t have an account yet</p>
          <p className="mt-1 text-sm leading-base text-ink-2">
            Complete your details here, then continue to Google and we’ll create your account.
          </p>
        </div>
      ) : null}
      {!google && step === 1 ? (
        <>
          <GoogleButton
            disabled={pending}
            onClick={() => {
              setIssue(null);
              setState({ method: "google", step: 2 });
              goToStepTwo();
            }}
          >
            Continue with Google
          </GoogleButton>
          <AuthDivider />
        </>
      ) : null}

      <p
        className="mb-5 text-sm leading-base font-semibold text-ink-2"
        aria-live="polite"
      >
        {google
          ? "One step before Google — Your study details"
          : step === 1
            ? "Step 1 of 2 — Sign-in details"
            : "Step 2 of 2 — Your study details"}
      </p>
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-4">
          <div hidden={step !== 1} className="space-y-4">
            <div>
              <FieldLabel htmlFor="join-name">Name</FieldLabel>
              <TextField
                id="join-name"
                name="name"
                autoComplete="name"
                value={values.name}
                required
                onChange={(event) => change("name", event.target.value)}
                invalid={!!message("name")}
                aria-describedby={message("name") ? "join-name-error" : undefined}
              />
              {message("name") ? (
                <ErrorText id="join-name-error">{message("name")!}</ErrorText>
              ) : null}
            </div>
            <div>
              <FieldLabel htmlFor="join-email">Email address</FieldLabel>
              <TextField
                id="join-email"
                name="email"
                type="email"
                autoComplete="email"
                value={values.email}
                required
                placeholder="name@example.com"
                onChange={(event) => change("email", event.target.value)}
                invalid={!!message("email")}
                aria-describedby={message("email") ? "join-email-error" : undefined}
              />
              {message("email") ? (
                <ErrorText id="join-email-error">{message("email")!}</ErrorText>
              ) : null}
            </div>
            <PasswordField
              id="join-password"
              label="Password"
              value={values.password}
              onChange={(value) => change("password", value)}
              error={message("password")}
              hint="Use at least 8 characters."
            />
          </div>
          <div hidden={step !== 2} className="space-y-4">
            <div>
              <FieldLabel htmlFor="join-phoneNumber" hint="A Saudi mobile number, starting with 05.">
                Mobile number
              </FieldLabel>
              <TextField
                id="join-phoneNumber"
                name="phoneNumber"
                type="tel"
                autoComplete="tel-national"
                value={values.phoneNumber}
                required
                placeholder="05XXXXXXXX"
                onChange={(event) => change("phoneNumber", event.target.value)}
                invalid={!!message("phoneNumber")}
                aria-describedby={message("phoneNumber") ? "join-phoneNumber-error" : undefined}
              />
              {message("phoneNumber") ? (
                <ErrorText id="join-phoneNumber-error">
                  {message("phoneNumber")!}
                </ErrorText>
              ) : null}
            </div>
            {institutions.length === 0 ? (
              <div role="status">
                <p className="text-sm leading-base text-ink-2">
                  You couldn’t load the university list. Try again.
                </p>
                <button
                  type="button"
                  disabled={retrying}
                  className="inline-flex min-h-11 min-w-11 items-center font-semibold underline underline-offset-4"
                  onClick={() => startRetry(() => router.refresh())}
                >
                  {retrying ? "You’re loading the list…" : "Try again"}
                </button>
              </div>
            ) : null}
            <div>
              <FieldLabel htmlFor="join-institutionId">University</FieldLabel>
              <SelectField
                id="join-institutionId"
                name="institutionId"
                value={values.institutionId}
                disabled={!institutions.length}
                required
                onChange={(event) => change("institutionId", event.target.value)}
                invalid={!!message("institutionId")}
                aria-describedby={message("institutionId") ? "join-institutionId-error" : undefined}
              >
                <option value="">Choose your university</option>
                {institutions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              {message("institutionId") ? (
                <ErrorText id="join-institutionId-error">
                  {message("institutionId")!}
                </ErrorText>
              ) : null}
            </div>
            <div>
              <FieldLabel htmlFor="join-majorId">Major</FieldLabel>
              <SelectField
                id="join-majorId"
                name="majorId"
                value={values.majorId}
                disabled={!values.institutionId || !majors.length}
                required
                onChange={(event) => change("majorId", event.target.value)}
                invalid={!!message("majorId")}
                aria-describedby={message("majorId") ? "join-majorId-error" : undefined}
              >
                <option value="">Choose your major</option>
                {majors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              {message("majorId") ? (
                <ErrorText id="join-majorId-error">{message("majorId")!}</ErrorText>
              ) : null}
            </div>
          </div>
          <div id="join-form" tabIndex={-1} aria-live="polite">
            {message("form") ? (
              <ErrorText id="join-form-error">{message("form")!}</ErrorText>
            ) : null}
          </div>
          <PrimaryButton
            type="submit"
            disabled={pending || (step === 2 && !institutions.length)}
            className="w-full"
          >
            {google
              ? pending ? "You’re heading to Google…" : "Continue to Google"
              : pending ? "You’re creating your account…" : step === 1 ? "Next" : "Create your account"}
          </PrimaryButton>
          {step === 2 ? (
            <GhostButton
              className="w-full"
              onClick={() => {
                setState(joinStart(false));
                setIssue(null);
                requestAnimationFrame(
                  () => document.getElementById("join-name")?.focus(),
                );
              }}
            >
              {google ? "Sign up with email and password instead" : "Back"}
            </GhostButton>
          ) : null}
        </fieldset>
      </form>
      <Link
        href={`/sign-in?${new URLSearchParams({ next: destination })}`}
        className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        Already have an account? Sign in
      </Link>
    </div>
  );
}
