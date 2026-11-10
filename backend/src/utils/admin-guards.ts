// Checks shared by the Admin gate (Express routes) and the hook on Better Auth's /admin/* endpoints.
// They only throw AppError, so each caller maps the error to its own response shape.
import { AppError } from "./app-error.js";

export const AdminErrorCode = {
  PERMISSION_REQUIRED: "ADMIN_PERMISSION_REQUIRED",
  TWO_FACTOR_REQUIRED: "ADMIN_TWO_FACTOR_REQUIRED",
  FRESH_SESSION_REQUIRED: "FRESH_SESSION_REQUIRED",
  UPDATE_FIELD_NOT_ALLOWED: "ADMIN_UPDATE_FIELD_NOT_ALLOWED",
  SELF_TARGET: "ADMIN_SELF_TARGET"
} as const;

// How recently a Device session must have been created to authorize a risky action (removing an
// Account, changing a Role). Better Auth's own `session.freshAge` is left alone: it applies to
// Students' account routes too.
export const FRESH_SESSION_MAX_AGE_SECONDS = 10 * 60;

export function assertAdminPermission(allowed: boolean): void {
  if (!allowed) {
    throw new AppError(
      403,
      "This action needs an Admin permission",
      AdminErrorCode.PERMISSION_REQUIRED
    );
  }
}

// Admins need TOTP two-factor on. The twoFactor plugin cannot require it for one Role, so this is ours.
// Pass the Account's `twoFactorEnabled` field.
export function assertTwoFactorEnabled(twoFactorEnabled: unknown): void {
  if (twoFactorEnabled !== true) {
    throw new AppError(
      403,
      "Turn on two-factor authentication to use admin features",
      AdminErrorCode.TWO_FACTOR_REQUIRED
    );
  }
}

// `session.createdAt` is when the Device session began (sign-in, or two-factor setup, which signs
// the Device in again), not its last activity.
export function assertFreshSession(
  session: { createdAt: Date | string },
  now: Date = new Date()
): void {
  const ageMs = now.getTime() - new Date(session.createdAt).getTime();

  if (ageMs >= FRESH_SESSION_MAX_AGE_SECONDS * 1000) {
    throw new AppError(
      403,
      "Sign in again to do this",
      AdminErrorCode.FRESH_SESSION_REQUIRED
    );
  }
}

// Better Auth's admin endpoints an Admin must not aim at their own Account: banning, changing the
// Role of or removing oneself. The plugin refuses ban and remove itself (400, its own codes) and does
// not guard set-role at all, so the hook checks all three first for one consistent 403 code.
export const SELF_TARGET_PATHS: ReadonlySet<string> = new Set([
  "/admin/ban-user",
  "/admin/set-role",
  "/admin/remove-user"
]);

// Pass the caller's user id and the request's `body.userId`. A body without a string `userId` is
// left for the endpoint to refuse.
export function assertNotSelfTarget(callerId: string, targetId: unknown): void {
  if (typeof targetId === "string" && targetId === callerId) {
    throw new AppError(
      403,
      "You cannot do this to your own Account",
      AdminErrorCode.SELF_TARGET
    );
  }
}

// The only fields `/admin/update-user` may change. The endpoint accepts any user field in `data`, so
// this list keeps it to ordinary profile fixes: roles go through set-role, bans through ban-user, and
// nobody sets two-factor state, the image or timestamps from here.
export const ADMIN_UPDATE_USER_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "email",
  "phoneNumber",
  "institutionId",
  "majorId",
  "emailVerified"
]);

// Pass the request's `body.data`. Anything that is not an object is left for the endpoint to refuse.
export function assertUpdateFieldsAllowed(data: unknown): void {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return;

  const refused = Object.keys(data).filter((key) => !ADMIN_UPDATE_USER_FIELDS.has(key));

  if (refused.length > 0) {
    throw new AppError(
      400,
      `These fields cannot be changed here: ${refused.join(", ")}`,
      AdminErrorCode.UPDATE_FIELD_NOT_ALLOWED
    );
  }
}
