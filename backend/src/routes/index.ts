import { Router } from "express";

import healthRoutes from "./health.routes.js";
import planRoutes from "./plan.routes.js";
import institutionRoutes from "./institution.routes.js";
import catalogRoutes from "./catalog.routes.js";
import enrollmentRoutes from "./enrollment.routes.js";
import allowanceRoutes from "./allowance.routes.js";
import livekitRoutes from "./livekit.routes.js";
import auditLogRoutes from "./audit-log.routes.js";
import adminAccountRoutes from "./admin-account.routes.js";
import adminInsightsRoutes from "./admin-insights.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/plans", planRoutes);
router.use("/institutions", institutionRoutes);
router.use("/courses", catalogRoutes);
router.use("/me/enrollments", enrollmentRoutes);
router.use("/me/allowance", allowanceRoutes);
router.use("/livekit", livekitRoutes);
router.use("/admin/audit-log", auditLogRoutes);
router.use("/admin/accounts", adminAccountRoutes);
router.use("/admin/insights", adminInsightsRoutes);

export default router;
