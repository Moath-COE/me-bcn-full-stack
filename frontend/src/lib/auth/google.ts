import { oauthErrorKey, type AuthErrorKey } from "./errors";
import { safeNext } from "./next-path";
import { toE164Saudi } from "./phone";

/* Sign-in sends no `requestSignUp`, so a Google email without an account comes back
   as `signup_disabled`. */
export function googleSignInRequest(next: string) {
  const destination = safeNext(next);
  return {
    provider: "google" as const,
    callbackURL: destination,
    errorCallbackURL: `/sign-in?${new URLSearchParams({ next: destination })}`,
  };
}

export type GoogleSignUpFields = {
  phoneNumber: string;
  institutionId: string;
  majorId: string;
};

/* The backend validates the three fields with the same rules as an email sign-up. */
export function googleSignUpRequest(next: string, fields: GoogleSignUpFields) {
  const phoneNumber = toE164Saudi(fields.phoneNumber);
  if (!phoneNumber) throw new Error("Invalid Saudi mobile number");
  const destination = safeNext(next);
  return {
    provider: "google" as const,
    requestSignUp: true,
    additionalData: {
      phoneNumber,
      institutionId: fields.institutionId,
      majorId: fields.majorId,
    },
    callbackURL: destination,
    newUserCallbackURL: destination,
    errorCallbackURL: `/join?${new URLSearchParams({ method: "google", next: destination })}`,
  };
}

/* Re-authentication before deleting an account: the student returns to the account page
   whether Google succeeds or fails. */
export function googleReauthRequest() {
  return {
    provider: "google" as const,
    callbackURL: "/account",
    errorCallbackURL: "/account",
  };
}

export type SignInErrorRoute =
  | { kind: "none" }
  | { kind: "join"; query: { method: "google"; notice: "no-account"; next: string } }
  | { kind: "message"; key: AuthErrorKey };

/* `?error=` on the sign-in page after Google: an email without an account is sent on to
   sign-up in Google mode; anything else becomes a message in the form. */
export function signInErrorRoute(
  code: string | null | undefined,
  next: string,
): SignInErrorRoute {
  const key = oauthErrorKey(code);
  if (!key) return { kind: "none" };
  if (key === "noAccountYet") {
    return {
      kind: "join",
      query: { method: "google", notice: "no-account", next: safeNext(next) },
    };
  }
  return { kind: "message", key };
}

/* An account with a password has a `credential` provider record; a Google-only account does not. */
export function hasPasswordAccount(accounts: readonly { providerId: string }[]) {
  return accounts.some((account) => account.providerId === "credential");
}

/* The study-details draft survives the trip to Google, so a student who comes back with an
   error does not have to choose everything again. Success never returns to the join page
   (a new or a linked account both land on the destination), so the draft is cleared as soon
   as any screen sees a signed-in account (`useAccount`), and it expires quickly regardless. */
const DRAFT_KEY = "becan:join-google";
const DRAFT_TTL_MS = 10 * 60 * 1000;

export function saveGoogleJoinDraft(fields: GoogleSignUpFields, now = Date.now()) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...fields, savedAt: now }));
  } catch {
    /* Blocked storage must not block sign-up. */
  }
}

export function clearGoogleJoinDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Blocked storage must not block sign-in. */
  }
}

export function takeGoogleJoinDraft(now = Date.now()): GoogleSignUpFields | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { phoneNumber, institutionId, majorId, savedAt } = parsed as Record<string, unknown>;
    if (typeof savedAt !== "number" || now - savedAt > DRAFT_TTL_MS) return null;
    return typeof phoneNumber === "string" && typeof institutionId === "string" &&
      typeof majorId === "string"
      ? { phoneNumber, institutionId, majorId }
      : null;
  } catch {
    return null;
  }
}
