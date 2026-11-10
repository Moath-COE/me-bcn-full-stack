import { safeNext } from "./next-path";

/** Where the link in the verification email lands; it carries the destination through the email round trip. */
export function buildVerifyCallbackURL(next: string | null | undefined): string {
  return `/verify-email?${new URLSearchParams({ next: safeNext(next) })}`;
}
