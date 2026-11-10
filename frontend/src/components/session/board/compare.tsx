import { decorate, decorationAttrs } from "@/lib/session/board/marks";
import type { BoardKindProps } from "./kind-props";
import { RichTextCore } from "./rich-text";
import { MarkIcon } from "./table";

/* Coordinates come from the payload, not from where a column sits on
   screen: the aspect stays column zero even when it becomes a card
   heading on a phone. */
const SIDE_ACCENT = ["border-warmth", "border-ink-3"] as const;

export function CompareItem({ item, language }: BoardKindProps<"compare">) {
  const { payload } = item;
  const headers = [payload.aspectLabel, ...payload.columns];
  const spans = item.marks.filter((mark) => mark.scope === "span");
  const text = (value: string) => <RichTextCore wrap="none" text={value} markup pen={item.pen} spans={spans} />;
  const content = (value: string, row: number, col: number) => {
    const decoration = decorate(item, { scope: "cell", cell: [row, col] });
    return <span dir="auto" data-board-cell={`${row}:${col}`} {...decorationAttrs(decoration)} className="relative block min-w-0 leading-base text-ink">
      <MarkIcon answer={decoration.answer} language={language} />{text(value)}
    </span>;
  };
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <table className="hidden w-full table-fixed border-collapse text-sm md:table">
        <thead><tr className="border-b border-chalkboard-edge">
          {headers.map((value, index) => {
            const decoration = decorate(item, { scope: "column", index });
            return <th dir="auto" key={index} scope="col" data-board-column={index} {...decorationAttrs(decoration)} className={`relative px-3 py-2 text-start align-top leading-base font-bold text-ink-2 ${index > 0 ? `border-s-2 ${SIDE_ACCENT[index - 1]}` : ""}`}>
              <MarkIcon answer={decoration.answer} language={language} />{text(value)}
            </th>;
          })}
        </tr></thead>
        <tbody>{payload.rows.map((row, index) => {
          const decoration = decorate(item, { scope: "row", index });
          return <tr key={index} data-board-row={index} {...decorationAttrs(decoration)} className="board-mark-row border-b border-chalkboard-edge/60 last:border-0">
            {[row.aspect, row.x, row.y].map((value, col) => {
              const column = decorate(item, { scope: "column", index: col });
              const Tag = col === 0 ? "th" : "td";
              return <Tag key={col} scope={col === 0 ? "row" : undefined} data-board-column={col} {...decorationAttrs(column)} className={`relative px-3 py-2 text-start align-top leading-base ${col > 0 ? `border-s-2 ${SIDE_ACCENT[col - 1]}` : ""}`}>
                {col === 0 ? <span className="board-row-feedback"><MarkIcon answer={decoration.answer} language={language} /></span> : null}
                {content(value, index, col)}
              </Tag>;
            })}
          </tr>;
        })}</tbody>
      </table>
      <ul className="flex min-w-0 flex-col gap-2 md:hidden">
        {payload.rows.map((row, index) => {
          const decoration = decorate(item, { scope: "row", index });
          const aspect = decorate(item, { scope: "column", index: 0 });
          return <li key={index} data-board-row={index} {...decorationAttrs(decoration)} className="relative min-w-0 rounded-md border border-chalkboard-edge px-3 py-2.5 text-sm">
            <MarkIcon answer={decoration.answer} language={language} />
            <p data-board-column={0} {...decorationAttrs(aspect)} className="relative min-w-0 font-bold">
              <MarkIcon answer={aspect.answer} language={language} />{content(row.aspect, index, 0)}
            </p>
            <dl className="mt-2 flex min-w-0 flex-col gap-2">
              {[row.x, row.y].map((value, side) => {
                const col = side + 1;
                const column = decorate(item, { scope: "column", index: col });
                return <div key={col} data-board-column={col} {...decorationAttrs(column)} className={`relative min-w-0 border-s-2 ${SIDE_ACCENT[side]} ps-2.5`}>
                  <MarkIcon answer={column.answer} language={language} />
                  <dt dir="auto" className="text-xs leading-base font-semibold text-ink-2">{text(headers[col])}</dt>
                  <dd className="min-w-0">{content(value, index, col)}</dd>
                </div>;
              })}
            </dl>
          </li>;
        })}
      </ul>
    </div>
  );
}
