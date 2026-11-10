import type { ReactNode } from "react";
import { spanMarks } from "@/lib/session/board/rich-text";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";

/* The text kinds: heading, body text, bullet and step.

   Three sizes that cannot be confused: item heading 18/20, then body 16,
   then note 14. The board title, larger than all of them, is sized by
   the board frame. The sizes come from the existing type scale.

   `dir="auto"` goes on the element that holds the text, not on the row,
   so the bullet and the number stay at the start of the line whatever
   the script of the text. That is what lets an English item on an
   Arabic board keep its neighbours' alignment. The text is drawn
   directly under that element, not inside a wrapper with its own `dir`,
   or automatic direction detection would skip it. */

/** The pen border belongs to the item wrapper; this only groups the text. */
export function Accent({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

export function HeadingLine({ item }: BoardKindProps<"heading" | "title">) {
  return (
    <Accent>
      <p dir="auto" className="text-lg leading-base font-bold text-ink md:text-xl">
        <RichTextCore
          wrap="none"
          text={item.payload.text}
          markup={item.kind === "heading"}
          pen={item.pen}
          spans={spanMarks(item.marks)}
        />
      </p>
    </Accent>
  );
}

export function TextLine({ item }: BoardKindProps<"text">) {
  return (
    <Accent>
      <p dir="auto" className="text-base leading-base text-ink">
        <RichTextCore
          wrap="none"
          text={item.payload.text}
          markup
          pen={item.pen}
          spans={spanMarks(item.marks)}
        />
      </p>
    </Accent>
  );
}

/* One bullet with a single sub-level: the children are a list inside
   their parent, not items in the region, with a hollow marker to tell
   them apart and a modest indent on a phone so their text keeps a
   useful width. */
export function BulletLine({ item }: BoardKindProps<"bullet">) {
  const spans = spanMarks(item.marks);
  const { text, children } = item.payload;
  return (
    <Accent>
      <p className="flex items-baseline gap-3">
        <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-pill bg-ink-2" />
        </span>
        <span dir="auto" className="min-w-0 leading-base text-ink">
          <RichTextCore wrap="none" text={text} markup pen={item.pen} spans={spans} />
        </span>
      </p>
      {children.length > 0 ? (
        <ul className="mt-1 ms-3 flex flex-col gap-1 md:ms-8">
          {children.map((child, i) => (
            <li key={i} className="flex items-baseline gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-4 w-4 shrink-0 items-center justify-center"
              >
                <span className="h-1.5 w-1.5 rounded-pill border border-ink-2" />
              </span>
              <span dir="auto" className="min-w-0 leading-base text-ink">
                <RichTextCore wrap="none" text={child} markup pen={item.pen} spans={spans} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Accent>
  );
}

/** Numbering is per region, and always uses Western digits. */
export function StepLine({ item, n }: BoardKindProps<"step">) {
  return (
    <Accent>
      <p className="flex items-baseline gap-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-aubergine-mid text-xs font-bold text-on-dominant">
          {n}
        </span>
        <span dir="auto" className="min-w-0 leading-base font-semibold text-ink">
          <RichTextCore
            wrap="none"
            text={item.payload.text}
            markup
            pen={item.pen}
            spans={spanMarks(item.marks)}
          />
        </span>
      </p>
    </Accent>
  );
}
