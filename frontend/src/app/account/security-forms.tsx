"use client";

import { useRef, useState } from "react";
import { ErrorText, FieldLabel, GhostButton, TextField } from "@/components/ui/kit";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, authErrorMessage } from "@/lib/auth/errors";
import { runAccountMutation } from "./auth-mutations";

/* Email and password are changed in an explicit step, unlike the profile fields that save on blur. */

type FormActions = {
  onDone: () => void;
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
  disabled: boolean;
};

const cancelButton = "inline-flex min-h-11 items-center px-2 font-semibold text-ink";

function useSecurityRequest(onPendingChange: FormActions["onPendingChange"]) {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const run = async (request: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    onPendingChange(true);
    try {
      await request();
    } finally {
      busy.current = false;
      setPending(false);
      onPendingChange(false);
    }
  };

  return { pending, run };
}

/** A ref callback: moves focus into a form when it opens. */
const focusFirstInput = (node: HTMLFieldSetElement | null) => {
  node?.querySelector("input")?.focus();
};

/** Sends a confirmation link to the new address; the email changes when the link is opened. */
export function EmailForm({ onDone, onCancel, onPendingChange, disabled }: FormActions) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const { pending, run } = useSecurityRequest(onPendingChange);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || disabled) return;
    const input = event.currentTarget.elements.namedItem("newEmail") as HTMLInputElement;
    if (!input.checkValidity()) {
      setError("Enter a valid email address.");
      input.focus();
      return;
    }
    setError("");
    try {
      await run(async () => {
        const result = await runAccountMutation(() =>
          authClient.changeEmail({ newEmail: email.trim(), callbackURL: "/account" }),
        );
        if (result.error) setError(authErrorMessage(result.error));
        else onDone();
      });
    } catch {
      setError(authErrorMessage(null));
    }
  };

  return (
    <form className="mt-4" onSubmit={submit} noValidate>
      <fieldset ref={focusFirstInput} disabled={pending || disabled} aria-busy={pending} className="min-w-0">
        <FieldLabel htmlFor="acc-email-new">New email address</FieldLabel>
        <TextField
          id="acc-email-new"
          name="newEmail"
          type="email"
          autoComplete="email"
          required
          value={email}
          invalid={!!error}
          aria-describedby={error ? "acc-email-err" : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
          }}
        />
        {error ? (
          <div role="alert">
            <ErrorText id="acc-email-err">{error}</ErrorText>
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <GhostButton type="submit">{pending ? "Sending confirmation link…" : "Send confirmation link"}</GhostButton>
          <button type="button" onClick={onCancel} className={cancelButton}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/** Changes the password and signs the account out on its other devices. */
export function PasswordForm({ onDone, onCancel, onPendingChange, disabled }: FormActions) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<{ field: "current" | "next"; text: string } | null>(null);
  const { pending, run } = useSecurityRequest(onPendingChange);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || disabled) return;
    if (!current) {
      setError({ field: "current", text: "Enter your current password" });
      document.getElementById("acc-pass-current")?.focus();
      return;
    }
    if (next.length < 8 || next.length > 128) {
      setError({
        field: "next",
        text:
          next.length < 8
            ? "Use a password with at least 8 characters."
            : "Your password is too long. Use 128 characters or fewer.",
      });
      document.getElementById("acc-pass-next")?.focus();
      return;
    }
    setError(null);
    try {
      await run(async () => {
        const result = await runAccountMutation(() =>
          authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true }),
        );
        if (result.error) {
          const key = authErrorKey(result.error);
          setError({
            field: key === "passwordTooShort" || key === "passwordTooLong" ? "next" : "current",
            text: authErrorMessage(result.error),
          });
        } else onDone();
      });
    } catch {
      setError({ field: "current", text: authErrorMessage(null) });
    }
  };

  return (
    <form className="mt-4" onSubmit={submit} noValidate>
      <fieldset ref={focusFirstInput} disabled={pending || disabled} aria-busy={pending} className="min-w-0">
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="acc-pass-current">Current password</FieldLabel>
            <TextField
              id="acc-pass-current"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              invalid={error?.field === "current"}
              aria-describedby={error?.field === "current" ? "acc-pass-current-err" : undefined}
              onChange={(event) => {
                setCurrent(event.target.value);
                setError(null);
              }}
            />
            {error?.field === "current" ? (
              <div role="alert">
                <ErrorText id="acc-pass-current-err">{error.text}</ErrorText>
              </div>
            ) : null}
          </div>
          <div>
            <FieldLabel htmlFor="acc-pass-next" hint="8 to 128 characters">
              New password
            </FieldLabel>
            <TextField
              id="acc-pass-next"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              invalid={error?.field === "next"}
              aria-describedby={error?.field === "next" ? "acc-pass-next-err" : undefined}
              onChange={(event) => {
                setNext(event.target.value);
                setError(null);
              }}
            />
            {error?.field === "next" ? (
              <div role="alert">
                <ErrorText id="acc-pass-next-err">{error.text}</ErrorText>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <GhostButton type="submit">{pending ? "Saving password…" : "Save password"}</GhostButton>
          <button type="button" onClick={onCancel} className={cancelButton}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
