import type { Institution } from "@/lib/institutions";
import type { AuthErrorKey } from "./errors";
import { validateJoinStepOne, validateJoinStepTwo } from "./join-validation";

export type JoinField =
  | "name"
  | "email"
  | "password"
  | "phoneNumber"
  | "institutionId"
  | "majorId";
export type JoinIssue = {
  field: JoinField | "form";
  key: AuthErrorKey | "nameRequired";
};
export type JoinStep = 1 | 2;

type JoinValues = {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  institutionId: string;
  majorId: string;
};

export type JoinSubmitPlan =
  | { kind: "issue"; step: JoinStep; issue: JoinIssue }
  | { kind: "advance" }
  | { kind: "submit" };

export function planJoinSubmit(
  step: JoinStep,
  values: JoinValues,
  institutions: Institution[],
): JoinSubmitPlan {
  const first = validateJoinStepOne(values);
  if (first) return { kind: "issue", step: 1, issue: first };
  if (step === 1) return { kind: "advance" };
  const second = validateJoinStepTwo(values, institutions);
  if (second) return { kind: "issue", step: 2, issue: second };
  return { kind: "submit" };
}

/* Where an error from the backend is shown: email and password errors belong to step 1, the
   study details to step 2. */
export function joinIssueTarget(key: AuthErrorKey): { field: JoinIssue["field"]; step: JoinStep } {
  const field: JoinIssue["field"] =
    key === "emailTaken" || key === "invalidEmail" ? "email"
    : key === "passwordTooShort" || key === "passwordTooLong" || key === "invalidPassword"
      ? "password"
    : key === "invalidPhoneNumber" || key === "phoneNumberTaken" ? "phoneNumber"
    : key === "invalidInstitution" ? "institutionId"
    : key === "invalidMajor" ? "majorId"
    : "form";
  return { field, step: field === "email" || field === "password" ? 1 : 2 };
}
