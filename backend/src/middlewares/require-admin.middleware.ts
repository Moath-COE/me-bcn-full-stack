import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";

import { auth } from "../lib/auth.js";
import {
  accountHasPermission,
  type PermissionRequest
} from "../services/permission.service.js";
import { assertAdminPermission, assertTwoFactorEnabled } from "../utils/admin-guards.js";
import { AppError } from "../utils/app-error.js";

// The Admin gate: every admin route of ours goes behind it. Responds 401 `UNAUTHENTICATED` without
// a session, 403 `ADMIN_PERMISSION_REQUIRED` without the named permission, and 403
// `ADMIN_TWO_FACTOR_REQUIRED` when the Account has not turned on two-factor. On success the session
// is on `res.locals.session`, as `requireSession` leaves it.
//
// The session is read from the database, not the 5-minute cookie cache, so a demoted Admin or one
// who turned off two-factor is refused on the very next request. Better Auth's own /admin/*
// endpoints get the same two-factor rule from the hook in src/lib/auth.ts.
export function requireAdmin(permissions: PermissionRequest): RequestHandler {
  return async (req, res, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true }
    });

    if (!session) {
      throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
    }

    assertAdminPermission(await accountHasPermission(session.user.id, permissions));
    assertTwoFactorEnabled(session.user.twoFactorEnabled);

    res.locals.session = session;

    next();
  };
}
