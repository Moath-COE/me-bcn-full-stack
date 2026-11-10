// Reads on the Better Auth `user` table (the "user row"). Better Auth owns writes to it, except the
// Role promotion below, which has no Better Auth endpoint that works without an Admin session.
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { user } from "../db/schema/index.js";

export type UserPlacement = { institutionId: string; majorId: string };

export async function findUserIdByPhoneNumber(
  phoneNumber: string
): Promise<string | undefined> {
  const row = await db.query.user.findFirst({
    columns: { id: true },
    where: { phoneNumber }
  });

  return row?.id;
}

export async function findUserPlacement(
  userId: string
): Promise<UserPlacement | undefined> {
  return db.query.user.findFirst({
    columns: { institutionId: true, majorId: true },
    where: { id: userId }
  });
}

// Read from the user row, never the cookie-cached session, so turning two-factor off takes effect
// at once.
export async function findTwoFactorEnabled(userId: string): Promise<boolean> {
  const row = await db.query.user.findFirst({
    columns: { twoFactorEnabled: true },
    where: { id: userId }
  });

  return row?.twoFactorEnabled === true;
}

export type RoleChange = { id: string; previousRole: string };

// Sets the Role on the Account with this email (stored lowercased). Returns undefined when no
// Account has it, else the Role it replaced.
export async function setRoleByEmail(
  email: string,
  role: string
): Promise<RoleChange | undefined> {
  return db.transaction(async (tx) => {
    const current = await tx.query.user.findFirst({
      columns: { id: true, role: true },
      where: { email: email.toLowerCase() }
    });

    if (!current) return undefined;

    await tx.update(user).set({ role }).where(eq(user.id, current.id));

    return { id: current.id, previousRole: current.role };
  });
}

// The Role as stored on the user row (a comma-separated list for Better Auth), or undefined for an
// unknown Account. Read fresh: a cached session can lag a promotion by minutes.
export async function findUserRole(userId: string): Promise<string | undefined> {
  const row = await db.query.user.findFirst({
    columns: { role: true },
    where: { id: userId }
  });

  return row?.role;
}
