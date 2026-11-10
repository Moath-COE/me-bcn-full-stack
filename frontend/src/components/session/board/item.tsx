import { ANNOTATION_LABEL } from "./labels";
import { baseDecoration, decorate, decorationAttrs, penAttrs } from "@/lib/session/board/marks";
import { motion } from "motion/react";
import { WarningIcon } from "@/components/ui/icons";
import type { AnnotationKind, BoardItem } from "@/lib/session/board/types";
import type { TutorLanguage } from "@/lib/session/tutor-language";
import { DividerItem } from "./divider";
import { IconItem } from "./icon";
import { NoteItem } from "./note";
import { TimelineItem } from "./timeline";
import { UnsupportedItem } from "./unsupported";
import type { BoardKindProps } from "./kind-props";
import { BlanksItem } from "./blanks";
import { CalloutItem } from "./callout";
import { ChainItem } from "./chain";
import { CompareItem } from "./compare";
import { DefinitionItem } from "./definition";
import { EquationItem } from "./equation";
import { OptionsItem } from "./options";
import { MarkIcon, TableItem } from "./table";
import { TermItem } from "./term";
import { BulletLine, HeadingLine, StepLine, TextLine } from "./text-kinds";

/* Item states, with no amber.

   `key` is "the item the tutor is on right now" and needs the strongest
   emphasis available. Amber is ruled out: it is for pressable elements
   only, and nothing on the board is pressed. So the emphasis is a chalk
   ring around the item with a light wash, the strongest thing on the
   board without borrowing an action colour.

   `correct` and `wrong` do not rely on colour: each comes with its icon,
   so both are readable without colour vision.

   Dimming uses a measured opacity in the shared styles and does not
   change the ink token. */

const FRAMES: Record<AnnotationKind, string> = {
  key: "rounded-md bg-ink/10 px-3 py-2 ring-2 ring-ink",
  warning: "border-s-4 border-warmth ps-3",
  correct: "border-s-4 border-live ps-3",
  wrong: "border-s-4 border-error ps-3",
  broken: "line-through decoration-2 decoration-ink-2",
  dim: "",
};

function Body({
  item,
  n,
  language,
}: BoardKindProps) {
  switch (item.kind) {
    case "title":
    case "heading":
      return <HeadingLine item={item} language={language} n={n} />;
    case "text":
      return <TextLine item={item} language={language} n={n} />;
    case "bullet":
      return <BulletLine item={item} language={language} n={n} />;
    case "step":
      return <StepLine item={item} language={language} n={n} />;
    case "note":
      return <NoteItem item={item} language={language} n={n} />;
    case "divider":
      return <DividerItem item={item} language={language} n={n} />;
    case "timeline":
      return <TimelineItem item={item} language={language} n={n} />;
    case "icon":
      return <IconItem item={item} language={language} n={n} />;
    case "unsupported":
      return <UnsupportedItem item={item} language={language} n={n} />;
    case "definition":
      return <DefinitionItem item={item} language={language} n={n} />;
    case "term":
      return <TermItem item={item} language={language} n={n} />;
    case "equation":
      return <EquationItem item={item} language={language} n={n} />;
    case "compare":
      return <CompareItem item={item} language={language} n={n} />;
    case "table":
      return <TableItem item={item} language={language} n={n} />;
    case "chain":
      return <ChainItem item={item} language={language} n={n} />;
    case "blanks":
      return <BlanksItem item={item} language={language} n={n} />;
    case "options":
      return <OptionsItem item={item} language={language} n={n} />;
    case "callout":
      return <CalloutItem item={item} language={language} n={n} />;
  }
}

export function BoardItemView({
  item,
  n,
  language,
  reduce,
  dimmedByFocus = false,
}: {
  item: BoardItem;
  n: number;
  language: TutorLanguage;
  reduce: boolean;
  /** Another item in the same region has focus, so this one is dimmed, not hidden. */
  dimmedByFocus?: boolean;
}) {
  const annotation = item.annotation;
  const decoration = decorate(item, { scope: "item" }, baseDecoration(annotation));
  decoration.dimmedByFocus = item.kind !== "title" && dimmedByFocus && !decoration.focus;
  const structured = ["table", "compare", "options", "chain", "blanks", "equation", "timeline", "icon"].includes(item.kind);
  const frameKind = annotation === "correct" || annotation === "wrong" ? decoration.answer : annotation;
  const frame = frameKind ? FRAMES[frameKind] : "";
  const label = annotation && annotation !== "correct" && annotation !== "wrong" ? ANNOTATION_LABEL[annotation]?.[language] : undefined;

  /* No JavaScript stagger timers: the tutor agent times every operation
     against the spoken audio, and any delay added here would compound it. */
  const anim = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 7 },
        animate: { opacity: decoration.dim || decoration.dimmedByFocus ? 0.7 : 1, y: 0 },
        exit: { opacity: 0, transition: { duration: 0.15, ease: [0, 0, 0.2, 1] as const } },
        transition: { duration: 0.25, ease: [0, 0, 0.2, 1] as const },
      };

  return (
    <motion.li
      {...anim}
      {...decorationAttrs(decoration)}
      {...penAttrs(item.kind === "icon" ? null : item.pen)}
      data-board-item={item.id}
      data-cancelled={structured && decoration.strike ? "" : undefined}
      /* A move between regions is animated without delaying the content's arrival. */
      layout={reduce ? false : "position"}
      aria-current={annotation === "key" ? true : undefined}
      className={`relative min-w-0 ${item.pen && item.kind !== "icon" ? "ps-3" : ""} ${frame}`}
    >
      <MarkIcon answer={decoration.answer} language={language} />
      {label ? <span className="sr-only">{label}</span> : null}
      {annotation === "warning" ? <WarningIcon className="mb-1 h-5 w-5 text-ink-2" /> : null}
      <div className="min-w-0">
        <Body item={item} n={n} language={language} />
      </div>
    </motion.li>
  );
}
