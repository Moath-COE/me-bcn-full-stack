import { ArrowForward } from "@/components/ui/icons";
import { SubjectIcon } from "./subject-icon";
import { TONES } from "@/lib/courses/presentation";
import type { CourseSummary } from "@/lib/courses/schema";

/* The inside of a course card as the dashboard shows it. The wrapper belongs to each screen: the
   dashboard wraps this in a plain link, while the catalog draws the same layout with motion
   variants for its entrance and scroll animations. Here the stamp's hover movement is plain CSS. */

export function CourseCardBody({ course }: { course: CourseSummary }) {
  const tone = TONES[course.tone];

  return (
    <>
      {/* The stamp: the same icon at a large size, bleeding off the corner to give the card its
          texture. Low opacity keeps it from competing with the text. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-5 -end-5 block h-28 w-28 opacity-15 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${tone.icon}`}
      >
        <SubjectIcon icon={course.icon} className="h-full w-full" />
      </span>

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
          <SubjectIcon icon={course.icon} className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} />
          <h3 className={`line-clamp-2 font-display text-[15px] leading-snug font-semibold ${tone.title}`}>
            {course.name}
          </h3>
        </div>

        <p className={`mt-1.5 text-[11px] ${tone.meta}`}>{course.institution.name}</p>
      </div>
    </>
  );
}
