import { describe, expect, it } from "vitest";

import { admin, roles, student } from "../src/lib/access-control.js";

describe("access control roles", () => {
  it("lets an Admin run the tutor unlimited and update Courses", () => {
    expect(admin.authorize({ tutor: ["unlimited"] }).success).toBe(true);
    expect(admin.authorize({ course: ["update"] }).success).toBe(true);
  });

  it("gives an Admin every course action and every session action", () => {
    expect(
      admin.authorize({
        course: ["create", "read", "update", "delete", "publish"],
        session: ["list", "revoke", "delete"]
      }).success
    ).toBe(true);
  });

  it("lets only an Admin read the Audit log", () => {
    expect(admin.authorize({ audit: ["read"] }).success).toBe(true);
    expect(student.authorize({ audit: ["read"] }).success).toBe(false);
    expect(roles.user.statements.audit ?? []).toEqual([]);
    expect(roles.admin.statements.audit).toEqual(["read"]);
  });

  it("gives a Student no permission at all", () => {
    expect(student.authorize({ tutor: ["unlimited"] }).success).toBe(false);
    expect(student.authorize({ course: ["update"] }).success).toBe(false);
    expect(student.authorize({ user: ["list"] }).success).toBe(false);
    expect(student.authorize({ session: ["list"] }).success).toBe(false);
    expect(student.authorize({ audit: ["read"] }).success).toBe(false);
  });

  it("denies an Admin impersonation, setting passwords and creating Accounts", () => {
    expect(admin.authorize({ user: ["create"] }).success).toBe(false);
    expect(admin.authorize({ user: ["impersonate"] }).success).toBe(false);
    expect(admin.authorize({ user: ["impersonate-admins"] }).success).toBe(false);
    expect(admin.authorize({ user: ["set-password"] }).success).toBe(false);
  });

  it("grants no Role impersonation, password setting or Account creation", () => {
    for (const role of Object.values(roles)) {
      for (const action of [
        "create",
        "impersonate",
        "impersonate-admins",
        "set-password"
      ] as const) {
        expect(role.statements.user ?? []).not.toContain(action);
      }
    }
  });

  it("names the Student Role `user`, the Better Auth default", () => {
    expect(Object.keys(roles).sort()).toEqual(["admin", "user"]);
  });
});
