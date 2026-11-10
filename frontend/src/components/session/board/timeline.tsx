import { useId } from "react";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";
import { decorate, decorationAttrs, penAttrs, type Decoration } from "@/lib/session/board/marks";
import type { TutorLanguage } from "@/lib/session/tutor-language";
import { MARK_LABEL } from "./labels";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";

/* A single ordered timeline.

   The axis always runs left to right, whatever the board language: the
   order of the divisions is authored and follows the numbers, not the
   direction of the sentence, so "given → result" never flips on an
   Arabic board. The direction is set on the scrolling container itself,
   not on the axis alone: a right-to-left container would start scrolled
   to the right and show the last division before the first. Each label
   takes its direction from its own text.

   Only what has been revealed is rendered: a hidden division and its
   markers are absent from the tree, so a screen reader cannot read them
   and the student cannot infer them. The column count is still computed
   from the total, so the space is reserved and the axis does not jump
   each time a division is revealed.

   On a phone the axis neither wraps onto a second line nor reorders: it
   takes its natural width inside a container that scrolls horizontally
   on its own, and the student's scroll position is never moved for them. */

/** The narrowest width at which a wrapping division label is still readable. */
const DIVISION_MIN_REM = 7;

/** The state as words for a screen reader, which gets neither the icon nor the colour. */
function stateLabels(decoration: Decoration, language: TutorLanguage): string[] {
  const labels: string[] = [];
  if (decoration.answer) labels.push(MARK_LABEL[decoration.answer][language]);
  if (decoration.highlight) labels.push(MARK_LABEL.highlight[language]);
  if (decoration.dim) labels.push(MARK_LABEL.dim[language]);
  if (decoration.strike) labels.push(MARK_LABEL.strike[language]);
  if (decoration.focus) labels.push(MARK_LABEL.focus[language]);
  return labels;
}

export function TimelineItem({ item, language }: BoardKindProps<"timeline">) {
  const { axisLabel, divisions, markers } = item.payload;
  const labelId = useId();
  const spans = item.marks.filter((mark) => mark.scope === "span");
  const total = divisions.length;
  const visible = Math.min(item.revealed, total);

  return (
    <div data-timeline="" className="min-w-0 leading-base text-ink">
      <p dir="auto" id={labelId} className="mb-2 text-sm font-semibold text-ink-2">
        <RichTextCore wrap="none" text={axisLabel} markup pen={item.pen} spans={spans} />
      </p>
      <div
        dir="ltr"
        role="group"
        aria-labelledby={labelId}
        tabIndex={0}
        className="max-w-full overflow-x-auto overscroll-x-contain pb-1"
      >
        <div
          className="relative w-full"
          style={{ minWidth: `${total * DIVISION_MIN_REM}rem` }}
        >
          {/* The line joins the centre of the first column to the centre of the
              last visible one, so it never reaches a division not yet revealed. */}
          {visible > 1 ? (
            <span
              aria-hidden="true"
              data-timeline-line=""
              className="absolute top-[11px] h-0.5 rounded-pill bg-ink-2"
              style={{
                insetInlineStart: `${50 / total}%`,
                width: `${((visible - 1) * 100) / total}%`,
              }}
            />
          ) : null}
          <ol
            className="relative grid"
            style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          >
            {divisions.slice(0, visible).map((division, index) => {
              const decoration = decorate(item, { scope: "division", index });
              const attached = markers.filter((marker) => marker.at === index);
              const states = stateLabels(decoration, language);

              return (
                <li
                  key={index}
                  data-division={index}
                  {...decorationAttrs(decoration)}
                  className="min-w-0 px-1 pb-1 text-center"
                >
                  <span className="relative flex h-6 items-center justify-center">
                    <span
                      aria-hidden="true"
                      className="size-4 rounded-pill border-2 border-ink-2 bg-chalkboard"
                    />
                  </span>
                  <p
                    dir="auto"
                    className="text-sm leading-base font-semibold [overflow-wrap:anywhere]"
                  >
                    <RichTextCore wrap="none" text={division} markup pen={item.pen} spans={spans} />
                  </p>
                  {decoration.answer ? (
                    <span data-mark-icon="">
                      {decoration.answer === "correct" ? (
                        <CheckIcon className="h-5 w-5" />
                      ) : (
                        <CloseIcon className="h-5 w-5" />
                      )}
                    </span>
                  ) : null}
                  {states.length > 0 ? <span className="sr-only">{states.join(" · ")}</span> : null}
                  {attached.length > 0 ? (
                    <ul className="mt-2 flex flex-col items-center gap-1.5">
                      {attached.map((marker) => {
                        /* The marker's pen, then the item's pen, then none. */
                        const pen = marker.pen ?? item.pen;
                        return marker.label === null ? (
                          <li
                            key={marker.id}
                            data-marker={marker.id}
                            aria-hidden="true"
                            {...penAttrs(pen)}
                            data-marker-dot=""
                            className="size-3 rounded-pill border border-chalkboard-edge"
                          />
                        ) : (
                          <li
                            key={marker.id}
                            data-marker={marker.id}
                            dir="auto"
                            {...penAttrs(pen)}
                            className="max-w-full rounded-sm border border-chalkboard-edge px-2 py-0.5 text-xs leading-base text-ink [overflow-wrap:anywhere]"
                          >
                            <span>
                              <RichTextCore wrap="none" text={marker.label} markup pen={pen} spans={spans} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
