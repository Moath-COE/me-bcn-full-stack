import type { BoardKindProps } from "./kind-props";
import { UNSUPPORTED_LABEL } from "./labels";

/* A kind this build does not know, sent by a newer tutor agent: it is
   drawn as a neutral card with one label, and no content is guessed for
   it. The wire kind is a programming term, so it is not shown to the
   student, but it stays as an attribute for anyone inspecting the page. */
export function UnsupportedItem({ item, language }: BoardKindProps<"unsupported">) {
  return (
    <p
      data-wire-kind={item.payload.wireKind}
      dir="auto"
      className="rounded-md border border-dashed border-ink-3 px-3 py-2 text-sm leading-base text-ink-2"
    >
      {UNSUPPORTED_LABEL[language]}
    </p>
  );
}
