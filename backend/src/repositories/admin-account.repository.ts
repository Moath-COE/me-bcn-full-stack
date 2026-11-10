// Reads on the user row for the admin Account routes. The Accounts list selects only the columns it may
// show: passwords live in `account`, tokens in `session` and two-factor secrets in `two_factor`, and none of
// those tables is touched here.
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { db } from "../db/index.js";
import { institution, major, user } from "../db/schema/index.js";

// Whether an Account exists, for the admin routes under /admin/accounts/:accountId.
export async function accountExists(accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, accountId))
    .limit(1);

  return row !== undefined;
}

// The address an Account's email goes to, and whether it is verified. Nothing else is read.
export async function findAccountEmail(accountId: string) {
  const [row] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, accountId))
    .limit(1);

  return row;
}

export type AdminAccountFilters = {
  search?: string;
  role?: "user" | "admin";
  institutionId?: string;
  majorId?: string;
  banned?: boolean;
};

export type AdminAccountSortBy = "createdAt" | "name" | "email";

export type AdminAccountSort = {
  sortBy: AdminAccountSortBy;
  sortDirection: "asc" | "desc";
};

// `%`, `_` and `\` are LIKE wildcards; escape them so a search is always a plain substring.
function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

function whereClause(filters: AdminAccountFilters): SQL | undefined {
  return and(
    filters.search === undefined
      ? undefined
      : or(
          ilike(user.name, containsPattern(filters.search)),
          ilike(user.email, containsPattern(filters.search)),
          ilike(user.phoneNumber, containsPattern(filters.search))
        ),
    filters.role === undefined ? undefined : eq(user.role, filters.role),
    filters.institutionId === undefined
      ? undefined
      : eq(user.institutionId, filters.institutionId),
    filters.majorId === undefined ? undefined : eq(user.majorId, filters.majorId),
    filters.banned === undefined ? undefined : eq(user.banned, filters.banned)
  );
}

const sortColumns = {
  createdAt: user.createdAt,
  name: user.name,
  email: user.email
} as const;

export async function findAdminAccounts(
  filters: AdminAccountFilters,
  { sortBy, sortDirection }: AdminAccountSort,
  limit: number,
  offset: number
) {
  const direction = sortDirection === "asc" ? asc : desc;

  return (
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        role: user.role,
        banned: user.banned,
        banExpires: user.banExpires,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        institutionId: institution.id,
        institutionNameAr: institution.nameAr,
        institutionNameEn: institution.nameEn,
        majorId: major.id,
        majorNameAr: major.nameAr,
        majorNameEn: major.nameEn
      })
      .from(user)
      .innerJoin(institution, eq(user.institutionId, institution.id))
      .innerJoin(major, eq(user.majorId, major.id))
      .where(whereClause(filters))
      // `id` breaks ties so paging is stable.
      .orderBy(direction(sortColumns[sortBy]), direction(user.id))
      .limit(limit)
      .offset(offset)
  );
}

export async function countAdminAccounts(filters: AdminAccountFilters): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(user)
    .where(whereClause(filters));

  return row?.total ?? 0;
}
