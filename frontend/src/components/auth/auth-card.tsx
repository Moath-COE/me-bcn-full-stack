import { BecanFace } from "@/components/ui/becan-face";
import { TypedHeadline } from "@/components/ui/typed-headline";
import { PageShell, SiteHeader } from "@/components/ui/kit";

/** The frame of every auth screen. The heading reads `prefix word`, with the brush stroke under `word`. */
export function AuthCard({
  prefix,
  word,
  children,
}: {
  prefix: string;
  word: string;
  children: React.ReactNode;
}) {
  return (
    <PageShell withFooter>
      <SiteHeader minimal />
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:px-8 md:py-14">
        <div className="w-full max-w-[27rem] md:rounded-xl md:border md:border-line md:bg-surface md:p-8 md:shadow-soft">
          <div className="flex items-center gap-3">
            <BecanFace className="w-20 shrink-0" />
            <TypedHeadline size="card" prefix={prefix} word={word} className="mt-0 min-w-0" />
          </div>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </PageShell>
  );
}
