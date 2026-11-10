// The email an Admin sends to a Student's Account: a password reset. It is a server-side `auth.api`
// call made WITHOUT the request's headers. With a dynamic `baseURL`, Better Auth builds email links from
// the request host, and a request that came through the admin app would put the admin domain in a
// Student's email. Without headers it falls back to `BETTER_AUTH_URL`, the web origin, and `redirectTo`
// points at the web app's page as well. Never pass headers or a request here, and never put a token in
// the Audit log.
import { env } from "../config/env.js";
import { auth } from "../lib/auth.js";
import { findAccountEmail } from "../repositories/admin-account.repository.js";
import { AppError } from "../utils/app-error.js";
import { AuditAction, AuditTargetType, recordAdminAction } from "./audit-log.service.js";

// The student web app's reset page. It reads `token` and `error` from the query.
const RESET_PASSWORD_URL = `${new URL(env.CORS_ORIGIN).origin}/reset-password`;

export async function sendPasswordResetEmail(
  actorId: string,
  accountId: string
): Promise<void> {
  const account = await findAccountEmail(accountId);

  if (!account) {
    throw new AppError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  }

  const { email } = account;

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
