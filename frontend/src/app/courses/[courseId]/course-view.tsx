"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { PrimaryButton } from "@/components/ui/kit";
import { QuotaBlock, type CourseSlotQuota } from "@/components/ui/quota";
import type { UsedUpQuota } from "@/lib/allowance/presentation";
import { mutateEnrollment } from "./enrollment-mutation";
import { ArrowForward } from "@/components/ui/icons";
import { SubjectIcon } from "@/app/courses/subject-icon";
import type { Chapter, Course } from "@/lib/courses/schema";
import { TONES } from "@/lib/courses/presentation";

/* Anyone can browse the course page; opening a chapter needs an active enrollment in the course. */

/* "open": an unlimited (admin) account that is not enrolled; it starts published chapters directly. */
export type ViewState = "guest" | "new" | "enrolled" | "open";

/* Chapter cards are dark. The palette has no dark amber or walnut that works as a fill behind text,
   which leaves two families: aubergine and olive. Two alternating shades inside a family give the
   list a rhythm without leaving it. */
const SKINS = {
  purple: {
    fills: ["bg-aubergine-base", "bg-aubergine-deep"],
    meta: "text-aubergine-tint",
    arrow: "border-aubergine-soft text-on-dominant",
  },
  olive: {
    fills: ["bg-olive-dark", "bg-olive-deep"],
    meta: "text-olive-soft",
    arrow: "border-olive-soft text-on-dominant",
  },
} as const;

const skinOf = (tone: Course["tone"]) =>
  tone === "olive" || tone === "oliveDark" ? SKINS.olive : SKINS.purple;

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

function ChapterCard({
  chapter,
  course,
  state,
  opensUnpublished,
  joinHref,
  pending,
  disabled,
  onEnroll,
  quotaReached,
}: {
  chapter: Chapter;
  course: Course;
  state: ViewState;
  opensUnpublished: boolean;
  joinHref: string;
  pending: boolean;
  disabled: boolean;
  onEnroll: () => void;
  quotaReached: boolean;
}) {
  const skin = skinOf(course.tone);
  const fill = skin.fills[(chapter.number - 1) % skin.fills.length];
  /* An unpublished chapter is "Coming soon" with no action, except for an unlimited account, which
     opens it under an "Unpublished" tag. */
  const opens = chapter.published || opensUnpublished;
  const action = `inline-flex min-h-11 items-center rounded-pill border px-5 font-semibold ${skin.arrow}`;

  return (
    <li
      id={`ch-${chapter.number}`}
      data-theme="dark"
      className={`group relative flex scroll-mt-6 flex-col overflow-hidden rounded-xl p-4 shadow-soft transition-transform duration-200 ${fill} ${
        opens
          ? "hover:-translate-y-1.5 hover:shadow-lift"
          : "opacity-45"
      }`}
    >
      {/* The chapter number as a stamp that fills the card: it sits behind the content at low
          opacity, so it does not compete with the text despite its size. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-5 start-3 z-0 font-display text-[8rem] leading-none font-bold text-on-dominant opacity-[0.14] transition-opacity duration-200 select-none group-hover:opacity-25"
      >
        {chapter.number}
      </span>

      <div className="relative z-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-lg font-semibold text-on-dominant">{chapter.title}</h3>
          {!chapter.published && opensUnpublished ? (
            <span className={`rounded-pill border border-dashed px-2 py-0.5 text-[11px] font-semibold ${skin.arrow}`}>
              Unpublished
            </span>
          ) : null}
        </div>

        <p className={`mt-1 text-sm ${skin.meta}`}>
          {chapter.minutes} {plural(chapter.minutes, "minute", "minutes")}
          {" · "}
          {chapter.lessonCount} {plural(chapter.lessonCount, "lesson", "lessons")}
        </p>
      </div>

      <div className="relative z-10 mt-auto flex justify-end pt-4">
        {!opens ? (
          <span className={`rounded-pill border px-4 py-2 text-xs font-semibold ${skin.arrow}`}>Coming soon</span>
        ) : state === "enrolled" || state === "open" ? (
          <Link
            href={`/session/${course.id}/${chapter.number}`}
            className={`${action} gap-2 transition-colors hover:bg-pressable hover:text-on-pressable`}
          >
            Start the explanation<ArrowForward />
          </Link>
        ) : state === "guest" ? (
          <Link href={joinHref} className={action}>Enroll</Link>
        ) : quotaReached ? (
          <Link href="#quota" className={action}>Course limit reached</Link>
        ) : (
          <button
            type="button"
            disabled={pending || disabled}
            onClick={onEnroll}
            className={`${action} disabled:opacity-60`}
          >
            {pending ? "Enrolling…" : "Enroll"}
          </button>
        )}
      </div>
    </li>
  );
}

export function CourseView({
  course,
  enrollmentError,
  state,
  opensUnpublished,
  slotQuota,
  usedUp = null,
  limitNotice = false,
}: {
  course: Course;
  enrollmentError: boolean;
  state: ViewState;
  /* An unlimited account opens unpublished chapters, to test them before they are published. */
  opensUnpublished: boolean;
  slotQuota: CourseSlotQuota | null;
  /* The student can start sessions here but has used up their limits: a quiet block with what they
     studied and when the limits renew. */
  usedUp?: UsedUpQuota | null;
  /* The student arrived from a session that ended on its time limit, with limits left to spend. */
  limitNotice?: boolean;
}) {
  const tone = TONES[course.tone];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const joinHref = `/join?course=${encodeURIComponent(course.name)}&next=${encodeURIComponent(`/courses/${course.id}`)}`;
  const ready = course.publishedChapterCount;
  const quietButton = "inline-flex min-h-11 items-center rounded-pill border border-line px-5 font-semibold text-ink";

  const mutate = (method: "PUT" | "DELETE") => {
    if (pending || enrollmentError) return;
    setError(null);
    startTransition(async () => {
      try {
        await mutateEnrollment(course.id, method, () => router.refresh());
        setConfirmOpen(false);
      } catch {
        setError(method === "PUT"
          ? "We couldn’t enroll you in this course. Try again."
          : "We couldn’t un-enroll you. Try again.");
      }
    });
  };

  return (
    <>
      <div className="flex items-start gap-4">
        <span
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl md:h-20 md:w-20 ${tone.card}`}
        >
          <SubjectIcon
            icon={course.icon}
            className={`h-9 w-9 md:h-11 md:w-11 ${course.tone === "deep" ? "text-aubergine-tint" : tone.icon}`}
          />
        </span>

        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight font-bold text-ink md:text-5xl">
            {course.name} · <span className="text-ink-2">{course.code}</span>
          </h1>
          <p className="mt-2 text-ink-2">
            {course.institution.name} · {ready} {plural(ready, "chapter", "chapters")}
          </p>
        </div>
      </div>

      {usedUp ? (
        <div className="mt-6"><QuotaBlock {...usedUp} /></div>
      ) : limitNotice ? (
        <p className="mt-6 max-w-measure rounded-lg bg-tint-amber px-4 py-3 leading-base text-ink">
          Your session time is up. You can start a new one.
        </p>
      ) : null}

      <div className="mt-6">
        {state === "guest" ? (
          <PrimaryButton href={joinHref}>Enroll</PrimaryButton>
        ) : state === "open" ? null : state === "new" ? slotQuota !== null ? (
          <QuotaBlock id="quota" kind="slots-full" {...slotQuota} />
        ) : (
          <PrimaryButton type="button" disabled={pending || enrollmentError} onClick={() => mutate("PUT")}>
            {pending ? "Enrolling…" : "Enroll"}
          </PrimaryButton>
        ) : (
          <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Dialog.Trigger asChild>
              <button type="button" disabled={pending} className={`${quietButton} disabled:opacity-60`}>
                Un-enroll
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-ground/80" />
              <Dialog.Content
                data-theme="light"
                onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
                className="fixed top-1/2 start-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-6"
              >
                <Dialog.Title className="font-display text-2xl font-bold text-ink">
                  Un-enroll from this course?
                </Dialog.Title>
                <Dialog.Description className="mt-3 leading-base text-ink-2">
                  If you un-enroll from “{course.name}”, you can’t open its sessions. You can enroll again.
                </Dialog.Description>
                {error ? <p role="alert" className="mt-4 text-error">{error}</p> : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  <PrimaryButton type="button" disabled={pending} onClick={() => mutate("DELETE")}>
                    {pending ? "Un-enrolling…" : "Confirm un-enrollment"}
                  </PrimaryButton>
                  <Dialog.Close asChild>
                    <button type="button" ref={cancelRef} className={quietButton}>Keep my enrollment</button>
                  </Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
        {enrollmentError ? (
          <p role="alert" className="mt-3 text-error">
            We couldn’t check your enrollment. Reload the page to try again.
          </p>
        ) : error && !confirmOpen ? (
          <p role="alert" className="mt-3 text-error">{error}</p>
        ) : null}
      </div>

      <section aria-labelledby="chapters-heading" className="mt-9">
        <h2 id="chapters-heading" className="border-b border-line pb-3 text-lg font-bold text-ink">
          Chapters
        </h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {course.chapters.map((ch) => (
            <ChapterCard
              key={ch.number}
              chapter={ch}
              course={course}
              state={state}
              opensUnpublished={opensUnpublished}
              joinHref={joinHref}
              pending={pending}
              disabled={enrollmentError}
              quotaReached={slotQuota !== null}
              onEnroll={() => mutate("PUT")}
            />
          ))}
        </ul>
      </section>
    </>
  );
}
