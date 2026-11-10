"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useHasPassword } from "@/components/auth/use-has-password";
import { ErrorText, FieldLabel, SelectField, TextField } from "@/components/ui/kit";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, authErrorMessage } from "@/lib/auth/errors";
import { toLocalSaudi } from "@/lib/auth/phone";
import type { Account } from "@/lib/auth/types";
import type { Institution } from "@/lib/institutions";
import { planAccountChange, type AccountChange, type SavedAccount } from "./account-changes";
import { AccountCard, SaveNotice, useSaveNotice } from "./account-ui";
import { runAccountMutation } from "./auth-mutations";
import { retryInstitutions } from "./retry-institutions";
import { AddPasswordForm, EmailForm, PasswordForm } from "./security-forms";

const textButton = "inline-flex min-h-11 items-center px-2 font-semibold text-ink underline underline-offset-4";

type FieldErrors = Partial<Record<keyof SavedAccount, string>>;

/* Name and phone save when the field loses focus, university and major when a major is picked.
   Email and password need an explicit step (see security-forms.tsx). */
export function ProfileForm({ account, institutions }: { account: Account; institutions: Institution[] }) {
  const router = useRouter();
  const { saved, ping } = useSaveNotice();
  const hasPassword = useHasPassword();
  const lastSaved = useRef<SavedAccount>({
    name: account.name,
    phoneNumber: account.phoneNumber,
    institutionId: account.institutionId,
    majorId: account.majorId,
  });
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [retrying, startRetry] = useTransition();
  const [retryError, setRetryError] = useState("");
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(() => toLocalSaudi(account.phoneNumber));
  const [institutionId, setInstitutionId] = useState(account.institutionId);
  const [majorId, setMajorId] = useState(account.majorId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [changing, setChanging] = useState<"email" | "password" | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const majors = institutions.find((item) => item.id === institutionId)?.majors ?? [];

  // After a form closes, focus goes back to the button that opened it.
  const returnFocus = useRef<"email" | "password" | null>(null);
  const focusTrigger = (which: "email" | "password") => (node: HTMLButtonElement | null) => {
    if (node && returnFocus.current === which) {
      node.focus();
      returnFocus.current = null;
    }
  };
  const focusEmailNotice = useCallback((node: HTMLParagraphElement | null) => node?.focus(), []);

  const setSecurityPending = (value: boolean) => {
    busy.current = value;
    setPending(value);
  };

  /** Puts a field back to its last saved value, in the format the input shows. */
  const restore = (change: AccountChange) => {
    if (change.field === "name") setName(lastSaved.current.name);
    else if (change.field === "phoneNumber") setPhone(toLocalSaudi(lastSaved.current.phoneNumber));
    else {
      setInstitutionId(lastSaved.current.institutionId);
      setMajorId(lastSaved.current.majorId);
    }
  };

  const save = async (change: AccountChange) => {
    if (busy.current) return;
    const plan = planAccountChange(lastSaved.current, change, institutions);
    if (plan.kind === "incomplete") return;
    if (plan.kind === "invalid") {
      setErrors((prev) => ({ ...prev, [plan.field]: plan.error }));
      restore(change);
      return;
    }
    if (plan.kind === "unchanged") {
      restore(change);
      return;
    }

    busy.current = true;
    setPending(true);
    const fail = (error: { code?: string; status?: number } | null) => {
      const field =
        authErrorKey(error) === "invalidInstitution"
          ? "institutionId"
          : change.field === "study"
            ? "majorId"
            : change.field;
      setErrors((prev) => ({ ...prev, [field]: authErrorMessage(error) }));
      restore(change);
    };
    try {
      const result = await runAccountMutation(() => authClient.updateUser(plan.values));
      if (result.error) {
        fail(result.error);
        return;
      }
      lastSaved.current = { ...lastSaved.current, ...plan.values };
      restore(change);
      ping();
      router.refresh();
    } catch {
      fail(null);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const retryLoadingInstitutions = () =>
    startRetry(async () => {
      setRetryError("");
      try {
        await retryInstitutions();
        router.refresh();
      } catch {
        setRetryError(authErrorMessage(null));
      }
    });

  return (
    <>
      <SaveNotice saved={saved} />

      <AccountCard title="Your details">
        <fieldset disabled={pending} aria-busy={pending} className="mt-4 flex min-w-0 flex-col gap-4">
          <div>
            <FieldLabel htmlFor="acc-name">Name</FieldLabel>
            <TextField
              id="acc-name"
              name="name"
              autoComplete="name"
              value={name}
              invalid={!!errors.name}
              aria-describedby={errors.name ? "acc-name-err" : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              onBlur={() => void save({ field: "name", value: name })}
            />
            {errors.name ? (
              <div role="alert">
                <ErrorText id="acc-name-err">{errors.name}</ErrorText>
              </div>
            ) : null}
          </div>
          <div>
            <FieldLabel htmlFor="acc-phone" hint="A Saudi mobile number, such as 05XXXXXXXX.">
              Phone number
            </FieldLabel>
            <TextField
              id="acc-phone"
              name="tel"
              type="tel"
              autoComplete="tel-national"
              value={phone}
              invalid={!!errors.phoneNumber}
              aria-describedby={errors.phoneNumber ? "acc-phone-err" : undefined}
              onChange={(event) => {
                setPhone(event.target.value);
                setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
              }}
              onBlur={() => void save({ field: "phoneNumber", value: phone })}
            />
            {errors.phoneNumber ? (
              <div role="alert">
                <ErrorText id="acc-phone-err">{errors.phoneNumber}</ErrorText>
              </div>
            ) : null}
          </div>
        </fieldset>

        <div className="mt-4">
          <FieldLabel htmlFor="acc-email">Email address</FieldLabel>
          <TextField id="acc-email" type="email" value={account.email} readOnly />
          {emailSent ? (
            <p ref={focusEmailNotice} tabIndex={-1} role="status" className="mt-2 text-sm leading-base text-ink-2">
              Confirm your new email using the link we sent to it.
            </p>
          ) : null}
          {changing === "email" ? (
            <EmailForm
              disabled={pending}
              onPendingChange={setSecurityPending}
              onDone={() => {
                setChanging(null);
                setEmailSent(true);
              }}
              onCancel={() => {
                returnFocus.current = "email";
                setChanging(null);
              }}
            />
          ) : (
            <button
              ref={focusTrigger("email")}
              type="button"
              disabled={pending}
              onClick={() => {
                setChanging("email");
                setEmailSent(false);
              }}
              className={`mt-2 ${textButton}`}
            >
              Change email address
            </button>
          )}
        </div>
      </AccountCard>

      <AccountCard title="Your university and major">
        {institutions.length === 0 ? (
          <div className="mt-4">
            <p role="status" className="text-sm leading-base text-ink-2">
              We couldn’t load the universities. Try again.
            </p>
            <button
              type="button"
              disabled={retrying}
              aria-busy={retrying}
              onClick={retryLoadingInstitutions}
              className="mt-2 inline-flex min-h-11 items-center rounded-pill border border-line px-4 font-semibold text-ink"
            >
              Try again
            </button>
            {retryError ? (
              <div role="alert">
                <ErrorText id="acc-institutions-err">{retryError}</ErrorText>
              </div>
            ) : null}
          </div>
        ) : (
          <fieldset disabled={pending} aria-busy={pending} className="mt-4 flex min-w-0 flex-col gap-4">
            <div>
              <FieldLabel htmlFor="acc-university">University</FieldLabel>
              <SelectField
                id="acc-university"
                name="institutionId"
                value={institutionId}
                invalid={!!errors.institutionId}
                aria-describedby={errors.institutionId ? "acc-university-err" : undefined}
                onChange={(event) => {
                  setInstitutionId(event.target.value);
                  setMajorId("");
                  setErrors((prev) => ({ ...prev, institutionId: undefined, majorId: undefined }));
                }}
              >
                <option value="" disabled>
                  Choose your university
                </option>
                {institutions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              {errors.institutionId ? (
                <div role="alert">
                  <ErrorText id="acc-university-err">{errors.institutionId}</ErrorText>
                </div>
              ) : null}
            </div>
            <div>
              <FieldLabel htmlFor="acc-major">Major</FieldLabel>
              <SelectField
                id="acc-major"
                name="majorId"
                value={majorId}
                disabled={!institutionId || majors.length === 0}
                invalid={!!errors.majorId}
                aria-describedby={`acc-major-hint${errors.majorId ? " acc-major-err" : ""}`}
                onChange={(event) => {
                  setMajorId(event.target.value);
                  setErrors((prev) => ({ ...prev, institutionId: undefined, majorId: undefined }));
                  void save({ field: "study", institutionId, majorId: event.target.value });
                }}
              >
                <option value="" disabled>
                  Choose your major
                </option>
                {majors.map((major) => (
                  <option key={major.id} value={major.id}>
                    {major.name}
                  </option>
                ))}
              </SelectField>
              <p id="acc-major-hint" className="mt-2 text-xs leading-base text-ink-2">
                When you change university, choose your new major to save both together.
              </p>
              {errors.majorId ? (
                <div role="alert">
                  <ErrorText id="acc-major-err">{errors.majorId}</ErrorText>
                </div>
              ) : null}
            </div>
          </fieldset>
        )}
      </AccountCard>

      <AccountCard title="Password">
        {hasPassword === null ? null : !hasPassword ? (
          <AddPasswordForm email={account.email} disabled={pending} onPendingChange={setSecurityPending} />
        ) : changing === "password" ? (
          <PasswordForm
            disabled={pending}
            onPendingChange={setSecurityPending}
            onDone={() => {
              returnFocus.current = "password";
              setChanging(null);
              ping();
              router.refresh();
            }}
            onCancel={() => {
              returnFocus.current = "password";
              setChanging(null);
            }}
          />
        ) : (
          <>
            <p className="mt-2 max-w-measure text-sm leading-base text-ink-2">
              Changing your password signs you out on your other devices.
            </p>
            <button
              ref={focusTrigger("password")}
              type="button"
              disabled={pending}
              onClick={() => setChanging("password")}
              className={`mt-4 ${textButton}`}
            >
              Change password
            </button>
          </>
        )}
      </AccountCard>
    </>
  );
}
