import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Change your password — Becan",
  description: "Choose a new password for your account.",
};

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const sp = await props.searchParams;
  return (
    <AuthCard prefix="Change your" word="password">
      <ResetPasswordForm
        next={(Array.isArray(sp.next) ? sp.next[0] : sp.next) || ""}
        token={(Array.isArray(sp.token) ? sp.token[0] : sp.token) || ""}
        queryError={(Array.isArray(sp.error) ? sp.error[0] : sp.error) || ""}
      />
    </AuthCard>
  );
}
