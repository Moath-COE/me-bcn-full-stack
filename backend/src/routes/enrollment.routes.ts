import { Router } from "express";

import {
  deleteEnrollment,
  getEnrollments,
  putEnrollment
} from "../controllers/enrollment.controller.js";
import { enrollmentRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { requireSession } from "../middlewares/require-session.middleware.js";

const router = Router();
router.use(requireSession);
router.get("/", getEnrollments);
router.put("/:courseId", enrollmentRateLimiter, putEnrollment);
router.delete("/:courseId", enrollmentRateLimiter, deleteEnrollment);

export default router;
