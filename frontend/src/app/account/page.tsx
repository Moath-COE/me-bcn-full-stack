import type { Metadata } from "next";
import { PageShell, Section, SiteHeader } from "@/components/ui/kit";
import { getAllowance } from "@/lib/allowance/server";
import { accountReturnPath } from "@/lib/auth/next-path";
import { requireAccount } from "@/lib/auth/session";
import { getInstitutions } from "@/lib/institutions";
import { AccountCard } from "./account-ui";
import { DeleteAccount } from "./delete-account";
import { PlanUsage } from "./plan-usage";
import { ProfileForm } from "./profile-form";
import { SignOut } from "./sign-out";

export const metadata: Metadata = { title: "Account — Becan" };

export default async function AccountPage(props: PageProps<"/account">) {
  const searchParams = await props.searchParams;
  const [session, institutions, allowance] = await Promise.all([
    requireAccount(accountReturnPath("/account", searchParams)),
    getInstitutions(),
    getAllowance(),
  ]);
  // Set when a Google re-authentication for account deletion comes back with an error.
  const googleError = (Array.isArray(searchParams.error) ? searchParams.error[0] : searchParams.error) || "";

  return (
    <PageShell>
      <SiteHeader />

      <Section className="pt-8 pb-16 md:pt-12">
        <div className="mx-auto max-w-2xl">
          <h1 className="font-display text-3xl leading-tight font-bold text-ink md:text-4xl">Account</h1>
          <p className="mt-3 max-w-measure leading-base text-ink-2">
            Your name, phone and university save as you edit them. Email and password change in an explicit
            step.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            <ProfileForm account={session.user} institutions={institutions} />

            <PlanUsage allowance={allowance.ok ? allowance.data : null} />

            <AccountCard title="Sign out">
              <p className="mt-2 max-w-measure text-sm leading-base text-ink-2">
                Signs you out on this device only.
              </p>
              <SignOut />
            </AccountCard>

            <AccountCard title="Delete account">
              <p className="mt-2 max-w-measure text-sm leading-base text-ink-2">
                Deleting your account permanently removes your details, your enrollments and your session
                history. It can’t be undone.
              </p>
              <DeleteAccount googleError={googleError} />
            </AccountCard>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
