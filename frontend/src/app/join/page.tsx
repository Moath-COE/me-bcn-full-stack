import type { Metadata } from "next";
import { BecanFace } from "@/components/ui/becan-face";
import { TypedHeadline } from "@/components/ui/typed-headline";
import { JoinForm } from "./join-form";
import { PageShell, SiteHeader } from "@/components/ui/kit";
import { getInstitutions } from "@/lib/institutions";

export const metadata: Metadata = {
  title: "Create your account — Becan",
  description: "Create your account and verify your email, then return to the chapter you chose.",
};

export default async function JoinPage(props: PageProps<"/join">) {
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v)?.trim() || "";

  const course = one(sp.course);
  const chapter = one(sp.chapter);
  const next = one(sp.next);
  const google = one(sp.method) === "google";
  const institutions = await getInstitutions();

  /* The context line shows even without query parameters, so a student who lands here
     directly still learns what signing up opens. */
  const unlocks = [course, chapter && `Chapter ${chapter}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageShell withFooter>
      <SiteHeader minimal />

      {/* A centred card on desktop. On phones the card's border drops: the narrow screen
          already frames the form. */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:px-8 md:py-14">
        <div className="w-full max-w-[27rem] md:rounded-xl md:border md:border-line md:bg-surface md:p-8 md:shadow-soft">
          <div className="flex items-center gap-3">
            <BecanFace className="w-20 shrink-0" />
            <TypedHeadline size="card" prefix="Create your" word="account" className="mt-0 min-w-0" />
          </div>

          <p className="mt-5 rounded-xl border border-aubergine-mid bg-tint-aubergine px-4 py-3 font-semibold text-ink">
            {unlocks ? `Signing up opens: ${unlocks}` : "Signing up opens your course where you left off"}
          </p>

          <JoinForm
            next={next}
            institutions={institutions}
            initialGoogle={google}
            noAccountNotice={google && one(sp.notice) === "no-account"}
            oauthError={one(sp.error)}
          />
        </div>
      </main>
    </PageShell>
  );
}
