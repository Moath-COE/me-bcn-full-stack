import type { ReactNode } from "react";
import { ExampleIcon } from "@/components/ui/icons";
import type { BoardGroup, Stage } from "@/lib/session/board/types";
import type { TutorLanguage } from "@/lib/session/tutor-language";
import { EXAMPLE_LABEL, STAGE_LABEL } from "./labels";
import { RichText } from "./rich-text";
import { BoardPresence } from "./presence";

/* The group container: a frame, a heading and two badges. Whoever draws
   it supplies the members.

   Four kinds with four looks, and the stage is independent of them: all
   of them accept `stage`.

   The stage is read from the frame's line style before its colour
   (solid, then dashed, then dotted) and from a text badge in the tutor
   language, so the student never needs to tell colours apart to know
   whose turn it is. The frame itself comes from `data-stage` in the
   shared styles, and the badge repeats that line style so the two are
   visually linked.

   "Example" is a full container, not a callout: a thick border and a
   fill hold the whole worked piece, with a named badge. That is what
   separates it from a `callout` of kind example, which is a small
   dashed box around one paragraph. */

const STAGE_BADGE: Record<Stage, string> = {
  worked: "border-solid",
  faded: "border-dashed",
  try: "border-dotted",
};

/* Frames: the stage's border comes from the shared styles and overrides
   the kind's border, so only shape and padding are set here. `columns`
   has no frame unless it carries a stage. */
function containerClass(group: BoardGroup): string {
  const staged = group.stage !== null;
  switch (group.kind) {
    case "box":
      return "rounded-md border border-chalkboard-edge px-3.5 py-3";
    case "example":
      return "rounded-lg border-2 border-ink bg-ink/5 px-4 py-3.5";
    case "scenario":
      return "rounded-lg border border-chalkboard-edge bg-ink/5 px-3.5 py-3";
    case "columns":
      return staged ? "rounded-md px-3.5 py-3" : "";
  }
}

/* Columns stack vertically under the heading on a phone; a scenario wraps
   as whole units, each an icon with its label. */
function membersClass(group: BoardGroup): string {
  switch (group.kind) {
    case "columns":
      return "grid grid-cols-1 gap-4 md:grid-cols-2";
    case "scenario":
      return "flex flex-wrap items-start gap-x-6 gap-y-4";
    default:
      return "flex flex-col gap-3";
  }
}

export function GroupShell({
  group,
  language,
  children,
  reduce,
}: {
  group: BoardGroup;
  language: TutorLanguage;
  /** null for a container with no members: only its heading is drawn. */
  children: ReactNode;
  reduce: boolean;
}) {
  return (
    <li
      data-board-group={group.kind}
      data-stage={group.stage ?? undefined}
      className={containerClass(group)}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {group.kind === "example" ? (
          <span
            data-group-badge="example"
            className="inline-flex items-center gap-1.5 rounded-sm bg-ink px-2 py-0.5 text-xs leading-base font-bold text-chalkboard"
          >
            <ExampleIcon className="h-4 w-4 shrink-0" />
            {EXAMPLE_LABEL[language]}
          </span>
        ) : null}
        {group.stage ? (
          <span
            data-group-badge={group.stage}
            className={`inline-flex items-center rounded-sm border-2 border-ink-2 px-2 py-0.5 text-xs leading-base font-bold text-ink ${STAGE_BADGE[group.stage]}`}
          >
            {STAGE_LABEL[group.stage][language]}
          </span>
        ) : null}
        {/* The heading is plain text with no markup; Latin runs in it are still isolated. */}
        <p
          data-group-heading=""
          className="min-w-0 text-sm leading-base font-bold text-ink-2 [overflow-wrap:anywhere]"
        >
          <RichText text={group.heading} markup={false} pen={null} spans={[]} />
        </p>
      </div>
      <BoardPresence reduce={reduce}>
        {children ? <ul key={group.id} className={membersClass(group)}>
          <BoardPresence reduce={reduce}>{children}</BoardPresence>
        </ul> : null}
      </BoardPresence>
    </li>
  );
}
