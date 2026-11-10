import { Router } from "express";
import { z } from "zod";

import { getAuditLog } from "../controllers/audit-log.controller.js";
import { auditLogRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { requireAdmin } from "../middlewares/require-admin.middleware.js";
import { validateQuery } from "../middlewares/validate.middleware.js";

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const isoDateOrDateTime = z.union([isoDateTime, isoDate]);

const DAY_MS = 24 * 60 * 60 * 1000;

const text = z.string().min(1).max(200);

const auditLogQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    actorId: text.optional(),
    targetType: text.optional(),
    targetId: text.optional(),
    action: text.optional(),
    // A date alone covers that whole UTC day on both ends.
    from: isoDateOrDateTime.optional(),
    to: isoDateOrDateTime.optional()
  })
  .transform(({ from, to, ...rest }) => ({
    ...rest,
    from: from === undefined ? undefined : new Date(from),
    toExclusive:
      to === undefined
        ? undefined
        : new Date(new Date(to).getTime() + (isoDate.safeParse(to).success ? DAY_MS : 1))
  }));

const router = Router();
router.get(
  "/",
  requireAdmin({ audit: ["read"] }),
  auditLogRateLimiter,
  validateQuery(auditLogQuery),
  getAuditLog
);

export default router;
