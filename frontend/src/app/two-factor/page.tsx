import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = {
  title: "Two-factor verification — Becan",
  description: "Finish signing in with the code from your authenticator app.",
};

export default async function TwoFactorPage(props: PageProps<"/two-factor">) {
  const sp = await props.searchParams;
  return (
    <AuthCard prefix="Finish" word="signing in">
      <TwoFactorForm next={(Array.isArray(sp.next) ? sp.next[0] : sp.next) || ""} />
    </AuthCard>
  );
}
