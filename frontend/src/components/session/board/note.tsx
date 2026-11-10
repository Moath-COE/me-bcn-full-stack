import { spanMarks } from "@/lib/session/board/rich-text";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";
import { Accent } from "./text-kinds";

/* A note is an explanatory aside: the smallest of the board's three text
   sizes and the faintest ink, but it stays in the flow of the board,
   readable without a tap. No tooltip, no collapsing. */
export function NoteItem({ item }: BoardKindProps<"note">) {
  return (
    <Accent>
      <p dir="auto" className="text-sm leading-base text-ink-2">
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
