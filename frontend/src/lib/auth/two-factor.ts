export const TOTP_LENGTH = 6;

export type SignInOutcome = "twoFactor" | "signedIn" | "unknown";

/* `signIn.email` answers 200 in two different cases: an account with two-factor verification
   (`twoFactorRedirect` plus a temporary cookie, no session yet) or a complete sign-in (a user or
   a token). Any other shape is not treated as success, so the form never bounces back silently. */
export function signInOutcome(data: unknown): SignInOutcome {
  if (typeof data !== "object" || data === null) return "unknown";
  const body = data as Record<string, unknown>;
  if (body.twoFactorRedirect === true) return "twoFactor";
  const user = body.user;
  const hasUser = typeof user === "object" && user !== null &&
    typeof (user as Record<string, unknown>).id === "string";
  const hasToken = typeof body.token === "string" && body.token !== "";
  return hasUser || hasToken ? "signedIn" : "unknown";
}

/* Phone keyboards often type Arabic-Indic (U+0660–U+0669) or Persian (U+06F0–U+06F9) digits:
   both become ASCII, and every other non-digit is dropped. */
export function normalizeTotpCode(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .slice(0, TOTP_LENGTH);
}
