import { createContext, useContext } from "react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { BOARD_ICON_MAP } from "./icon-map.generated";
import { UNKNOWN_ICON_LABEL } from "./labels";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";

/* The icon and its label are one layout unit: a single element that
   wraps as a whole on a phone, so text is never separated from its
   drawing.

   The tutor agent sends a board icon name; the lucide icon that draws it
   is looked up in a generated map. A name the map does not know is never
   passed to lucide: a neutral placeholder is shown and the label stays,
   so the scene keeps its meaning and no error is thrown. */

/** Valid attachments as the board computed them: icon id → target id. */
const IconAttachments = createContext<ReadonlyMap<string, string>>(new Map());
export const IconAttachmentsProvider = IconAttachments.Provider;

/* The placeholder: a dotted square with no meaning, the same size as an
   icon so the layout does not jump when the real drawing arrives. */
function Placeholder({ label }: { label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="3 3"
      data-icon-placeholder=""
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}

function lucideNameOf(icon: string): IconName | null {
  return Object.hasOwn(BOARD_ICON_MAP, icon) ? (BOARD_ICON_MAP[icon] as IconName) : null;
}

export function IconItem({ item, language }: BoardKindProps<"icon">) {
  const { icon, label } = item.payload;
  const attachedTo = useContext(IconAttachments).get(item.id);
  const lucide = lucideNameOf(icon);
  const spans = item.marks.filter((mark) => mark.scope === "span");

  return (
    <span
      data-icon-unit=""
      data-icon={icon}
      data-attached-to={attachedTo}
      className="flex max-w-full items-center gap-3"
    >
      <span
        data-icon-glyph=""
        data-icon-pen={item.pen ?? undefined}
        className="flex size-11 shrink-0 items-center justify-center rounded-pill text-ink"
      >
        {lucide ? (
          <DynamicIcon
            name={lucide}
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
            focusable="false"
            fallback={() => <Placeholder />}
          />
        ) : (
          <Placeholder label={UNKNOWN_ICON_LABEL[language]} />
        )}
      </span>
      <span dir="auto" className="min-w-0 leading-base text-ink [overflow-wrap:anywhere]">
        <RichTextCore wrap="none" text={label} markup pen={item.pen} spans={spans} />
      </span>
    </span>
  );
}
