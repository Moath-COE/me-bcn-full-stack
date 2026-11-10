// The Audit log (ADR 0003). Two ways in:
// - `recordAdminAction`, for our own admin routes: call it with the route's transaction so the change
//   and its entry commit together.
// - `prepareAdminPluginAudit` + `recordAdminPluginAction`, for Better Auth's /admin/* endpoints, called
//   from the hooks in src/lib/auth.ts: prepare before the endpoint runs, record after it succeeded.
// Never put password hashes, session tokens or two-factor secrets in `before` or `after`.
import {
  auditedAccountColumns,
  countAuditEntries,
  countSessions,
  findAccountForAudit,
  findAuditEntries,
  findSessionOwner,
  insertAccountRemovalEntry,
  insertAuditEntry,
  type AuditDb,
  type AuditedAccountField,
  type AuditLogFilters
} from "../repositories/audit-log.repository.js";

export const AuditTargetType = { ACCOUNT: "account" } as const;

export const AuditAction = {
  ACCOUNT_BAN: "account.ban",
  ACCOUNT_UNBAN: "account.unban",
  ACCOUNT_SET_ROLE: "account.set-role",
  ACCOUNT_UPDATE: "account.update",
  ACCOUNT_REMOVE: "account.remove",
  ACCOUNT_REVOKE_SESSION: "account.revoke-session",
  ACCOUNT_REVOKE_SESSIONS: "account.revoke-sessions",
  ACCOUNT_PASSWORD_RESET_SENT: "account.password-reset-sent",
  ENROLLMENT_GRANT: "enrollment.grant",
  ENROLLMENT_END: "enrollment.end"
} as const;

export type AdminAction = {
  actorId: string;
  // A stable dotted name such as `account.ban`; see AuditAction.
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
};

export async function recordAdminAction(
  entry: AdminAction,
  connection?: AuditDb
): Promise<void> {
  const row = {
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null
  };

  // Removing an Account erases its personal data (ADR 0003): the repository scrubs the earlier
  // entries and writes this one in a single transaction.
  if (
    entry.action === AuditAction.ACCOUNT_REMOVE &&
    entry.targetType === AuditTargetType.ACCOUNT
  ) {
    await insertAccountRemovalEntry({ ...row, before: null, after: null }, connection);
    return;
  }

  await insertAuditEntry(row, connection);
}

// Better Auth admin plugin endpoints that are audited, by path. Reads (list-users, get-user,
// list-user-sessions, has-permission) are not.
const AUDITED_PLUGIN_ACTIONS: Record<string, string> = {
  "/admin/update-user": AuditAction.ACCOUNT_UPDATE,
  "/admin/set-role": AuditAction.ACCOUNT_SET_ROLE,
  "/admin/ban-user": AuditAction.ACCOUNT_BAN,
  "/admin/unban-user": AuditAction.ACCOUNT_UNBAN,
  "/admin/revoke-user-session": AuditAction.ACCOUNT_REVOKE_SESSION,
  "/admin/revoke-user-sessions": AuditAction.ACCOUNT_REVOKE_SESSIONS,
  "/admin/remove-user": AuditAction.ACCOUNT_REMOVE
};

export function isAuditedAdminPath(path: string | undefined): boolean {
  return path !== undefined && Object.hasOwn(AUDITED_PLUGIN_ACTIONS, path);
}

// What the "before" hook learns while the Account still looks the way it did before the action.
export type PendingAdminAudit = {
  actorId: string;
  action: string;
  targetId: string;
  fields: AuditedAccountField[];
  // Whole-snapshot actions record every field; update-user records only those that changed.
  onlyChanged: boolean;
  before: Record<string, unknown> | null;
  sessionId?: string;
  sessionCount?: number;
  reason: string | null;
};

type Fields = Partial<Record<AuditedAccountField, unknown>>;

const BAN_FIELDS: AuditedAccountField[] = ["banned", "banReason", "banExpires"];

function isAuditedField(key: string): key is AuditedAccountField {
  return Object.hasOwn(auditedAccountColumns, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function pick(row: Fields, fields: AuditedAccountField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, toJsonValue(row[field])]));
}

// Better Auth coerces the id to a string; so do we, so the entry names the same Account.
function targetIdOf(body: Record<string, unknown>): string | undefined {
  const { userId } = body;

  if (typeof userId === "string" && userId !== "") return userId;
  if (typeof userId === "number") return String(userId);

  return undefined;
}

// Reads the state the action is about to change. `body` is the raw request body, which Better Auth
// has not validated yet, so it is read defensively. Returns undefined when there is nothing to
// audit: an unknown Account or session token means the endpoint changes nothing (or fails).
export async function prepareAdminPluginAudit(
  path: string,
  body: unknown,
  actorId: string
): Promise<PendingAdminAudit | undefined> {
  const action = AUDITED_PLUGIN_ACTIONS[path];
  if (action === undefined || !isRecord(body)) return undefined;

  const base = {
    actorId,
    action,
    fields: [] as AuditedAccountField[],
    onlyChanged: false,
    before: null,
    reason: null
  };

  // The body names a session token, which is a secret: resolve its Account now, before the session
  // is gone, and keep only the Account id and the session's own id.
  if (action === AuditAction.ACCOUNT_REVOKE_SESSION) {
    if (typeof body.sessionToken !== "string") return undefined;
    const owner = await findSessionOwner(body.sessionToken);
    if (!owner) return undefined;

    return { ...base, targetId: owner.userId, sessionId: owner.id };
  }

  const targetId = targetIdOf(body);
  if (targetId === undefined) return undefined;

  const account = await findAccountForAudit(targetId);
  if (!account) return undefined;

  switch (action) {
    case AuditAction.ACCOUNT_REMOVE:
      // Erasing the name and email is the point of removal: keep neither.
      return { ...base, targetId };

    case AuditAction.ACCOUNT_REVOKE_SESSIONS:
      return { ...base, targetId, sessionCount: await countSessions(targetId) };

    case AuditAction.ACCOUNT_SET_ROLE:
      return { ...base, targetId, fields: ["role"], before: pick(account, ["role"]) };

    case AuditAction.ACCOUNT_BAN:
    case AuditAction.ACCOUNT_UNBAN:
      return {
        ...base,
        targetId,
        fields: BAN_FIELDS,
        before: pick(account, BAN_FIELDS),
        reason:
          action === AuditAction.ACCOUNT_BAN &&
          typeof body.banReason === "string" &&
          body.banReason !== ""
            ? body.banReason
            : null
      };

    default: {
      const fields = isRecord(body.data)
        ? Object.keys(body.data).filter(isAuditedField)
        : [];

      return {
        ...base,
        targetId,
        fields,
        onlyChanged: true,
        before: pick(account, fields)
      };
    }
  }
}

// Writes the entry for an action that succeeded. The "after" side is read back from the database, so
// it is what was stored, not what was asked for.
export async function recordAdminPluginAction(pending: PendingAdminAudit): Promise<void> {
  const entry = {
    actorId: pending.actorId,
    action: pending.action,
    targetType: AuditTargetType.ACCOUNT,
    targetId: pending.targetId,
    reason: pending.reason
  };

  if (pending.action === AuditAction.ACCOUNT_REMOVE) {
    await recordAdminAction({ ...entry, before: null, after: null });
    return;
  }

  if (pending.action === AuditAction.ACCOUNT_REVOKE_SESSION) {
    await recordAdminAction({
      ...entry,
      before: { sessionId: pending.sessionId },
      after: null
    });
    return;
  }

  if (pending.action === AuditAction.ACCOUNT_REVOKE_SESSIONS) {
    await recordAdminAction({
      ...entry,
      before: { sessionCount: pending.sessionCount },
      after: { sessionCount: await countSessions(pending.targetId) }
    });
    return;
  }

  const account = await findAccountForAudit(pending.targetId);
  const before = pending.before ?? {};
  const after = account ? pick(account, pending.fields) : {};

  if (!pending.onlyChanged) {
    await recordAdminAction({ ...entry, before, after });
    return;
  }

  const changed = pending.fields.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
  );

  await recordAdminAction({
    ...entry,
    before: pick(before as Fields, changed),
    after: pick(after as Fields, changed)
  });
}

export type AuditLogQuery = AuditLogFilters & { limit: number; offset: number };

export async function listAuditLog({ limit, offset, ...filters }: AuditLogQuery) {
  const [rows, total] = await Promise.all([
    findAuditEntries(filters, limit, offset),
    countAuditEntries(filters)
  ]);

  return {
    entries: rows.map(({ actorId, actorName, actorEmail, ...entry }) => ({
      ...entry,
      actor:
        actorId === null ? null : { id: actorId, name: actorName!, email: actorEmail! }
    })),
    total,
    limit,
    offset
  };
}
