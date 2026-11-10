import { CheckIcon, CloseIcon } from "@/components/ui/icons";
import { baseDecoration, decorate, decorationAttrs, type Decoration } from "@/lib/session/board/marks";
import type { TableCell } from "@/lib/session/board/types";
import type { TutorLanguage } from "@/lib/session/tutor-language";
import type { BoardKindProps } from "./kind-props";
import { MARK_LABEL } from "./labels";
import { RichTextCore } from "./rich-text";

/** The icon and its spoken label accompany a correction, even in an empty cell. */
export function MarkIcon({ answer, language }: { answer: Decoration["answer"]; language: TutorLanguage }) {
  if (!answer) return null;
  return (
    <span data-mark-icon="">
      {answer === "correct" ? <CheckIcon className="h-5 w-5" /> : <CloseIcon className="h-5 w-5" />}
      <span dir="auto" className="sr-only">{MARK_LABEL[answer][language]}</span>
    </span>
  );
}

/* The layers are separate: a column includes its header, a cell keeps
   its authored state, and a row gathers its fields without erasing the
   mark on any of them. */
export function TableItem({ item, language }: BoardKindProps<"table">) {
  const { payload } = item;
  const spans = item.marks.filter((mark) => mark.scope === "span");
  const rows = payload.rows.slice(0, item.revealed);
  const column = (index: number) => decorate(item, { scope: "column", index });
  const cell = (value: TableCell, row: number | null, col: number) => row === null
    ? { highlight: false, answer: null, dim: false, strike: false, focus: false, dimmedByFocus: false, ...baseDecoration(value.state) } satisfies Decoration
    : decorate(item, { scope: "cell", cell: [row, col] }, baseDecoration(value.state));
  const text = (value: string) => <RichTextCore wrap="none" text={value} markup pen={item.pen} spans={spans} />;
  const header = (value: TableCell, col: number) => {
    const decoration = cell(value, null, col);
    return (
      <span dir="auto" {...decorationAttrs(decoration)} className="relative block min-w-0 font-bold text-ink-2">
        <MarkIcon answer={decoration.answer} language={language} />
        {payload.numberedColumns ? <span className="block text-xs tabular-nums">{col + 1}</span> : null}
        {text(value.text)}
      </span>
    );
  };
  const content = (value: TableCell, row: number, col: number) => {
    const decoration = cell(value, row, col);
    const numeric = payload.variant === "journal" && col > 0;
    return (
      <span {...decorationAttrs(decoration)} data-board-cell={`${row}:${col}`} className="relative block min-h-[1.75em] min-w-0 text-ink">
        <MarkIcon answer={decoration.answer} language={language} />
        <span dir={numeric ? "ltr" : "auto"} className={numeric ? "block text-end tabular-nums [unicode-bidi:isolate]" : "block"}>
          {text(value.text)}
        </span>
      </span>
    );
  };

  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <table className="hidden w-full table-fixed border-collapse text-sm md:table">
        <thead>
          <tr className="border-b border-chalkboard-edge bg-ink/5">
            {payload.header.map((value, col) => {
              const decoration = column(col);
              return <th key={col} scope="col" data-board-column={col} {...decorationAttrs(decoration)} className="relative px-3 py-2 text-start align-top leading-base">
                <MarkIcon answer={decoration.answer} language={language} />
                {header(value, col)}
              </th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const decoration = decorate(item, { scope: "row", index });
            return <tr key={index} data-board-row={index} {...decorationAttrs(decoration)} className="board-mark-row border-b border-chalkboard-edge/60 last:border-0">
              {row.map((value, col) => {
                const columnDecoration = column(col);
                return <td key={col} data-board-column={col} {...decorationAttrs(columnDecoration)} className="relative px-3 py-2 align-top leading-base">
                  {col === 0 ? <span className="board-row-feedback"><MarkIcon answer={decoration.answer} language={language} /></span> : null}
                  {content(value, index, col)}
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
      <ul className="flex min-w-0 flex-col gap-2 md:hidden">
        {rows.map((row, index) => {
          const decoration = decorate(item, { scope: "row", index });
          return <li key={index} data-board-row={index} {...decorationAttrs(decoration)} className="relative min-w-0 rounded-md border border-chalkboard-edge px-3 py-2.5 text-sm">
            <MarkIcon answer={decoration.answer} language={language} />
            <dl className="flex min-w-0 flex-col gap-2">
              {payload.header.map((value, col) => {
                const columnDecoration = column(col);
                return <div key={col} data-board-column={col} {...decorationAttrs(columnDecoration)} className="relative grid min-w-0 grid-cols-2 items-baseline gap-3">
                  <MarkIcon answer={columnDecoration.answer} language={language} />
                  <dt className="min-w-0 text-xs leading-base">{header(value, col)}</dt>
                  <dd className="min-w-0">{content(row[col], index, col)}</dd>
                </div>;
              })}
            </dl>
          </li>;
        })}
      </ul>
    </div>
  );
}
