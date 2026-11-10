import { Router } from "express";
import { z } from "zod";

import { getAdminInsights } from "../controllers/admin-insights.controller.js";
import { adminInsightsRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { requireAdmin } from "../middlewares/require-admin.middleware.js";
import { validateQuery } from "../middlewares/validate.middleware.js";
import { insightsRanges } from "../utils/insights-range.js";

const insightsQuery = z.object({
  range: z.enum(insightsRanges).default("30d")
});

const router = Router();
// Same permission as the Accounts list; reads are not audited.
router.get(
  "/",
  requireAdmin({ user: ["list"] }),
  adminInsightsRateLimiter,
  validateQuery(insightsQuery),
  getAdminInsights
);

export default router;
