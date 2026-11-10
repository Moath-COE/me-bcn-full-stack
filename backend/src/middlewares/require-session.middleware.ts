import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";

import { auth } from "../lib/auth.js";
import { AppError } from "../utils/app-error.js";

// Puts the signed-in Account's session on `res.locals.session`, or responds 401.
//
// The session is read from the database, not the 5-minute cookie cache, so an Admin's revocation of
// a Device's sessions or a ban takes effect on the very next request instead of up to 5 minutes later.
export const requireSession: RequestHandler = async (req, res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    query: { disableCookieCache: true }
  });

  if (!session) {
    throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
  }

  res.locals.session = session;

  next();
};
