import { decorationAttrs, type Decoration } from "@/lib/session/board/marks";
import type { BoardKindProps } from "./kind-props";
import { ANNOTATION_LABEL, MARK_LABEL } from "./labels";
import { RichTextCore } from "./rich-text";
import { MarkIcon } from "./table";

/* The chain: a cause-and-effect mechanism.

   One of the few places that earns a real drawing: an arrow between two
   boxes. Stacking vertically with downward arrows is the right layout on
   a phone, so it is the same at both sizes.

   A broken connector carries a ✕ in chalk colour, not the error colour:
   the error colour is reserved for a corrected mistake, and a link the
   tutor cancelled is not a wrong answer. */

function Connector({ broken, index }: { broken: boolean; index: number }) {
  return (
    <span aria-hidden="true" data-board-connector={index} data-broken={broken ? "" : undefined} className="board-chain-connector flex h-7 w-5 shrink-0 justify-center">
      <svg
        viewBox="0 0 16 28"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={broken ? "h-7 w-4 text-ink-3" : "h-7 w-4 text-ink-2"}
      >
        <path d="M8 2v17" strokeDasharray={broken ? "3 3" : undefined} />
        <path d="m4 16 4 5 4-5" />
        {broken ? <path d="m2.5 6.5 11 11m0-11-11 11" className="text-ink" /> : null}
      </svg>
    </span>
  );
}

export function ChainItem({ item, language }: BoardKindProps<"chain">) {
  const { payload, slots } = item;
  const spans = item.marks.filter((mark) => mark.scope === "span");
  return (
    <ol className="board-chain flex min-w-0 flex-col items-stretch gap-0">
      {payload.links.map((link, i) => {
        /* The index belongs to the link the arrow enters, not the one it leaves. */
        const state = slots[String(i)]?.state;
        const broken = i > 0 && (payload.breakAt === i || state === "broken");
        const linkDecoration = { answer: state === "correct" || state === "wrong" ? state : null, dim: false, focus: false, dimmedByFocus: false, highlight: state === "key", strike: i === 0 && state === "broken" } satisfies Decoration;
        return (
          <li key={i} className="flex min-w-0 flex-col items-center">
            {i > 0 ? <Connector broken={broken} index={i} /> : null}
            {broken ? <span dir="auto" className="sr-only">{ANNOTATION_LABEL.broken?.[language]}</span> : null}
            <span dir="auto" data-board-link={i} {...decorationAttrs(linkDecoration)} aria-current={state === "key" ? true : undefined} className="relative w-full min-w-0 rounded-md border border-chalkboard-edge bg-ink/5 px-3 py-2 text-center text-sm leading-base text-ink [overflow-wrap:anywhere]">
              <MarkIcon answer={linkDecoration.answer} language={language} />
              {i === 0 && state === "broken" ? <span dir="auto" className="sr-only">{ANNOTATION_LABEL.broken?.[language]}</span> : null}
              {state === "key" ? <span dir="auto" className="sr-only">{MARK_LABEL.highlight[language]}</span> : null}
              <RichTextCore wrap="none" text={link} markup={false} pen={item.pen} spans={spans} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
