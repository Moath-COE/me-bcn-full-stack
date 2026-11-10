// Asks whether an Account may do something. Always ask by permission, never by Role name: adding
// a narrower Role later then only means editing src/lib/access-control.ts.
import { APIError } from "better-auth/api";

import { findTwoFactorEnabled } from "../repositories/user.repository.js";
import { auth } from "../lib/auth.js";
import type { statements } from "../lib/access-control.js";

type Statements = typeof statements;

// One or more actions per resource, e.g. `{ tutor: ["unlimited"] }`. Every listed action must be held.
export type PermissionRequest = {
  [Resource in keyof Statements]?: Statements[Resource][number][];
};

export async function accountHasPermission(
  userId: string,
  permissions: PermissionRequest
): Promise<boolean> {
  try {
    const { success } = await auth.api.userHasPermission({
      body: { userId, permissions }
    });

    return success;
  } catch (error) {
    // Better Auth answers an unknown Account (for example a deleted one) with 400 "user not found".
    if (error instanceof APIError && error.status === "BAD_REQUEST") return false;

    throw error;
  }
}

// True when the Account may study without limits: it holds `tutor:unlimited` and has two-factor on.
// Both are read from the database, so a demoted Admin, or one who turned two-factor off, stops being
// unlimited at once. An Admin without two-factor is treated as a Student.
export async function isUnlimitedAccount(userId: string): Promise<boolean> {
  return (
    (await accountHasPermission(userId, { tutor: ["unlimited"] })) &&
    (await findTwoFactorEnabled(userId))
  );
}
