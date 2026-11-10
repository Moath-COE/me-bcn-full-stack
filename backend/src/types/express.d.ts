import type { AuthSession } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Locals {
      // Set by `requireSession`.
      session?: AuthSession;
    }
  }
}
