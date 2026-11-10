// Rules for the Account fields Becan adds to the user row. Better Auth's database hooks call these
// on every create and update, so they hold no matter which endpoint wrote the row.
import {
  findMajorInstitutionId,
  institutionExists
} from "../repositories/institution.repository.js";
import {
  findUserIdByPhoneNumber,
  findUserPlacement,
  setRoleByEmail
} from "../repositories/user.repository.js";
import type { roles } from "../lib/access-control.js";
import { AppError } from "../utils/app-error.js";

// The web maps these to localized messages; keep them stable.
export const AccountErrorCode = {
  INVALID_PHONE_NUMBER: "INVALID_PHONE_NUMBER",
  INVALID_INSTITUTION: "INVALID_INSTITUTION",
  INVALID_MAJOR: "INVALID_MAJOR",
  PHONE_NUMBER_TAKEN: "PHONE_NUMBER_TAKEN"
} as const;

const SAUDI_MOBILE_E164 = /^\+9665\d{8}$/;

// The user row data Better Auth is about to write; values are unchecked input.
type AccountFields = {
  phoneNumber?: unknown;
  institutionId?: unknown;
  majorId?: unknown;
  [field: string]: unknown;
};

function invalid(code: keyof typeof AccountErrorCode, message: string): AppError {
  return new AppError(400, message, AccountErrorCode[code]);
}

function assertPhoneNumberFormat(phoneNumber: unknown): asserts phoneNumber is string {
  if (typeof phoneNumber !== "string" || !SAUDI_MOBILE_E164.test(phoneNumber)) {
    throw invalid(
      "INVALID_PHONE_NUMBER",
      "Phone number must be a Saudi mobile in E.164 format"
    );
  }
}

async function assertPhoneNumberAvailable(
  phoneNumber: string,
  ownerId?: string
): Promise<void> {
  const holderId = await findUserIdByPhoneNumber(phoneNumber);

  if (holderId !== undefined && holderId !== ownerId) {
    throw invalid("PHONE_NUMBER_TAKEN", "Phone number is already in use");
  }
}

async function assertPlacement(institutionId: unknown, majorId: unknown): Promise<void> {
  if (typeof institutionId !== "string" || !(await institutionExists(institutionId))) {
    throw invalid("INVALID_INSTITUTION", "Institution does not exist");
  }

  if (
    typeof majorId !== "string" ||
    (await findMajorInstitutionId(majorId)) !== institutionId
  ) {
    throw invalid("INVALID_MAJOR", "Major does not belong to the institution");
  }
}

export async function assertValidNewAccount(fields: AccountFields): Promise<void> {
  assertPhoneNumberFormat(fields.phoneNumber);
  await assertPlacement(fields.institutionId, fields.majorId);
  await assertPhoneNumberAvailable(fields.phoneNumber);
}

// Only fields present in the update are checked. A Major is checked against the incoming
// Institution or, when only the Major changes, the Account's current one.
export async function assertValidAccountUpdate(
  userId: string | undefined,
  fields: AccountFields
): Promise<void> {
  const { phoneNumber, institutionId, majorId } = fields;

  if (phoneNumber !== undefined) {
    assertPhoneNumberFormat(phoneNumber);
  }

  if (institutionId !== undefined || majorId !== undefined) {
    const current = userId === undefined ? undefined : await findUserPlacement(userId);

    await assertPlacement(
      institutionId ?? current?.institutionId,
      majorId ?? current?.majorId
    );
  }

  if (phoneNumber !== undefined) {
    await assertPhoneNumberAvailable(phoneNumber, userId);
  }
}

const ADMIN_ROLE = "admin" satisfies keyof typeof roles;

// Gives an existing Account the Admin Role. The first Admin is made this way (`pnpm admin:promote`).
// Already an Admin is not an error. Open Device sessions keep the old Role for up to the cookie
// cache age (5 minutes); permission checks that must see the change read the user row.
export async function promoteToAdmin(
  email: string
): Promise<{ userId: string; alreadyAdmin: boolean }> {
  const change = await setRoleByEmail(email, ADMIN_ROLE);

  if (!change) {
    throw new AppError(404, `No Account has the email ${email}`, "ACCOUNT_NOT_FOUND");
  }

  return { userId: change.id, alreadyAdmin: change.previousRole === ADMIN_ROLE };
}
