import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Becan",
  description: "Sign in and return to the chapter you chose.",
};

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const sp = await props.searchParams;
  const next = (Array.isArray(sp.next) ? sp.next[0] : sp.next) || "";
  return (
    <AuthCard prefix="Sign" word="in">
      <SignInForm next={next} resetSuccess={sp.reset === "success"} />
    </AuthCard>
  );
}
