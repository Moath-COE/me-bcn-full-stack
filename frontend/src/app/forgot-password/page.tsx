import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Recover access — Becan",
  description: "Request a link to change your password.",
};

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const sp = await props.searchParams;
  return (
    <AuthCard prefix="Recover" word="access">
      <ForgotPasswordForm next={(Array.isArray(sp.next) ? sp.next[0] : sp.next) || ""} />
    </AuthCard>
  );
}
