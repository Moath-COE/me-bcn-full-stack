import { and, count, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";

import { db, type DbTransaction } from "../db/index.js";
import { adminAuditLog, session, user } from "../db/schema/index.js";

// Inside a transaction a caller can write its change and its entry together.
export type AuditDb = typeof db | DbTransaction;

export type NewAuditEntry = {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
};

export type AuditLogFilters = {
  actorId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: Date;
  // Exclusive: entries strictly before it.
  toExclusive?: Date;
};

// The user-row columns an entry may ever show, and so the only ones read for it. Passwords live in
// `account`, tokens in `session` and two-factor secrets in `two_factor`; none is selected here.
export const auditedAccountColumns = {
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  image: user.image,
  phoneNumber: user.phoneNumber,
  phoneNumberVerified: user.phoneNumberVerified,
  institutionId: user.institutionId,
  majorId: user.majorId,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  twoFactorEnabled: user.twoFactorEnabled
} as const;

export type AuditedAccountField = keyof typeof auditedAccountColumns;

export async function insertAuditEntry(
  entry: NewAuditEntry,
  connection: AuditDb = db
): Promise<void> {
  await connection.insert(adminAuditLog).values(entry);
}

function whereClause(filters: AuditLogFilters): SQL | undefined {
  return and(
    filters.actorId === undefined
      ? undefined
      : eq(adminAuditLog.actorId, filters.actorId),
    filters.targetType === undefined
      ? undefined
      : eq(adminAuditLog.targetType, filters.targetType),
    filters.targetId === undefined
      ? undefined
      : eq(adminAuditLog.targetId, filters.targetId),
    filters.action === undefined ? undefined : eq(adminAuditLog.action, filters.action),
    filters.from === undefined ? undefined : gte(adminAuditLog.createdAt, filters.from),
    filters.toExclusive === undefined
      ? undefined
      : lt(adminAuditLog.createdAt, filters.toExclusive)
  );
}

// Newest first. The actor is joined from `user`; it is null once the Admin has been removed.
export async function findAuditEntries(
  filters: AuditLogFilters,
  limit: number,
  offset: number
) {
  return db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      before: adminAuditLog.before,
      after: adminAuditLog.after,
      reason: adminAuditLog.reason,
      createdAt: adminAuditLog.createdAt,
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email
    })
    .from(adminAuditLog)
    .leftJoin(user, eq(adminAuditLog.actorId, user.id))
    .where(whereClause(filters))
    .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
    .limit(limit)
    .offset(offset);
}

export async function countAuditEntries(filters: AuditLogFilters): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(adminAuditLog)
    .where(whereClause(filters));

  return row?.total ?? 0;
}

export async function findAccountForAudit(userId: string) {
  const [row] = await db
    .select(auditedAccountColumns)
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return row;
}

export async function findSessionOwner(token: string) {
  const [row] = await db
    .select({ id: session.id, userId: session.userId })
    .from(session)
    .where(eq(session.token, token))
    .limit(1);

  return row;
}

export async function countSessions(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(session)
    .where(eq(session.userId, userId));

  return row?.total ?? 0;
}

// Account removal (ADR 0003): drops the personal fields from every earlier entry about the Account,
// keeping the rest of `before` and `after`, and writes the removal entry in the same transaction (the
// caller's, if it passes one). `jsonb - text` leaves a null column null.
export async function insertAccountRemovalEntry(
  entry: NewAuditEntry,
  connection?: AuditDb
): Promise<void> {
  const write = async (tx: AuditDb) => {
    await tx
      .update(adminAuditLog)
      .set({
        before: sql`${adminAuditLog.before} - 'name' - 'email' - 'phoneNumber'`,
        after: sql`${adminAuditLog.after} - 'name' - 'email' - 'phoneNumber'`
      })
      .where(
        and(
          eq(adminAuditLog.targetType, entry.targetType),
          eq(adminAuditLog.targetId, entry.targetId)
        )
      );
    await insertAuditEntry(entry, tx);
  };

  if (connection) await write(connection);
  else await db.transaction(write);
}
