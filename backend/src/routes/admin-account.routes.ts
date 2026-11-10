import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import {
  deleteAccountEnrollment,
  getAdminAccounts,
  getAccountAllowance,
  getAccountEnrollments,
  getAccountSessions,
  postPasswordReset,
  putAccountEnrollment
} from "../controllers/admin-account.controller.js";
import {
  adminAccountReadRateLimiter,
  adminAccountsRateLimiter,
  adminAccountWriteRateLimiter
} from "../middlewares/rate-limit.middleware.js";
import { requireAdmin } from "../middlewares/require-admin.middleware.js";
import { validateQuery } from "../middlewares/validate.middleware.js";
import { assertAccountExists } from "../services/admin-account.service.js";

const text = z.string().min(1).max(200);

const adminAccountsQuery = z.object({
  // Contains, case-insensitive, over name, email and phone number.
  search: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["user", "admin"]).optional(),
  institutionId: text.optional(),
  majorId: text.optional(),
  banned: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

const sessionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

// 404 ACCOUNT_NOT_FOUND for an unknown Account, after the Admin gate has passed.
const accountMustExist: RequestHandler<{ accountId: string }> = async (
  req,
  _res,
  next
) => {
  await assertAccountExists(req.params.accountId);
  next();
};

// Reads need `user: get`; writes need `user: update`. No new permission statements.
const read = [
  requireAdmin({ user: ["get"] }),
  adminAccountReadRateLimiter,
  accountMustExist
];
const write = [
  requireAdmin({ user: ["update"] }),
  adminAccountWriteRateLimiter,
  accountMustExist
];

const router = Router();
// The Accounts list. `user: list`; reads are not audited.
router.get(
  "/",
  requireAdmin({ user: ["list"] }),
  adminAccountsRateLimiter,
  validateQuery(adminAccountsQuery),
  getAdminAccounts
);
router.get("/:accountId/enrollments", ...read, getAccountEnrollments);
router.get("/:accountId/allowance", ...read, getAccountAllowance);
router.get(
  "/:accountId/sessions",
  ...read,
  validateQuery(sessionsQuery),
  getAccountSessions
);
router.put("/:accountId/enrollments/:courseId", ...write, putAccountEnrollment);
router.delete("/:accountId/enrollments/:courseId", ...write, deleteAccountEnrollment);
// Email to the Student. Better Auth has no admin endpoint for it, and it must link to the web app.
router.post("/:accountId/password-reset", ...write, postPasswordReset);

export default router;
