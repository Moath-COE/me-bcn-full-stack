import type { Metadata } from "next";
import { getEnrollments } from "@/lib/courses/server";
import { DashboardView } from "./dashboard-view";
import { requireAccount } from "@/lib/auth/session";
import { accountReturnPath } from "@/lib/auth/next-path";
import { getAllowance } from "@/lib/allowance/server";
import { usedUpQuota } from "@/lib/allowance/presentation";

export const metadata: Metadata = { title: "My courses — Becan" };

/** The student's dashboard: the courses they are enrolled in. */
export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { user } = await requireAccount(accountReturnPath("/dashboard", await props.searchParams));

  const [enrollments, allowance] = await Promise.all([getEnrollments(), getAllowance()]);
  return (
    <DashboardView
      name={user.name}
      enrollments={enrollments.ok ? enrollments.data : null}
      quota={usedUpQuota(allowance.ok ? allowance.data : null)}
    />
  );
}
