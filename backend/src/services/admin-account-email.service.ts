// Emails an Admin sends to a Student's Account: a password reset, and a verification link. Both are
// server-side `auth.api` calls made WITHOUT the request's headers. With a dynamic `baseURL`, Better Auth
// builds email links from the request host, and a request that came through the admin app would put the
// admin domain in a Student's email. Without headers it falls back to `BETTER_AUTH_URL`, the web origin,
// and `redirectTo` / `callbackURL` point at the web app's pages as well. Never pass headers or a request
// here, and never put a token in the Audit log.
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { auth } from "../lib/auth.js";
import { findAccountEmail } from "../repositories/admin-account.repository.js";
import { AppError } from "../utils/app-error.js";
import { AuditAction, AuditTargetType, recordAdminAction } from "./audit-log.service.js";

const webOrigin = new URL(env.CORS_ORIGIN).origin;

// The student web app's pages. The reset page reads `token` and `error` from the query; the
// verification page redirects a verified Account to `next`.
const RESET_PASSWORD_URL = `${webOrigin}/reset-password`;
const VERIFY_EMAIL_URL = `${webOrigin}/verify-email?${new URLSearchParams({ next: "/home" })}`;

async function readEmail(accountId: string) {
  const account = await findAccountEmail(accountId);

  if (!account) {
    throw new AppError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  }

  return account;
}

async function requestVerificationEmail(email: string): Promise<void> {
  await auth.api.sendVerificationEmail({
    body: { email, callbackURL: VERIFY_EMAIL_URL }
  });
}

export async function sendPasswordResetEmail(
  actorId: string,
  accountId: string
): Promise<void> {
  const { email } = await readEmail(accountId);

  await auth.api.requestPasswordReset({
    body: { email, redirectTo: RESET_PASSWORD_URL }
  });

  await recordAdminAction({
    actorId,
    action: AuditAction.ACCOUNT_PASSWORD_RESET_SENT,
    targetType: AuditTargetType.ACCOUNT,
    targetId: accountId,
    after: { email }
  });
}

// 409 `EMAIL_ALREADY_VERIFIED` when there is nothing to verify.
export async function resendVerificationEmail(
  actorId: string,
  accountId: string
): Promise<void> {
  const { email, emailVerified } = await readEmail(accountId);

  if (emailVerified) {
    throw new AppError(409, "Email is already verified", "EMAIL_ALREADY_VERIFIED");
  }

  await requestVerificationEmail(email);

  await recordAdminAction({
    actorId,
    action: AuditAction.ACCOUNT_VERIFICATION_EMAIL_SENT,
    targetType: AuditTargetType.ACCOUNT,
    targetId: accountId,
    after: { email }
  });
}

type UpdateUserBody = { userId?: unknown; data?: Record<string, unknown> } | null;

// Called by the `/admin/update-user` before hook. When the request changes the email and does not
// explicitly set `emailVerified: true`, the new address starts unverified and gets a verification
// email once the update succeeded. Returns the data to write, or undefined when the email is not
// changing.
export async function planAdminEmailChange(
  body: unknown
): Promise<{ accountId: string; data: Record<string, unknown> } | undefined> {
  const { userId, data } = (body ?? {}) as NonNullable<UpdateUserBody>;

  if (typeof userId !== "string" || typeof data !== "object" || data === null) return;
  if (typeof data.email !== "string" || data.emailVerified === true) return;

  const current = await findAccountEmail(userId);
  if (!current || current.email.toLowerCase() === data.email.toLowerCase()) return;

  return { accountId: userId, data: { ...data, emailVerified: false } };
}

// Called by the `/admin/update-user` after hook. The change already happened, so a failure is logged
// and swallowed: the Admin can resend from the Account.
export async function sendVerificationAfterEmailChange(accountId: string): Promise<void> {
  try {
    const { email, emailVerified } = await readEmail(accountId);
    if (emailVerified) return;

    await requestVerificationEmail(email);
  } catch (error) {
    logger.error(
      { error, accountId },
      "Failed to send the verification email after an Admin changed an email"
    );
  }
}
