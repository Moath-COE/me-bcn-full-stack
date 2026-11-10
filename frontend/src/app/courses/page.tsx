import type { Metadata } from "next";
import { getInstitutions } from "@/lib/institutions";
import { getCourses } from "@/lib/courses/server";
import { getAccount } from "@/lib/auth/session";
import { PageShell, SiteHeader } from "@/components/ui/kit";
import { Finder } from "./finder";

export const metadata: Metadata = {
  title: "What’s your course? — Becan",
  description: "Find your course by name or code and start with the first chapter.",
};

export default async function CoursesPage() {
  const [institutions, courses, account] = await Promise.all([getInstitutions(), getCourses(), getAccount()]);

  return (
    <PageShell withFooter>
      <SiteHeader />
      <Finder
        institutions={institutions}
        courses={courses.ok ? courses.data : []}
        institutionId={account?.user.institutionId}
      />
    </PageShell>
  );
}
