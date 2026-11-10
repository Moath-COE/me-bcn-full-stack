import { Resend } from "resend";

import { env } from "../config/env.js";

// Null in tests (never send real email) and in development without a key: the email service then
// logs each message instead. env.ts requires the key in production.
export const resend =
  env.NODE_ENV !== "test" && env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
