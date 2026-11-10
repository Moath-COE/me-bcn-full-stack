/* What the student reads for each kind of failure. The server's own message is never shown. */
const MESSAGES = {
  emailTaken: "This email is already registered. Sign in or use another email.",
  invalidCredentials: "Your email or password is incorrect. Check both and try again.",
  passwordTooShort: "Use a password with at least 8 characters.",
  passwordTooLong: "Your password is too long. Use 128 characters or fewer.",
  invalidEmail: "Enter a valid email address.",
  invalidPassword: "Your password is incorrect. Check it and try again.",
  invalidToken: "This link is invalid or has expired. Request a new link.",
  tooManyRequests: "You’ve tried too many times. Wait a little and try again.",
  invalidPhoneNumber: "Enter a 10-digit Saudi mobile number starting with 05.",
  phoneNumberTaken: "This number belongs to another account. Use another number.",
  invalidInstitution: "Choose a university from the list.",
  invalidMajor: "Choose a major offered by your university from the list.",
  accountBanned: "Your account has been suspended. Contact support to find out why.",
  invalidTwoFactorCode: "The code is incorrect. Check it and try again.",
  twoFactorExpired: "This verification step has expired or never started. Sign in again.",
  twoFactorLocked:
    "You entered the wrong code too many times, so we paused attempts for now. Try again later.",
  generic: "We couldn’t complete your request. Please try again.",
} as const;

/** The kind of failure, for code that reacts to an error instead of only showing it. */
export type AuthErrorKey = keyof typeof MESSAGES;

const KEY_BY_CODE: Record<string, AuthErrorKey> = {
  USER_ALREADY_EXISTS: "emailTaken",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "emailTaken",
  INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
  BANNED_USER: "accountBanned",
  PASSWORD_TOO_SHORT: "passwordTooShort",
  PASSWORD_TOO_LONG: "passwordTooLong",
  INVALID_EMAIL: "invalidEmail",
  INVALID_PASSWORD: "invalidPassword",
  INVALID_TOKEN: "invalidToken",
  TOKEN_EXPIRED: "invalidToken",
  TOO_MANY_REQUESTS: "tooManyRequests",
  INVALID_PHONE_NUMBER: "invalidPhoneNumber",
  PHONE_NUMBER_TAKEN: "phoneNumberTaken",
  INVALID_INSTITUTION: "invalidInstitution",
  INVALID_MAJOR: "invalidMajor",
  INVALID_CODE: "invalidTwoFactorCode",
  INVALID_BACKUP_CODE: "invalidTwoFactorCode",
  /* The second-step cookie lasts 10 minutes; without it the sign-in never started or has expired. */
  INVALID_TWO_FACTOR_COOKIE: "twoFactorExpired",
  ACCOUNT_TEMPORARILY_LOCKED: "twoFactorLocked",
};

type AuthError = { code?: string; status?: number } | null | undefined;

export function authErrorKey(error: AuthError): AuthErrorKey {
  if (error?.status === 429) return "tooManyRequests";
  const code = error?.code;
  return code && Object.hasOwn(KEY_BY_CODE, code) ? KEY_BY_CODE[code] : "generic";
}

/** The sentence for a Better Auth error, or for a kind the caller already knows. */
export function authErrorMessage(error: AuthError | AuthErrorKey): string {
  return MESSAGES[typeof error === "string" ? error : authErrorKey(error)];
}
