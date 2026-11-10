import { BAND_LABEL, BOARD_LABEL } from "./labels";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { BoardPresence } from "./presence";
import { BoardLanguageProvider } from "./language";
import type { BoardItem, BoardState } from "@/lib/session/board/types";
import { itemFocusDimmed } from "@/lib/session/board/marks";
import { Caret } from "../parts";
import type { TutorLanguage } from "@/lib/session/tutor-language";
import { boardFrame } from "./frame";
import { GroupShell } from "./group";
import { IconAttachmentsProvider } from "./icon";
import { BoardItemView } from "./item";
import {
  projectRegion,
  stepNumbers,
  validAttachments,
  type RegionBlock,
  type RegionEntry,
} from "./region-blocks";

/* The board.

   Three lists rather than one:

     title · pinned band · live column · temporary tray

   Pinned items are a reference the student comes back to, so they sit
   on a calmer surface and stay visible while what is below scrolls.
   Temporary items are a remedial detour, so they read as provisional,
   with a dashed border.

   Each region has its own scroller and height cap, so the live column
   keeps a readable area however long the pinned reference or the
   temporary detour grows.

   Capacity is enforced by the tutor agent, so there is no overflow
   policy here. The column still scrolls, because a dozen items plus a
   pinned band do not fit a phone screen in portrait. */

function Region({
  board,
  blocks,
  language,
  reduce,
}: {
  board: BoardState;
  blocks: RegionBlock[];
  language: TutorLanguage;
  reduce: boolean;
}) {
  const numbers = stepNumbers(blocks);

  const view = (item: BoardItem) => (
    <BoardItemView
      key={item.id}
      item={item}
      n={numbers.get(item.id) ?? 0}
      language={language}
      reduce={reduce}
      dimmedByFocus={itemFocusDimmed(board, item)}
    />
  );

  /* Icons attached to each other stand side by side in a row that wraps as whole units. */
  const entry = (placed: RegionEntry) =>
    placed.type === "item" ? (
      view(placed.item)
    ) : (
      <li key={placed.items[0].id} data-icon-cluster="">
        <ul className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <BoardPresence reduce={reduce}>{placed.items.map(view)}</BoardPresence>
        </ul>
      </li>
    );

  return (
    <ul className="flex flex-col gap-4">
      <BoardPresence reduce={reduce}>
        {blocks.map((block) =>
          block.type === "group" ? (
            <GroupShell key={block.group.id} group={block.group} language={language} reduce={reduce}>
              {block.entries.length > 0 ? block.entries.map(entry) : null}
            </GroupShell>
          ) : (
            entry(block)
          ),
        )}
      </BoardPresence>
    </ul>
  );
}

export function Board({
  board,
  speaking,
  intro,
  reduce,
  language,
}: {
  board: BoardState;
  speaking: boolean;
  intro: React.ReactNode;
  reduce: boolean;
  language: TutorLanguage;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /* Follows the bottom while the student is there. Updates can arrive
     tens of seconds apart, so pulling the student away from an earlier
     part they are reading is worse than missing one scroll. */
  const stick = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const live = board.items.filter((item) => item.region === "live");
  /* Attachments are computed once for the whole board: their validity
     depends on the target's region and container, not on the region
     being drawn. */
  const attachments = useMemo(() => validAttachments(board.items), [board.items]);

  /* A reveal grows the height just as an add does, so both are followed. */
  const revealed = live.reduce((sum, item) => sum + item.revealed, 0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stick.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [live.length, revealed, reduce]);

  useEffect(() => {
    if (board.diverged && process.env.NODE_ENV !== "production") {
      console.warn("[board] gap in rev: the state has drifted and is waiting for a snapshot");
    }
  }, [board.diverged]);

  const empty = !board.visible || (board.title === null && board.items.length === 0);

  /* The intro is interface text, so it does not take the tutor-language frame. */
  const introView = (
    <div
      key="intro"
      className="chalkboard font-sans leading-base flex flex-1 flex-col justify-center overflow-y-auto rounded-xl border border-chalkboard-edge px-6 pt-8 pb-20 md:px-10"
    >
      <div className="mx-auto w-full max-w-measure">{intro}</div>
    </div>
  );

  const pinned = projectRegion(board, "pinned");
  const liveBlocks = projectRegion(board, "live");
  const temporary = projectRegion(board, "temporary");
  const region = (blocks: RegionBlock[]) => (
    <Region key="region" board={board} blocks={blocks} language={language} reduce={reduce} />
  );

  /* Each region is announced through its own polite live region. The
     pinned and temporary containers stay in the page even when empty: a
     live region created together with its content announces nothing, so
     if the container were born with its first item, that item would go
     unannounced. Hidden content is absent from the tree altogether, so
     a screen reader cannot read it early. When empty, the containers
     lose their frame and padding and take no space. */
  return (
    <BoardLanguageProvider value={language}>
      <BoardPresence reduce={reduce}>
        {empty ? introView : (
          <section
            key="board"
            aria-label={BOARD_LABEL[language]}
            {...boardFrame(language)}
            data-diverged={board.diverged ? "" : undefined}
            className="chalkboard font-sans leading-base flex min-h-0 flex-1 flex-col rounded-xl border border-chalkboard-edge px-5 pt-6 pb-20 md:px-8 md:pt-8"
          >
            <IconAttachmentsProvider value={attachments}>
              <div className="mx-auto flex min-h-0 w-full max-w-measure flex-1 flex-col">
                {/* The title is an item like any other: it takes its frame, badge,
                    state label, pen and marks from the same item wrapper. */}
                <BoardPresence reduce={reduce}>
                  {board.title ? (
                    <ul key={board.title.id} data-board-title="" className="mb-4 shrink-0">
                      <BoardPresence reduce={reduce}>
                        <BoardItemView
                          key={board.title.id}
                          item={board.title}
                          n={0}
                          language={language}
                          reduce={reduce}
                        />
                      </BoardPresence>
                    </ul>
                  ) : null}
                </BoardPresence>

                <div
                  role="group"
                  aria-label={BAND_LABEL.pinned[language]}
                  aria-live="polite"
                  className={
                    pinned.length > 0
                      ? "mb-4 shrink-0 overflow-y-auto rounded-lg border border-chalkboard-edge bg-ink/5 px-4 py-3 max-h-[30%] md:max-h-[40%]"
                      : undefined
                  }
                >
                  <BoardPresence reduce={reduce}>{pinned.length > 0 ? region(pinned) : null}</BoardPresence>
                </div>

                <div
                  ref={ref}
                  onScroll={onScroll}
                  tabIndex={0}
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  <div aria-live="polite">
                    {region(liveBlocks)}
                    {speaking ? <Caret /> : null}
                  </div>
                </div>

                <div
                  role="group"
                  aria-label={BAND_LABEL.temporary[language]}
                  aria-live="polite"
                  className={
                    temporary.length > 0
                      ? "mt-4 shrink-0 overflow-y-auto rounded-lg border border-dashed border-ink-3 px-4 py-3 max-h-[25%] md:max-h-[30%]"
                      : undefined
                  }
                >
                  <BoardPresence reduce={reduce}>{temporary.length > 0 ? region(temporary) : null}</BoardPresence>
                </div>
              </div>
            </IconAttachmentsProvider>
          </section>
        )}
      </BoardPresence>
    </BoardLanguageProvider>
  );
}
