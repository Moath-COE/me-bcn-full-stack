"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import Link from "next/link";
import { SubjectIcon } from "./subject-icon";
import { ArrowForward, Chevron, SearchIcon } from "@/components/ui/icons";
import { BecanFace, type LookPoint } from "@/components/ui/becan-face";
import { TypedHeadline } from "@/components/ui/typed-headline";
import { TONES } from "@/lib/courses/presentation";
import type { CourseSummary } from "@/lib/courses/schema";
import type { Institution } from "@/lib/institutions";

const MotionLink = motion.create(Link);

const spring = {
  transition: { type: "spring" as const, stiffness: 300, damping: 16 },
};

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-2">
        {label}
      </label>
      <div className="relative mt-2">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-14 w-full appearance-none rounded-xl border border-aubergine-deep bg-surface ps-4 pe-14 text-ink shadow-soft"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-aubergine-tint text-aubergine-base">
            <Chevron />
          </span>
        </span>
      </div>
    </div>
  );
}

let measureCtx: CanvasRenderingContext2D | null = null;

/* Where the text caret is on screen: measure the text typed up to the caret, then offset that
   width from the input's start edge. */
function caretPoint(input: HTMLInputElement): LookPoint {
  const box = input.getBoundingClientRect();
  const cs = getComputedStyle(input);
  const y = box.top + box.height / 2;

  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return { x: box.left + 56, y };

  measureCtx.font = [cs.fontWeight, cs.fontSize, cs.fontFamily].join(" ");
  const upToCaret = input.value.slice(0, input.selectionStart ?? input.value.length);
  const padStart = parseFloat(cs.paddingInlineStart || "0");
  const x = box.left + padStart + measureCtx.measureText(upToCaret).width;

  return { x: Math.min(box.right, x), y };
}

/** A direct intersection observer: more reliable than `useInView` on a `motion.a` that has `layout`. */
function useInViewport(ref: React.RefObject<Element | null>, threshold = 0.6) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return inView;
}

/** Touch devices have no hover, so a card plays its animation when it scrolls into view. */
function useTouch() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(hover: none)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(hover: none)").matches,
    () => false,
  );
}

function CourseCard({
  course,
  reduce,
  touch,
}: {
  course: CourseSummary;
  reduce: boolean;
  touch: boolean;
}) {
  const tone = TONES[course.tone];
  const ref = useRef<HTMLAnchorElement>(null);
  const inView = useInViewport(ref, 0.6);
  const playOnScroll = touch && inView && !reduce;
  const ready = course.publishedChapterCount;

  const card: Variants = reduce
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1 },
        play: { opacity: 1 },
        hover: {},
      }
    : {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0 },
        play: { opacity: 1, y: 0 },
        hover: {
          y: -10,
          transition: { type: "spring" as const, stiffness: 320, damping: 18 },
        },
      };

  return (
    <MotionLink
      layout
      href={`/courses/${course.id}`}
      ref={ref}
      variants={card}
      initial="hidden"
      animate={playOnScroll ? "play" : "show"}
      exit="hidden"
      whileHover={touch || reduce ? undefined : "hover"}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={`group relative flex min-h-36 flex-col justify-between overflow-hidden rounded-lg border p-3 shadow-soft hover:shadow-lift ${tone.card}`}
    >
      {/* The stamp: the same icon at a large size, bleeding off the corner to give the card its
          texture. Low opacity keeps it from competing with the text. */}
      <motion.span
        aria-hidden="true"
        variants={
          reduce
            ? undefined
            : {
                hover: { scale: 1.12, rotate: -8, ...spring },
                play: { scale: 1.12, rotate: -8, ...spring },
              }
        }
        className={`pointer-events-none absolute -bottom-5 -end-5 block h-28 w-28 opacity-15 ${tone.icon}`}
      >
        <SubjectIcon icon={course.icon} className="h-full w-full" />
      </motion.span>

      <div className="relative flex items-start justify-between gap-2">
        <span className={`rounded-pill border px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
          {course.code}
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border transition-colors group-hover:bg-pressable group-hover:text-on-pressable ${tone.arrow}`}
        >
          <ArrowForward className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* The small icon sits right against the name so the two read as one unit. */}
      <div className="relative mt-3">
        <div className="flex items-start gap-2">
          <SubjectIcon
            icon={course.icon}
            className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`}
          />
          <h3
            className={`line-clamp-2 font-display text-[15px] leading-snug font-semibold ${tone.title}`}
          >
            {course.name}
          </h3>
        </div>
        <p className={`mt-1.5 text-[11px] ${tone.meta}`}>{course.institution.name}</p>
        <p className={`mt-2 text-xs ${tone.meta}`}>
          {ready === 0 ? "Coming soon" : `${ready} ${plural(ready, "chapter", "chapters")} ready`}
        </p>
      </div>
    </MotionLink>
  );
}

export function Finder({ institutions, courses, institutionId }: {
  institutions: Institution[];
  courses: CourseSummary[];
  institutionId?: string;
}) {
  const [query, setQuery] = useState("");
  const [university, setUniversity] = useState(institutionId ?? institutions[0]?.id ?? "all");
  const reduce = useReducedMotion() ?? false;
  const touch = useTouch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [look, setLook] = useState<LookPoint>(null);

  /* The face follows the text caret, and looks ahead again when the field loses focus. */
  const trackCaret = () => {
    const el = inputRef.current;
    if (el) setLook(caretPoint(el));
  };

  const search = query.trim();
  const results = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter((c) => {
      const byUniversity = university === "all" || c.institution.id === university;
      const byQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.code.replace(" ", "").toLowerCase().includes(q.replace(" ", ""));
      return byUniversity && byQuery;
    });
  }, [search, courses, university]);

  const empty = results.length === 0;

  return (
    <>
      <section className="mx-auto w-full max-w-page px-4 pt-12 pb-8 md:px-8 md:pt-20 xl:px-10">
        <p className="text-sm font-semibold text-ink-2">Choose a course</p>

        <div className="mt-3 flex items-center gap-4">
          <BecanFace className="w-24 shrink-0 md:w-32 xl:w-36" lookAt={look} />
          <TypedHeadline prefix="What’s your" word="course" suffix="?" className="mt-0" />
        </div>

        <div className="relative mt-9 max-w-measure">
          <label htmlFor="finder" className="sr-only">
            Find your course
          </label>
          <span className="pointer-events-none absolute inset-y-0 start-5 flex items-center text-ink-2">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            id="finder"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              trackCaret();
            }}
            onFocus={trackCaret}
            onSelect={trackCaret}
            onKeyUp={trackCaret}
            onBlur={() => setLook(null)}
            placeholder="Search by course name or code"
            className="h-16 w-full rounded-xl border border-aubergine-deep bg-surface ps-14 pe-5 text-lg text-ink shadow-soft placeholder:text-ink-2"
          />
        </div>

        <div className="mt-4 grid max-w-measure gap-3">
          <Select id="f-university" label="University" value={university} onChange={setUniversity}>
            <option value="all">All universities</option>
            {institutions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="mx-auto w-full max-w-page px-4 pb-16 md:px-8 xl:px-10">
        <p aria-live="polite" className="text-sm text-ink-2">
          {empty ? "No results" : `${results.length} ${plural(results.length, "course", "courses")}`}
        </p>

        {empty ? (
          search ? (
            <div className="mt-4 max-w-measure rounded-xl border border-aubergine-deep bg-surface p-8 shadow-soft">
              <p className="font-display text-3xl leading-snug font-bold text-ink">
                We couldn’t find <span className="text-warmth">{search}</span>
              </p>
            </div>
          ) : null
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {results.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  reduce={reduce}
                  touch={touch}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </>
  );
}
