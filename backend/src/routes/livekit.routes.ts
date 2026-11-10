import { Router } from "express";
import { z } from "zod";

import { postLivekitToken } from "../controllers/livekit.controller.js";
import { livekitTokenRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { requireSession } from "../middlewares/require-session.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";

const tokenBody = z.object({
  courseId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
  chapterNumber: z.number().int().min(1),
  language: z.enum(["Arabic", "English"]),
  experience: z.enum(["quick", "relaxed"])
});

const router = Router();
router.post(
  "/token",
  requireSession,
  livekitTokenRateLimiter,
  validateBody(tokenBody),
  postLivekitToken
);

export default router;
