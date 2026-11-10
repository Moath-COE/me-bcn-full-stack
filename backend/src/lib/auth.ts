import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getOAuthState,
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
  sendResetPasswordEmail,
  sendVerifyEmail
} from "../services/email/email.service.js";
import {
  assertFreshSession,
  assertNotSelfTarget,
  assertTwoFactorEnabled,
  assertUpdateFieldsAllowed,
  SELF_TARGET_PATHS
} from "../utils/admin-guards.js";
import { AppError } from "../utils/app-error.js";
import { appendErrorParam } from "../utils/callback-url.js";
import {
  planAdminEmailChange,
  sendVerificationAfterEmailChange
} from "../services/admin-account-email.service.js";
import {
  googleSignInRefusal,
  signUpFieldsFromOAuthState
} from "../services/google-sign-in.service.js";
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

function isChangeEmailRequest(request?: Request): boolean {
  return request !== undefined && new URL(request.url).pathname.endsWith("/change-email");
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

// Set by `hooks.before` when an `/admin/update-user` call changes an email without confirming it, so
// `hooks.after` sends the verification email to the new address once the update succeeded.
const pendingVerificationEmails = new WeakMap<object, string>();

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
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }, request) => {
      sendResetPasswordEmail(user, url, request);
    }
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    // Also sends change-email links; Better Auth passes the new address as `user.email`.
    sendVerificationEmail: async ({ user, url }, request) => {
      if (isChangeEmailRequest(request)) {
        sendChangeEmailVerification(user, url, request);
      } else {
        sendVerifyEmail(user, url, request);
      }
    }
  },

  // Google (ADR 0006), only when the OAuth client is configured. Without it `/sign-in/social` answers 404.
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Pinned to the web origin: the web proxies /api/auth/* here, and
            // Google only accepts redirect URIs registered in the Cloud Console.
            redirectURI: `${env.BETTER_AUTH_URL}/api/auth/callback/google`,
            prompt: "select_account",
            // A Google sign-in never creates an Account by itself: the join page must ask for it
            // with `requestSignUp: true`, after collecting the fields an Account needs.
            disableImplicitSignUp: true,
            // Same bar as email sign-up: no session until the address is verified. Google nearly
            // always says it is; when it does not, Better Auth sends our verification email.
            requireEmailVerification: true,
            // Better Auth reads the required Account fields from the Google profile and rejects
            // the sign-up before `databaseHooks.user.create.before` runs if they are missing.
            // Hand it the three fields the join page put in the OAuth state; the hook validates them.
            mapProfileToUser: async () =>
              signUpFieldsFromOAuthState(await getOAuthState())
          }
        }
      : {},

  account: {
    // Linking is what lets a Student who signed up with a password sign in with Google. It needs
    // Google to report the address as verified and the Account's own address to be verified, and
    // `trustedProviders` is left empty on purpose: a trusted provider skips Google's check.
    accountLinking: { enabled: true },
    // Google's tokens are stored but Becan never uses them.
    encryptOAuthTokens: true
  },

  user: {
    // Gate for OAuth sign-ins and for linking Google to an existing Account (ADR 0006).
    validateUserInfo: async ({ user, source }) => {
      // Sign-in and link-account carry the existing Account's id; a new user has no Role yet.
      if (source.method !== "oauth" || source.action === "create-user" || !user.id)
        return;

      return googleSignInRefusal(user.id);
    },

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
      // Better Auth hides duplicate emails when verification is required; Becan chose to tell
      // the student that their email is already taken.
      if (ctx.path === "/sign-up/email" && typeof ctx.body?.email === "string") {
        const existingAccount = await ctx.context.internalAdapter.findUserByEmail(
          ctx.body.email.toLowerCase()
        );
        if (existingAccount?.user) {
          throw APIError.from("UNPROCESSABLE_ENTITY", {
            code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            message: "User already exists. Use another email."
          });
        }
      }

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

        // An email change by an Admin: the new address starts unverified (unless the same request
        // confirms it) and gets a verification email. The audit entry is then built from the changed
        // body, so its `after` shows `emailVerified: false`.
        const key = auditKey(ctx);
        let body: unknown = ctx.body;
        let changedBody: Record<string, unknown> | undefined;
        if (ctx.path === "/admin/update-user") {
          const change = await planAdminEmailChange(ctx.body);
          if (change) {
            changedBody = { ...(ctx.body as Record<string, unknown>), data: change.data };
            body = changedBody;
            if (key !== undefined) pendingVerificationEmails.set(key, change.accountId);
          }
        }

        // Audit log (ADR 0003): note how the Account looks now, so `hooks.after` can record the change.
        if (key !== undefined && isAuditedAdminPath(ctx.path)) {
          const pending = await prepareAdminPluginAudit(ctx.path, body, session.user.id);
          if (pending) pendingAdminAudits.set(key, pending);
        }

        if (changedBody) return { context: { body: changedBody } };
      }
    }),

    // Writes the Audit log entry for an /admin/* action, only if the endpoint succeeded. A refused
    // or failed call comes back here as an APIError and writes nothing.
    after: createAuthMiddleware(async (ctx) => {
      // A banned Account opening its verification link: /verify-email marks the email verified and
      // then auto signs in, and the admin plugin's session hook throws BANNED_USER there, outside
      // the endpoint's own redirect-on-error handling. Send the browser to the callback URL with
      // `error=BANNED_USER`, as the endpoint does for its other errors. The session was never
      // created, so no cookie is set. Without a trusted callback URL, the default error stands.
      // `emailVerified` stays true: the link did prove the address, and an unban then needs no new one.
      if (
        ctx.path === "/verify-email" &&
        isAPIError(ctx.context.returned) &&
        ctx.context.returned.body?.code === "BANNED_USER"
      ) {
        const callbackURL = ctx.query?.callbackURL;
        if (
          typeof callbackURL === "string" &&
          ctx.context.isTrustedOrigin(callbackURL, { allowRelativePaths: true })
        ) {
          return new Response(null, {
            status: 302,
            headers: { Location: appendErrorParam(callbackURL, "BANNED_USER") }
          });
        }
      }

      const key = auditKey(ctx);
      const verifyAccountId =
        key === undefined ? undefined : pendingVerificationEmails.get(key);
      if (key !== undefined) pendingVerificationEmails.delete(key);

      const pending = key === undefined ? undefined : pendingAdminAudits.get(key);
      if (key === undefined || pending === undefined) return;

      pendingAdminAudits.delete(key);
      if (isAPIError(ctx.context.returned)) return;

      // The email change happened: the new address needs its verification email. Failures are logged
      // inside and never fail the call.
      if (verifyAccountId !== undefined) {
        await sendVerificationAfterEmailChange(verifyAccountId);
      }

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
      "/sign-in/social": { window: 60, max: 10 },
      "/sign-up/email": { window: 10 * 60, max: 5 },
      "/request-password-reset": { window: 10 * 60, max: 3 },
      "/send-verification-email": { window: 10 * 60, max: 3 },
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
