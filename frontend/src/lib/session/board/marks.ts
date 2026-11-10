import type { AnnotationKind, BoardItem, BoardState, CellState, Mark, Pen, SlotState } from "./types";

export type Address =
  | { scope: "item" }
  | { scope: "row"; index: number }
  | { scope: "cell"; cell: [number, number] }
  | { scope: "column"; index: number }
  | { scope: "option"; option: string }
  | { scope: "division"; index: number };

export type Decoration = {
  highlight: boolean;
  answer: "correct" | "wrong" | null;
  dim: boolean;
  strike: boolean;
  focus: boolean;
  dimmedByFocus: boolean;
};

function validAddress(item: BoardItem, address: Address): boolean {
  const indexIn = (index: number, length: number) => Number.isInteger(index) && index >= 0 && index < length;
  switch (address.scope) {
    case "item": return true;
    case "option": return item.kind === "options" && item.payload.options.some((option) => option.id === address.option);
    case "division": return item.kind === "timeline" && indexIn(address.index, item.payload.divisions.length);
    case "row": return (item.kind === "table" || item.kind === "compare") && indexIn(address.index, item.payload.rows.length);
    case "column": return (item.kind === "table" || item.kind === "compare") && indexIn(address.index, item.kind === "table" ? item.payload.header.length : 3);
    case "cell": return (item.kind === "table" || item.kind === "compare") && indexIn(address.cell[0], item.payload.rows.length) && indexIn(address.cell[1], item.kind === "table" ? item.payload.header.length : 3);
  }
}

function focusVisible(item: BoardItem, address: Address): boolean {
  if (item.kind === "table" && address.scope === "row") return address.index < item.revealed;
  if (item.kind === "timeline" && address.scope === "division") return address.index < item.revealed;
  return true;
}

function addressOf(mark: Mark): Address | null {
  switch (mark.scope) {
    case "item": return { scope: "item" };
    case "row": case "column": case "division": return mark.index === null ? null : { scope: mark.scope, index: mark.index };
    case "cell": return mark.cell === null ? null : { scope: "cell", cell: mark.cell };
    case "option": return mark.option === null ? null : { scope: "option", option: mark.option };
    case "span": return null;
  }
}

function sameAddress(a: Address, b: Address): boolean {
  if (a.scope !== b.scope) return false;
  if (a.scope === "item") return true;
  if (a.scope === "cell" && b.scope === "cell") return a.cell[0] === b.cell[0] && a.cell[1] === b.cell[1];
  if (a.scope === "option" && b.scope === "option") return a.option === b.option;
  return "index" in a && "index" in b && a.index === b.index;
}

/** The authored state and the item annotation form the base, which shows
    again once the marks are cleared. */
export function baseDecoration(state: CellState | SlotState | AnnotationKind | null | undefined): Partial<Decoration> {
  if (state === "correct" || state === "wrong") return { answer: state };
  if (state === "highlight" || state === "key") return { highlight: true };
  if (state === "dim") return { dim: true };
  if (state === "broken") return { strike: true };
  return {};
}

/** Independent properties accumulate; only the latest correction decides correct or wrong. */
export function decorate(
  item: BoardItem,
  address: Address,
  base?: Partial<Decoration>,
): Decoration {
  const decoration: Decoration = {
    highlight: false,
    answer: null,
    dim: false,
    strike: false,
    focus: false,
    dimmedByFocus: false,
    ...base,
  };
  if (!validAddress(item, address)) return decoration;
  let siblingFocus = false;
  for (const mark of item.marks) {
    const target = addressOf(mark);
    if (!target || !validAddress(item, target)) continue;
    if (sameAddress(address, target)) {
      if (mark.state === "correct" || mark.state === "wrong") decoration.answer = mark.state;
      else decoration[mark.state] = true;
    } else if (mark.state === "focus" && address.scope !== "item" && target.scope === address.scope && focusVisible(item, target)) {
      if (address.scope !== "cell" || (target.scope === "cell" && address.cell[0] === target.cell[0])) siblingFocus = true;
    }
  }
  decoration.dimmedByFocus = decoration.dimmedByFocus || (siblingFocus && !decoration.focus);
  return decoration;
}

export function itemFocusDimmed(state: BoardState, item: BoardItem): boolean {
  if (item.kind === "title" || state.title?.id === item.id || decorate(item, { scope: "item" }).focus) return false;
  return state.items.some((sibling) => sibling.id !== item.id && sibling.kind !== "title" && sibling.id !== state.title?.id && sibling.region === item.region && decorate(sibling, { scope: "item" }).focus);
}

/** An absent attribute keeps the normal look; a present one selects the shared styling. */
export function decorationAttrs(decoration: Decoration) {
  return {
    "data-mark-highlight": decoration.highlight ? "" : undefined,
    "data-mark-answer": decoration.answer ?? undefined,
    "data-mark-dim": decoration.dim ? "" : undefined,
    "data-mark-strike": decoration.strike ? "" : undefined,
    "data-mark-focus": decoration.focus ? "" : undefined,
    "data-mark-dimmed-by-focus": decoration.dimmedByFocus ? "" : undefined,
  };
}

export function penAttrs(pen: Pen | null): { "data-pen"?: Pen } {
  return pen === null ? {} : { "data-pen": pen };
}
