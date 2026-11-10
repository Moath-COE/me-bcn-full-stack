import { CALLOUT_LABEL } from "./labels";
import {
  BookIcon,
  ExamIcon,
  ExampleIcon,
  LosesMarksIcon,
  MistakeIcon,
  MnemonicIcon,
} from "@/components/ui/icons";
import { spanMarks } from "@/lib/session/board/rich-text";
import type { CalloutKind } from "@/lib/session/board/types";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";
import { Accent } from "./text-kinds";

/* The seven callouts.

   "Loses marks" is the most valuable item on the board, so it must be
   impossible to mistake for an ordinary one. It gets the strongest
   non-error treatment available: a raised panel with a thick walnut
   border and a halo around it. Walnut here is a border and an icon,
   never text.

   None of them uses amber: amber is for pressable elements only, and
   nothing on the board is pressed. */

/* The quotation mark is a drawing, not a character: the character
   changes shape between the two directions, and the drawing is the same
   on both boards. It belongs to the "textbook text" callout alone, so
   that callout is not confused with "definition", which uses the book. */
function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 17h4l2-4V7H6v6h3zM14 17h4l2-4V7h-6v6h3z" />
    </svg>
  );
}

const ICONS: Record<CalloutKind, (p: { className?: string }) => React.ReactElement> = {
  loses_marks: LosesMarksIcon,
  mistake: MistakeIcon,
  mnemonic: MnemonicIcon,
  definition: BookIcon,
  example: ExampleIcon,
  exam: ExamIcon,
  verbatim: QuoteIcon,
};

/* Each has its own border, fill and icon, so the distinction never rests
   on colour alone.

   They differ along four axes (border weight, dashing, walnut versus
   chalk, fill) rather than by a coloured edge: the card is rounded and
   filled, and a thick stripe along one side fights the rounding and
   turns into decoration. A callout is recognised by its icon and label
   before its frame. */
const STYLES: Record<CalloutKind, { frame: string; icon: string }> = {
  loses_marks: {
    frame: "border-2 border-warmth ring-4 ring-warmth/35 bg-surface",
    icon: "text-warmth",
  },
  exam: { frame: "border-2 border-warmth bg-ink/5", icon: "text-warmth" },
  mistake: { frame: "border border-ink-3 bg-ink/5", icon: "text-ink-2" },
  mnemonic: { frame: "border border-dashed border-ink-3 bg-ink/5", icon: "text-ink-2" },
  example: { frame: "border border-dashed border-warmth", icon: "text-warmth" },
  definition: { frame: "bg-ink/10", icon: "text-ink-2" },
  /* The double border suggests a book page; it is the only one of the seven. */
  verbatim: { frame: "border-4 border-double border-ink-2", icon: "text-ink-2" },
};

export function CalloutItem({ item, language }: BoardKindProps<"callout">) {
  const { payload } = item;
  const Icon = ICONS[payload.kind];
  const style = STYLES[payload.kind];
  const label = CALLOUT_LABEL[payload.kind][language];
  const loud = payload.kind === "loses_marks";
  const verbatim = payload.kind === "verbatim";
  const body = (
    <RichTextCore
      wrap="none"
      text={payload.text}
      markup
      pen={item.pen}
      spans={spanMarks(item.marks)}
    />
  );
  const bodyClass = `mt-1.5 leading-base text-ink ${loud ? "font-semibold" : ""}`;

  return (
    <div className={`rounded-md px-3.5 py-3 ${style.frame}`}>
      <p className="flex items-center gap-2">
        <Icon className={`h-5 w-5 shrink-0 ${style.icon}`} />
        <span
          dir="auto"
          className={`text-xs leading-base font-bold tracking-normal ${loud ? "text-ink" : "text-ink-2"}`}
        >
          {label}
        </span>
      </p>
      {/* The item's pen is a border on the text, not on the frame: the frame
          takes its identity from the callout kind. */}
      <Accent>
        {verbatim ? (
          <blockquote dir="auto" className={bodyClass}>
            {body}
          </blockquote>
        ) : (
          <p dir="auto" className={bodyClass}>
            {body}
          </p>
        )}
      </Accent>
    </div>
  );
}
