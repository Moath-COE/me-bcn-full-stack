import { defineRelationsPart } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  integer,
  bigint
} from "drizzle-orm/pg-core";

import { institution, major } from "./institution-schema.js";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  phoneNumber: text("phone_number").notNull().unique(),
  phoneNumberVerified: boolean("phone_number_verified").default(false).notNull(),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institution.id, { onDelete: "restrict" }),
  majorId: text("major_id")
    .notNull()
    .references(() => major.id, { onDelete: "restrict" }),
  // Admin plugin fields. `role` names a Role in src/lib/access-control.ts; `user` is a Student.
  role: text("role").default("user").notNull(),
  banned: boolean("banned").default(false).notNull(),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // Two-factor plugin field: true once the Account has verified a TOTP code. Admins need it.
  twoFactorEnabled: boolean("two_factor_enabled").default(false)
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Admin plugin: the Admin acting as this Account. Unused until impersonation lands.
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull()
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull()
});

// Two-factor plugin table: one TOTP secret and its backup codes per Account. The plugin stores
// `secret` and `backup_codes` encrypted. `verified` is false until the first TOTP code is accepted.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until")
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId)
  ]
);

export const authRelations = defineRelationsPart(
  { user, session, account, verification, twoFactor, institution, major },
  (r) => ({
    user: {
      sessions: r.many.session({
        from: r.user.id,
        to: r.session.userId
      }),
      accounts: r.many.account({
        from: r.user.id,
        to: r.account.userId
      }),
      twoFactors: r.many.twoFactor({
        from: r.user.id,
        to: r.twoFactor.userId
      }),
      institution: r.one.institution({
        from: r.user.institutionId,
        to: r.institution.id
      }),
      major: r.one.major({
        from: r.user.majorId,
        to: r.major.id
      })
    },
    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id
      })
    },
    twoFactor: {
      user: r.one.user({
        from: r.twoFactor.userId,
        to: r.user.id
      })
    },
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id
      })
    }
  })
);
