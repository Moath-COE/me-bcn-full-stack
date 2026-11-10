import { useState } from "react";
import { spanMarks } from "@/lib/session/board/rich-text";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";
import { Accent } from "./text-kinds";

/* A definition is revealed chunk by chunk, in step with the voice.

   What has not been revealed is not rendered at all: not in the
   accessibility tree, not in the page source, not in a tooltip, so the
   text never gets ahead of its narration. A reveal appends a chunk at
   the end of the paragraph, so nothing above it moves and no height is
   reserved for it.

   Chunks are independent fields: emphasis words and span marks are
   matched within each one, and they carry no markup. There are no
   timers here: the tutor agent times every operation against the spoken
   audio, and any delay added by the page would compound that timing
   and break the sync. */
export function DefinitionItem({ item }: BoardKindProps<"definition">) {
  const { payload, revealed } = item;
  const spans = spanMarks(item.marks);
  /* What was already shown when the item arrived (an add or a restored
     snapshot) is not animated in again; only chunks revealed afterwards
     animate. */
  const [settled] = useState(revealed);

  return (
    <Accent>
      <p dir="auto" className="leading-base text-ink">
        {payload.chunks.slice(0, Math.max(revealed, 0)).map((chunk, i) => (
          <span key={i} className={i < settled ? undefined : "animate-board-in"}>
            <RichTextCore
              wrap="none"
              text={chunk}
              markup={false}
              pen={item.pen}
              spans={spans}
              emphasis={payload.keyWords}
            />{" "}
          </span>
        ))}
      </p>
    </Accent>
  );
}
