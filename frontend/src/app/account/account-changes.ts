import { toE164Saudi } from "@/lib/auth/phone";
import type { Account } from "@/lib/auth/types";
import type { Institution } from "@/lib/institutions";

export type SavedAccount = Pick<Account, "name" | "phoneNumber" | "institutionId" | "majorId">;

export type AccountChange =
  | { field: "name"; value: string }
  | { field: "phoneNumber"; value: string }
  | { field: "study"; institutionId: string; majorId: string };

/* Decides what an edit to one profile field should do: nothing, show a validation error, or send
   exactly the changed values to the backend. University and major are saved together, once a major
   of the chosen university is picked. */
export function planAccountChange(saved: SavedAccount, change: AccountChange, institutions: Institution[]) {
  if (change.field === "name") {
    const name = change.value.trim();
    if (!name) return { kind: "invalid", field: "name", error: "Enter your name before saving it" } as const;
    if (name === saved.name) return { kind: "unchanged" } as const;
    return { kind: "save", values: { name } } as const;
  }

  if (change.field === "phoneNumber") {
    const phoneNumber = toE164Saudi(change.value);
    if (!phoneNumber) {
      return { kind: "invalid", field: "phoneNumber", error: "Enter a valid Saudi mobile number" } as const;
    }
    if (phoneNumber === saved.phoneNumber) return { kind: "unchanged" } as const;
    return { kind: "save", values: { phoneNumber } } as const;
  }

  if (!change.majorId) return { kind: "incomplete" } as const;
  const institution = institutions.find((item) => item.id === change.institutionId);
  if (!institution?.majors.some((major) => major.id === change.majorId)) {
    return { kind: "invalid", field: "majorId", error: "Choose a major from this university" } as const;
  }
  if (change.institutionId === saved.institutionId && change.majorId === saved.majorId) {
    return { kind: "unchanged" } as const;
  }
  return { kind: "save", values: { institutionId: change.institutionId, majorId: change.majorId } } as const;
}
