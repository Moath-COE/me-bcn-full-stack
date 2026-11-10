import { spanMarks } from "@/lib/session/board/rich-text";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";
import { Accent } from "./text-kinds";

/* A bilingual term.

   The English form is what appears on the exam paper, so it is primary;
   the Arabic is a secondary gloss. Two scripts share one line, so the
   term needs its own bidi isolation: `isolate` on the container and an
   explicit `dir` on each half.

   The halves are independent fields: a span mark is matched within each
   one, and they carry no markup. The gloss's parentheses are outside the
   matched text, so no mark depends on punctuation. */
export function TermItem({ item }: BoardKindProps<"term">) {
  const { payload } = item;
  const spans = spanMarks(item.marks);
  return (
    <Accent>
      <p className="leading-base">
        <span
          style={{ unicodeBidi: "isolate" }}
          className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
        >
          <span dir="ltr" className="font-semibold text-ink [overflow-wrap:anywhere]">
            <RichTextCore wrap="none" text={payload.en} markup={false} pen={item.pen} spans={spans} />
          </span>
          <span dir="rtl" className="text-sm leading-base text-ink-2">
            (<RichTextCore wrap="none" text={payload.ar} markup={false} pen={item.pen} spans={spans} />)
          </span>
        </span>
      </p>
    </Accent>
  );
}
