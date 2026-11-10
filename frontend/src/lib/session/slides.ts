/* The pure slides logic: card ratio, current slide, each card's mark, and the centring offset.
   The component (`slides-pdf.tsx`) only draws. */

/* Typical slides are 4:3; used until the file's real ratio has been read. */
export const DEFAULT_SLIDE_RATIO = 4 / 3;

/* Width-to-height ratio of a page in the file, or the default when the dimensions are unusable. */
export function slideRatio(width: number, height: number): number {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? width / height
    : DEFAULT_SLIDE_RATIO;
}

export type PickedSlide = { page: number; agentPage: number | null };

export type CurrentSlide = {
  /* The slide the column is open on now: the student's pick or the tutor's slide. */
  page: number;
  /* The tutor's slide (from `scroll`), or null before it asks for one. */
  tutorPage: number | null;
  /* The student picked a slide and the pick still stands. */
  pickedActive: boolean;
};

/* The student's pick stands until the tutor asks for a slide other than the one it was on
   when the student picked. */
export function currentSlide({
  picked,
  agentPage,
  numPages,
}: {
  picked: PickedSlide | null;
  agentPage: number | null;
  numPages: number;
}): CurrentSlide {
  const clamp = (p: number) => (numPages > 0 ? Math.min(Math.max(p, 1), numPages) : p);
  const pickedActive = picked !== null && picked.agentPage === agentPage;
  const tutorPage = agentPage === null ? null : clamp(agentPage);
  return {
    page: pickedActive ? clamp(picked.page) : (tutorPage ?? 1),
    tutorPage,
    pickedActive,
  };
}

/* A card's mark:
   now    - the slide the tutor is explaining: warm frame and a "Now" tag
   picked - a slide the student picked that is not the tutor's: neutral frame, no tag
   start  - the tutor has not asked for a slide yet and slide 1 is open: warm frame, no tag
   other  - everything else: dimmed */
export type SlideMark = "now" | "picked" | "start" | "other";

export function slideMark(p: number, current: CurrentSlide): SlideMark {
  if (current.tutorPage !== null && p === current.tutorPage) return "now";
  if (current.pickedActive && p === current.page) return "picked";
  if (current.tutorPage === null && !current.pickedActive && p === current.page) return "start";
  return "other";
}

/* How far to scroll, on one axis, so the item's centre lands on the container's centre. */
export function centerDelta(
  containerStart: number,
  containerSize: number,
  itemStart: number,
  itemSize: number,
): number {
  return itemStart + itemSize / 2 - (containerStart + containerSize / 2);
}

/* Whether the item lies fully inside the container on that axis. */
export function isWithin(
  containerStart: number,
  containerSize: number,
  itemStart: number,
  itemSize: number,
): boolean {
  return itemStart >= containerStart && itemStart + itemSize <= containerStart + containerSize;
}
