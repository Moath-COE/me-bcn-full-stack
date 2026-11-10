import { Fragment, type ReactNode } from "react";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";
import { decorationAttrs } from "@/lib/session/board/marks";
import {
  layoutRichText,
  type DecoGroup,
  type Piece,
} from "@/lib/session/board/rich-text";
import type { Mark, Pen } from "@/lib/session/board/types";
import { MARK_LABEL } from "./labels";
import { useBoardLanguage } from "./language";

export type RichTextProps = {
  text: string;
  markup: boolean;
  pen: Pen | null;
  spans: Mark[];
  renderBlank?: (index: number) => ReactNode;
};

/* All text on the board goes through here: markup, then direction
   isolation, then span marks. The computation lives in
   `lib/session/board/rich-text`; only the rendering is here.

   The nesting order is fixed: `bdi` for the whole run on the outside,
   then the decoration span, then the style element. That way a
   direction run is never split at a tag or a mark, and `1 cm²` stays
   one unit to the eye. */

function Styled({ piece, pen }: { piece: Piece; pen: Pen | null }) {
  const { style, text } = piece;
  if (!style) return <>{text}</>;

  switch (style.kind) {
    case "bold":
      return <strong className="font-bold">{text}</strong>;
    case "keyword":
      return <strong className="font-bold text-ink">{text}</strong>;
    case "underline":
      return <u className="underline decoration-1 underline-offset-4">{text}</u>;
    case "strike":
      return <s className="line-through decoration-2 decoration-ink-2">{text}</s>;
    case "sup":
      return <sup>{text}</sup>;
    case "sub":
      return <sub>{text}</sub>;
    case "highlight":
      /* A named pen overrides the item's pen; with neither, the default
         `mark` is used. The outline comes from the shared `data-pen`
         rules, not from here. */
      return (
        <mark
          data-pen={style.pen ?? pen ?? "mark"}
          data-mark-highlight=""
          className="rt-hl rounded-sm bg-ink/10 px-0.5 text-inherit"
        >
          {text}
        </mark>
      );
  }
}

const LANG_CODE = { Arabic: "ar", English: "en" } as const;

/* A screen reader needs the state spoken once, in the tutor language the board provides. */
function Cue({ state }: { state: "correct" | "wrong" | "strike" }) {
  const language = useBoardLanguage();
  return (
    <span lang={LANG_CODE[language]} dir="auto" className="sr-only">
      {MARK_LABEL[state][language]}
    </span>
  );
}

function Group({ group, pen }: { group: DecoGroup; pen: Pen | null }) {
  const content = group.pieces.map((piece, i) => (
    <Styled key={i} piece={piece} pen={pen} />
  ));
  const { deco } = group;
  if (!deco) return <>{content}</>;

  /* The icon and the hidden label appear once per range: when a run
     boundary cuts it, the later parts do not repeat them
     (`data-rt-continued`). */
  const cue = !group.continued;
  return (
    <span
      {...decorationAttrs(deco)}
      data-pen={deco.highlight ? (pen ?? "mark") : undefined}
      data-rt-continued={group.continued ? "" : undefined}
      className={deco.highlight ? "rt-hl rounded-sm bg-ink/10 px-0.5" : undefined}
    >
      {cue && deco.answer ? (
        <span data-mark-icon="" aria-hidden="true">
          {deco.answer === "correct" ? (
            <CheckIcon className="h-full w-full" />
          ) : (
            <CloseIcon className="h-full w-full" />
          )}
        </span>
      ) : null}
      {cue && deco.answer ? <Cue state={deco.answer} /> : null}
      {cue && deco.strike ? <Cue state="strike" /> : null}
      {content}
    </span>
  );
}

/** The shared core; `RichText` wraps it in `dir="auto"`.

   Text kinds ask for `none`: `dir="auto"` detection skips every
   descendant that has its own `dir`, and skips `bdi`. If the text
   wrapped itself in a `dir`, the parent could not see it and every line
   would fall back to left-to-right. So the kind puts `dir="auto"` on its
   own container and the content is drawn directly under it. */
export function RichTextCore({
  text,
  markup,
  pen,
  spans,
  renderBlank,
  wrap = "auto",
  emphasis,
}: RichTextProps & { wrap?: "auto" | "none"; emphasis?: string[] }) {
  const nodes = layoutRichText(text, {
    markup,
    blanks: renderBlank !== undefined,
    spans,
    emphasis,
  });

  const body = (
    <>
      {nodes.map((node, i) => {
        if (node.type === "blank") {
          return <Fragment key={i}>{renderBlank?.(node.index)}</Fragment>;
        }
        const groups = node.groups.map((group, g) => (
          <Group key={g} group={group} pen={pen} />
        ));
        return node.type === "ltr" ? (
          <bdi key={i} dir="ltr">
            {groups}
          </bdi>
        ) : (
          <Fragment key={i}>{groups}</Fragment>
        );
      })}
    </>
  );

  return wrap === "none" ? body : <span dir="auto">{body}</span>;
}

export function RichText(props: RichTextProps) {
  return <RichTextCore {...props} />;
}
