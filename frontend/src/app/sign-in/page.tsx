import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { signInErrorRoute } from "@/lib/auth/google";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Becan",
  description: "Sign in and return to the chapter you chose.",
};

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const sp = await props.searchParams;
  const next = (Array.isArray(sp.next) ? sp.next[0] : sp.next) || "";
  const oauthError = (Array.isArray(sp.error) ? sp.error[0] : sp.error) || "";
  const route = signInErrorRoute(oauthError, next);
  /* A Google email without an account cannot sign in here; sign-up continues in Google mode
     on the join page. */
  if (route.kind === "join") redirect(`/join?${new URLSearchParams(route.query)}`);
  return (
    <AuthCard prefix="Sign" word="in">
      <SignInForm
        next={next}
        resetSuccess={sp.reset === "success"}
        oauthErrorKey={route.kind === "message" ? route.key : null}
      />
    </AuthCard>
  );
}
