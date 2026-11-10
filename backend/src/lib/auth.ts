import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  isAPIError
} from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { twoFactor } from "better-auth/plugins/two-factor";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import {
  isAuditedAdminPath,
  prepareAdminPluginAudit,
  recordAdminPluginAction,
  type PendingAdminAudit
} from "../services/audit-log.service.js";
import {
  assertValidAccountUpdate,
  assertValidNewAccount
} from "../services/account.service.js";
import {
  sendChangeEmailVerification,
  sendResetPasswordEmail
} from "../services/email/email.service.js";
import {
  assertFreshSession,
  assertNotSelfTarget,
  assertTwoFactorEnabled,
  assertUpdateFieldsAllowed,
  SELF_TARGET_PATHS
} from "../utils/admin-guards.js";
import { AppError } from "../utils/app-error.js";
import { assignFreePlan } from "../services/plan.service.js";
import { ac, roles } from "./access-control.js";

// Better Auth only turns APIError into a 4xx response; anything else becomes a 500.
// Keeps the AppError's code. 403 stays 403; every other status is a 400.
async function asAuthError(check: () => Promise<void>): Promise<void> {
  try {
    await check();
  } catch (error) {
    if (error instanceof AppError && error.code) {
      throw APIError.from(error.statusCode === 403 ? "FORBIDDEN" : "BAD_REQUEST", {
        code: error.code,
        message: error.message
      });
    }

    throw error;
  }
}

const webOrigin = new URL(env.CORS_ORIGIN).origin;
const adminOrigin = env.ADMIN_ORIGIN;

// Better Auth's admin plugin endpoints that need a recently created Device session. The plugin does
// not use `freshSessionMiddleware`, and `session.freshAge` is global, so the hook below checks.
const FRESH_SESSION_PATHS = new Set(["/admin/remove-user", "/admin/set-role"]);

// Better Auth has no channel from `hooks.before` to `hooks.after`, and its per-call request state
// is not exported from `better-auth`. The state that audit entries need (who acted, on whom, and
// how the Account looked before) is carried in this map, keyed on the request object. Both hooks
// receive the same `Request` (or, for a server-side `auth.api` call, the same `Headers`), and
// the entry dies with it. `hooks.before` sets it only after every check has passed.
const pendingAdminAudits = new WeakMap<object, PendingAdminAudit>();

function auditKey(ctx: {
  request?: Request | undefined;
  headers?: Headers | undefined;
}): object | undefined {
  return ctx.request ?? ctx.headers;
}

export const auth = betterAuth({
  // The web and admin apps each proxy /api/auth/* from their own origin, and email links must
  // open in the app the request came from. Next.js's rewrite proxy sends the backend its own host
  // in `Host` and the browser's host in `x-forwarded-host`, so `advanced.trustedProxyHeaders`
  // makes Better Auth read the latter. `allowedHosts` keeps a forged header from picking any
  // other host; requests from elsewhere (direct calls) fall back to the web origin.
  baseURL: {
    allowedHosts: [new URL(webOrigin).host, new URL(adminOrigin).host],
    protocol: new URL(webOrigin).protocol === "https:" ? "https" : "http",
    fallback: env.BETTER_AUTH_URL
  },
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [webOrigin, adminOrigin],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),

  // Roles and permissions come from ./access-control.ts. `defaultRole` is the Student Role.
  // `adminUserIds` is deliberately unused: it bypasses every permission check.
  plugins: [
    admin({ ac, roles, defaultRole: "user", adminRoles: ["admin"] }),
    // TOTP with backup codes, no email/SMS codes. The plugin cannot require two-factor for one Role:
    // the hook below does that for /admin/*, and `requireAdmin` for our own admin routes.
    twoFactor({
      issuer: "Becan",
      accountLockout: { enabled: true }
    })
  ],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }, request) => {
      sendResetPasswordEmail(user, url, request);
    }
  },

  // Sign-up needs no email verification. The only link sent through this option is the one that
  // confirms a new address on `/change-email`; Better Auth passes the new address as `user.email`.
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }, request) => {
      sendChangeEmailVerification(user, url, request);
    }
  },

  // Nobody requests a verification email directly: the change-email flow sends its own link.
  disabledPaths: ["/send-verification-email"],

  user: {
    // Named after Better Auth's phoneNumber plugin fields, so enabling the plugin later needs no
    // migration: drop the two phone fields here and add the plugin.
    additionalFields: {
      phoneNumber: { type: "string", required: true, input: true, unique: true },
      phoneNumberVerified: {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: false
      },
      // No `references` here: Better Auth resolves joins (`advanced.database.joins`) by looking
      // up every referenced model in its own schema, and `institution`/`major` are not auth
      // models, so every session lookup would throw. The foreign keys live in auth-schema.ts.
      institutionId: { type: "string", required: true, input: true },
      majorId: { type: "string", required: true, input: true }
    },
    changeEmail: { enabled: true },
    deleteUser: { enabled: true }
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // The Admin gate for the admin plugin's endpoints (the plugin checks the permission itself).
      // The caller is the session behind the request's cookie or bearer headers, read with the
      // cookie cache off. No session: leave it to the plugin, which answers 401. /two-factor/* is
      // outside this prefix, so an Admin can still turn two-factor on.
      if (ctx.path.startsWith("/admin/")) {
        const session = await getAuthoritativeSessionFromCtx(ctx);
        if (!session) return;

        await asAuthError(async () => {
          assertTwoFactorEnabled(session.user.twoFactorEnabled);

          // Before the fresh-session check, so the answer does not depend on the session's age.
          if (SELF_TARGET_PATHS.has(ctx.path)) {
            assertNotSelfTarget(
              session.user.id,
              (ctx.body as { userId?: unknown } | null)?.userId
            );
          }

          if (FRESH_SESSION_PATHS.has(ctx.path)) {
            assertFreshSession(session.session);
          }

          if (ctx.path === "/admin/update-user" && typeof ctx.body === "object") {
            assertUpdateFieldsAllowed((ctx.body as { data?: unknown } | null)?.data);
          }
        });

        // Audit log (ADR 0003): note how the Account looks now, so `hooks.after` can record the change.
        const key = auditKey(ctx);
        if (key !== undefined && isAuditedAdminPath(ctx.path)) {
          const pending = await prepareAdminPluginAudit(
            ctx.path,
            ctx.body,
            session.user.id
          );
          if (pending) pendingAdminAudits.set(key, pending);
        }
      }
    }),

    // Writes the Audit log entry for an /admin/* action, only if the endpoint succeeded. A refused
    // or failed call comes back here as an APIError and writes nothing.
    after: createAuthMiddleware(async (ctx) => {
      const key = auditKey(ctx);
      const pending = key === undefined ? undefined : pendingAdminAudits.get(key);
      if (key === undefined || pending === undefined) return;

      pendingAdminAudits.delete(key);
      if (isAPIError(ctx.context.returned)) return;

      try {
        await recordAdminPluginAction(pending);
      } catch (error) {
        // The action has happened and cannot be rolled back, so make the missing entry loud.
        logger.error(
          {
            error,
            actorId: pending.actorId,
            action: pending.action,
            targetId: pending.targetId
          },
          "Failed to write Audit log entry"
        );
        throw APIError.from("INTERNAL_SERVER_ERROR", {
          code: "AUDIT_LOG_FAILED",
          message: "The action was done but its Audit log entry could not be written"
        });
      }
    })
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          await asAuthError(() => assertValidNewAccount(user));
        },
        after: async (user) => {
          try {
            await assignFreePlan(user.id, user.createdAt);
          } catch (error) {
            logger.error({ error, userId: user.id }, "Failed to assign Free Plan");
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              code: "PLAN_ASSIGNMENT_FAILED",
              message: "Failed to assign Free Plan"
            });
          }
        }
      },
      update: {
        before: async (data, ctx) => {
          await asAuthError(() =>
            assertValidAccountUpdate(ctx?.context.session?.user.id, data)
          );
        }
      }
    }
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 }
  },

  // Enabled in production only (Better Auth's default). Keys are paths under /api/auth.
  rateLimit: {
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 10 * 60, max: 5 },
      "/request-password-reset": { window: 10 * 60, max: 3 },
      "/change-email": { window: 10 * 60, max: 3 }
    }
  },

  advanced: {
    trustedProxyHeaders: true,
    // Better Auth skips its Origin/CSRF check when NODE_ENV=test unless this is set explicitly.
    // Production already enforces it; setting it keeps tests exercising the same check.
    disableOriginCheck: false,
    database: { joins: true },
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: env.TRUSTED_PROXY_CIDRS
    }
  }
});

export type AuthSession = typeof auth.$Infer.Session;
