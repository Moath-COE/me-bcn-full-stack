import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

// /api/auth has its own per-endpoint limits in Better Auth (see lib/auth.ts).
// Signed LiveKit webhooks share LiveKit's IPs; an IP limit would drop Usage events.
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  skip: (req) =>
    req.path.startsWith("/api/auth/") ||
    (req.method === "POST" && /^\/api\/v1\/livekit\/webhook\/?$/i.test(req.path))
});

// Mount after requireSession so the key is the Account id.
export function perAccountRateLimiter(limit: number, message: string) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    keyGenerator: (_req, res) => res.locals.session!.user.id,
    skip: () => env.NODE_ENV === "test",
    handler: () => {
      throw new AppError(429, message, "RATE_LIMITED");
    }
  });
}

// Shared by PUT and DELETE.
export const enrollmentRateLimiter = perAccountRateLimiter(
  30,
  "Too many enrollment requests"
);

export const livekitTokenRateLimiter = perAccountRateLimiter(
  10,
  "Too many token requests"
);

export const auditLogRateLimiter = perAccountRateLimiter(
  60,
  "Too many Audit log requests"
);

// Admin Account detail routes (/admin/accounts/:accountId/...), keyed by the calling Admin.
export const adminAccountReadRateLimiter = perAccountRateLimiter(
  120,
  "Too many Account requests"
);

export const adminAccountWriteRateLimiter = perAccountRateLimiter(
  30,
  "Too many Account change requests"
);

// Admin Accounts list (/admin/accounts), keyed by the calling Admin.
export const adminAccountsRateLimiter = perAccountRateLimiter(
  120,
  "Too many Accounts list requests"
);

// Admin Insights (/admin/insights), keyed by the calling Admin. One request builds every section.
export const adminInsightsRateLimiter = perAccountRateLimiter(
  60,
  "Too many Insights requests"
);
