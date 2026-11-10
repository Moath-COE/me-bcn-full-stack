// Rules for signing in with Google (ADR 0006). Better Auth runs the OAuth flow; these are the two
// places Becan steps in: carrying the sign-up fields across the redirect, and keeping Admins out.
import { roles } from "../lib/access-control.js";
import { findUserRole } from "../repositories/user.repository.js";

// The web maps this to a localized message; keep it stable.
export const GoogleSignInErrorCode = {
  ADMIN_GOOGLE_FORBIDDEN: "ADMIN_GOOGLE_FORBIDDEN"
} as const;

export type SignUpFields = {
  phoneNumber: string;
  institutionId: string;
  majorId: string;
};

// The join page sends the three Account fields as `additionalData` on `/sign-in/social`, and Better
// Auth keeps them in the OAuth state across Google's redirect. They are client input: read exactly
// these keys, strings only. Anything else becomes "", which `assertValidNewAccount` then rejects
// with the field's own code (INVALID_PHONE_NUMBER, INVALID_INSTITUTION, INVALID_MAJOR).
export function signUpFieldsFromOAuthState(
  state: Record<string, unknown> | null
): SignUpFields {
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  return {
    phoneNumber: text(state?.phoneNumber),
    institutionId: text(state?.institutionId),
    majorId: text(state?.majorId)
  };
}

// True when any Role on the user row holds any permission. The Student Role holds none. Asked this
// way, not by the name "admin", so a narrower staff Role added later is kept out of Google too.
function holdsAdminPermission(role: string): boolean {
  const stored: Partial<
    Record<string, { statements: Record<string, readonly string[]> }>
  > = roles;

  return role
    .split(",")
    .some((name) =>
      Object.values(stored[name.trim()]?.statements ?? {}).some(
        (actions) => actions.length > 0
      )
    );
}

// Better Auth's twoFactor hook only challenges the email, username and phone sign-in endpoints, so a
// Google session would skip the Admin's TOTP. Admins therefore never use Google: this runs for every
// OAuth sign-in and every attempt to link Google to an existing Account.
export async function googleSignInRefusal(
  userId: string
): Promise<{ error: string; errorDescription: string } | undefined> {
  const role = await findUserRole(userId);

  if (role !== undefined && holdsAdminPermission(role)) {
    return {
      error: GoogleSignInErrorCode.ADMIN_GOOGLE_FORBIDDEN,
      errorDescription:
        "Admins sign in with email, password and two-factor authentication"
    };
  }

  return undefined;
}
