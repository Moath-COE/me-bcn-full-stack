import { BLANK_LABEL } from "./labels";
import type { BoardKindProps } from "./kind-props";
import { RichText, RichTextCore } from "./rich-text";

/* The template alone carries the blank positions. No answer is shown
   before it arrives in its slot, and a filled blank stays part of the
   sentence when it wraps. */
export function BlanksItem({ item, language }: BoardKindProps<"blanks">) {
  const spans = item.marks.filter((mark) => mark.scope === "span");
  return (
    <p dir="auto" className="min-w-0 leading-loose text-ink [overflow-wrap:anywhere]">
      <RichTextCore wrap="none" text={item.payload.template} markup pen={item.pen} spans={spans} renderBlank={(index) => {
        const blank = item.payload.blanks[index];
        const fill = blank ? item.slots[blank.id]?.text : undefined;
        return fill !== undefined ? (
          <span className="mx-1 inline border-b-2 border-ink px-1.5 font-bold">
            <RichText text={fill} markup={false} pen={item.pen} spans={spans} />
          </span>
        ) : (
          <>
            <span dir="auto" className="sr-only">{BLANK_LABEL[language]}</span>
            <span aria-hidden="true" className="mx-1 inline-block min-w-[5ch] border-b-2 border-ink-3 align-baseline">{" "}</span>
          </>
        );
      }} />
    </p>
  );
}
