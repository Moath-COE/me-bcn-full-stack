import "dotenv/config";
import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    PORT: z.coerce.number().int().positive().default(3000),

    // The web origin. The browser only talks to it; it proxies /api/auth/* here.
    CORS_ORIGIN: z.url().default("http://localhost:3001"),

    // The admin app's origin. It proxies /api/auth/* and /api/v1/* here the same way.
    ADMIN_ORIGIN: z
      .url({ protocol: /^https?$/, hostname: /^.+$/ })
      .default("http://localhost:3002")
      .refine((value) => new URL(value).origin === value, {
        message:
          "ADMIN_ORIGIN must be an origin: scheme, host and port, no path or trailing slash"
      }),

    DATABASE_URL: z
      .url({
        protocol: /^postgres(ql)?$/,
        hostname: /^.+$/
      })
      .default("postgresql://"),

    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

    // Also the web origin: Better Auth falls back to it for email links when a request does not
    // come through the web or admin host.
    BETTER_AUTH_URL: z.url().default("http://localhost:3001"),

    LIVEKIT_URL: z.url({ protocol: /^wss?$/, hostname: /^.+$/ }),
    LIVEKIT_API_KEY: z.string().min(1),
    LIVEKIT_API_SECRET: z.string().min(1),

    // Proxy hops in front of Express, for `req.ip` and express-rate-limit.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

    // Comma-separated CIDRs Better Auth strips from the right of x-forwarded-for.
    TRUSTED_PROXY_CIDRS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      ),

    // Google sign-in (ADR 0006): the OAuth client from Google Cloud Console. Optional in every
    // environment; without them Google is simply not offered. Set both or neither.
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    RESEND_API_KEY: optionalString,

    EMAIL_FROM: optionalString
  })
  .superRefine((value, ctx) => {
    // Better Auth builds email links with one scheme for both hosts.
    if (new URL(value.ADMIN_ORIGIN).protocol !== new URL(value.CORS_ORIGIN).protocol) {
      ctx.addIssue({
        code: "custom",
        path: ["ADMIN_ORIGIN"],
        message: "ADMIN_ORIGIN and CORS_ORIGIN must use the same scheme"
      });
    }

    // Google is the same: all or nothing.
    const google = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
    if (google.some((key) => value[key]) && !google.every((key) => value[key])) {
      for (const key of google) {
        if (!value[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when another GOOGLE_* variable is set`
          });
        }
      }
    }

    if (value.NODE_ENV !== "production") {
      return;
    }

    for (const key of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production`
        });
      }
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment variables:");
  console.error(result.error.flatten().fieldErrors);

  process.exit(1);
}

export const env = result.data;
