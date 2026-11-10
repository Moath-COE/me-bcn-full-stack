import type { Request, Response } from "express";

import {
  endEnrollmentByAdmin,
  listAdminAccounts,
  type AdminAccountsQuery,
  grantEnrollment,
  listAccountEnrollments,
  listAccountSessions,
  readAccountAllowance
} from "../services/admin-account.service.js";
import {
  resendVerificationEmail,
  sendPasswordResetEmail
} from "../services/admin-account-email.service.js";

type AccountParams = { accountId: string };
type EnrollmentParams = AccountParams & { courseId: string };

export async function getAccountEnrollments(
  req: Request<AccountParams>,
  res: Response
): Promise<void> {
  res
    .set("Cache-Control", "private, no-store")
    .status(200)
    .json(await listAccountEnrollments(req.params.accountId));
}

export async function getAccountAllowance(
  req: Request<AccountParams>,
  res: Response
): Promise<void> {
  res
    .set("Cache-Control", "private, no-store")
    .status(200)
    .json(await readAccountAllowance(req.params.accountId));
}

export async function getAccountSessions(
  req: Request<AccountParams>,
  res: Response
): Promise<void> {
  const { limit, offset } = res.locals.query as { limit: number; offset: number };

  res
    .set("Cache-Control", "private, no-store")
    .status(200)
    .json(await listAccountSessions(req.params.accountId, limit, offset));
}

export async function putAccountEnrollment(
  req: Request<EnrollmentParams>,
  res: Response
): Promise<void> {
  const result = await grantEnrollment(
    res.locals.session!.user.id,
    req.params.accountId,
    req.params.courseId
  );

  res
    .set("Cache-Control", "no-store")
    .status(result.created ? 201 : 200)
    .json(result.enrollment);
}

export async function deleteAccountEnrollment(
  req: Request<EnrollmentParams>,
  res: Response
): Promise<void> {
  await endEnrollmentByAdmin(
    res.locals.session!.user.id,
    req.params.accountId,
    req.params.courseId
  );

  res.set("Cache-Control", "no-store").status(204).end();
}

export async function getAdminAccounts(_req: Request, res: Response): Promise<void> {
  res
    .set("Cache-Control", "private, no-store")
    .status(200)
    .json(await listAdminAccounts(res.locals.query as AdminAccountsQuery));
}

export async function postPasswordReset(
  req: Request<AccountParams>,
  res: Response
): Promise<void> {
  await sendPasswordResetEmail(res.locals.session!.user.id, req.params.accountId);

  res.set("Cache-Control", "no-store").status(204).end();
}

export async function postVerificationEmail(
  req: Request<AccountParams>,
  res: Response
): Promise<void> {
  await resendVerificationEmail(res.locals.session!.user.id, req.params.accountId);

  res.set("Cache-Control", "no-store").status(204).end();
}
