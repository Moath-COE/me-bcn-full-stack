import type { Metadata } from "next";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = {
  title: "Verify your email — Becan",
  description:
    "Verify your email using the link to sign in to your account and pick up where you left off.",
};

export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const sp = await props.searchParams;
  return (
    <VerifyEmailForm
      next={(Array.isArray(sp.next) ? sp.next[0] : sp.next) || ""}
      email={(Array.isArray(sp.email) ? sp.email[0] : sp.email) || ""}
      queryError={(Array.isArray(sp.error) ? sp.error[0] : sp.error) || ""}
    />
  );
}
