import { baseDecoration, decorate, decorationAttrs } from "@/lib/session/board/marks";
import type { BoardKindProps } from "./kind-props";
import { ANNOTATION_LABEL, MARK_LABEL, OPTION_LABELS } from "./labels";
import { RichTextCore } from "./rich-text";
import { MarkIcon } from "./table";

/* The student answers by voice; whether an option is right is read only
   from published state. Lettering continues alphabetically past the
   short list in the labels table. */
function alphabeticLabel(index: number): string {
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + (value - 1) % 26) + label;
  }
  return label;
}

export function OptionsItem({ item, language }: BoardKindProps<"options">) {
  const spans = item.marks.filter((mark) => mark.scope === "span");
  return (
    <div className="flex min-w-0 flex-col gap-2.5 [overflow-wrap:anywhere]">
      <p dir="auto" className="leading-base font-semibold text-ink">
        <RichTextCore wrap="none" text={item.payload.stem} markup pen={item.pen} spans={spans} />
      </p>
      <ul className="flex min-w-0 flex-col gap-2">
        {item.payload.options.map((option, index) => {
          const state = item.slots[option.id]?.state;
          const decoration = decorate(item, { scope: "option", option: option.id }, baseDecoration(state));
          return <li key={option.id} data-board-option={option.id} {...decorationAttrs(decoration)} aria-current={state === "key" ? true : undefined} className="relative flex min-w-0 items-baseline gap-2.5 py-1">
            <MarkIcon answer={decoration.answer} language={language} />
            <span dir="ltr" lang="en" className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border border-ink-3 px-1 text-xs font-bold text-ink-2">
              {OPTION_LABELS[language][index] ?? alphabeticLabel(index)}
            </span>
            <span dir="auto" className="min-w-0 leading-base text-ink"><RichTextCore wrap="none" text={option.text} markup pen={item.pen} spans={spans} /></span>
            {state === "broken" ? <span className="sr-only">{ANNOTATION_LABEL.broken?.[language]}</span> : null}
            {state === "key" ? <span className="sr-only">{MARK_LABEL.highlight[language]}</span> : null}
          </li>;
        })}
      </ul>
    </div>
  );
}
