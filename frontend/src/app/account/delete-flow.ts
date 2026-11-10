/* An account that only signs in with Google has no password. It is deleted without one, and the
   backend then requires a recently created session instead. `hasPassword` is `null` while the
   sign-in methods are still loading. */
export type DeletePlan =
  | { kind: "wait" }
  | { kind: "needPassword" }
  | { kind: "delete"; password: string | null };

export function planDelete(hasPassword: boolean | null, password: string): DeletePlan {
  if (hasPassword === null) return { kind: "wait" };
  if (!hasPassword) return { kind: "delete", password: null };
  return password ? { kind: "delete", password } : { kind: "needPassword" };
}
