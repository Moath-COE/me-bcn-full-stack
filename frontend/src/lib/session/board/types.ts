/* The board contract: content and shared states.

   Board content is authored in the lesson plan, not improvised while
   teaching. The tutor agent decides when the tutor has reached a written
   note, assigns the ids, owns the regions and their capacity, and
   publishes every change.

   So the board changes what is already shown (fills a blank, marks an
   answer, reveals a line, removes an item) rather than only appending
   lines.

   Action and field names are a contract with the tutor agent and must
   not be renamed on this side alone. */

/** The three regions. Capacity is enforced by the tutor agent, not the page. */
export type BoardRegion = "pinned" | "live" | "temporary";

/** Scope of a clear: `live` keeps the pinned items, `all` clears the title too. */
export type BoardScope = "all" | "live" | "temporary";

export type BoardItemKind =
  | "heading"
  | "text"
  | "bullet"
  | "step"
  | "note"
  | "divider"
  | "timeline"
  | "icon"
  | "unsupported"
  | "definition"
  | "term"
  | "equation"
  | "compare"
  | "table"
  | "chain"
  | "blanks"
  | "options"
  | "callout";

/** Item state. `key` is exclusive; the tutor agent enforces that with two messages. */
export type AnnotationKind =
  | "key"
  | "warning"
  | "correct"
  | "wrong"
  | "broken"
  | "dim";

export type CalloutKind =
  | "loses_marks"
  | "mistake"
  | "mnemonic"
  | "definition"
  | "example"
  | "exam"
  | "verbatim";

export const CALLOUT_KINDS: readonly CalloutKind[] = [
  "loses_marks",
  "mistake",
  "mnemonic",
  "definition",
  "example",
  "exam",
  "verbatim",
];

/** A pen emphasises content; it is independent of whether an answer is right. */
export type Pen = "mark" | "construct" | "flow" | "trap" | "alt";
export type MarkScope = "item" | "row" | "cell" | "column" | "option" | "span" | "division";
export type MarkState = "highlight" | "correct" | "wrong" | "dim" | "strike" | "focus";
export type Mark = {
  scope: MarkScope;
  index: number | null;
  cell: [number, number] | null;
  option: string | null;
  match: string | null;
  state: MarkState;
};
export type Stage = "worked" | "faded" | "try";
export type CellState = "highlight" | "correct" | "wrong" | "dim";
export type TableCell = { text: string; state: CellState | null };

/* ————— Payloads ————— */

export type TextPayload = { text: string };
export type HeadingPayload = TextPayload;
export type StepPayload = TextPayload;
export type NotePayload = TextPayload;
export type TitlePayload = TextPayload;
export type BulletPayload = { text: string; children: string[] };
export type DividerPayload = Record<string, never>;
export type DefinitionPayload = { chunks: string[]; keyWords: string[] };
export type TermPayload = { en: string; ar: string };
export type EquationPayload = { latex: string; display: boolean };

export type CompareRow = { aspect: string; x: string; y: string };
export type ComparePayload = {
  aspectLabel: string;
  /** Exactly two columns: `x` is the first and `y` the second. */
  columns: [string, string];
  rows: CompareRow[];
};

export type TablePayload = {
  variant: "plain" | "journal";
  header: TableCell[];
  /** An empty cell is legitimate: a journal entry line fills debit or credit, not both. */
  rows: TableCell[][];
  numberedColumns: boolean;
  progressive: boolean;
};

export type ChainPayload = {
  links: string[];
  /** Index of the link whose incoming connector is broken, or null. */
  breakAt: number | null;
};

export type BlanksPayload = {
  template: string;
  blanks: { id: string }[];
};

/* `correct` is dropped when parsing, not when rendering: a value that
   never reaches the page cannot leak onto the screen before the student
   answers. */
export type OptionsPayload = {
  stem: string;
  options: { id: string; text: string }[];
};

export type CalloutPayload = { kind: CalloutKind; text: string };

export type TimelinePayload = {
  axisLabel: string;
  divisions: string[];
  markers: { id: string; at: number; label: string | null; pen: Pen | null }[];
  progressive: boolean;
};
export type IconPayload = { icon: string; label: string; attachTo: string | null };
export type UnsupportedPayload = { wireKind: string };

/** Tying each kind to its payload keeps type narrowing when a component is chosen. */
export type BoardPayloadByKind = {
  title: TitlePayload;
  heading: HeadingPayload;
  text: TextPayload;
  bullet: BulletPayload;
  step: StepPayload;
  note: NotePayload;
  divider: DividerPayload;
  definition: DefinitionPayload;
  term: TermPayload;
  equation: EquationPayload;
  compare: ComparePayload;
  table: TablePayload;
  chain: ChainPayload;
  blanks: BlanksPayload;
  options: OptionsPayload;
  callout: CalloutPayload;
  timeline: TimelinePayload;
  icon: IconPayload;
  unsupported: UnsupportedPayload;
};
export type BoardPayload = BoardPayloadByKind[keyof BoardPayloadByKind];

/* ————— Item ————— */

/** What `board_update` writes into a child slot: a blank being filled or an option being marked. */
export type SlotState = "correct" | "wrong" | "broken" | "key";
export type SlotValue = { text?: string; state?: SlotState };

export type ItemBase = {
  id: string;
  region: BoardRegion;
  /** A container created earlier by `board_group`, or null. */
  groupId: string | null;
  annotation: AnnotationKind | null;
  /** Number of chunks, rows or divisions currently shown. */
  revealed: number;
  /** Keyed by blank id, option id, or link index (from 0). */
  slots: Record<string, SlotValue>;
  pen: Pen | null;
  marks: Mark[];
};

export type BoardItem = {
  [K in keyof BoardPayloadByKind]: ItemBase & { kind: K; payload: BoardPayloadByKind[K] };
}[keyof BoardPayloadByKind];

export type BoardGroup = {
  id: string;
  kind: "box" | "columns" | "example" | "scenario";
  region: BoardRegion;
  heading: string;
  stage: Stage | null;
};

/* ————— State ————— */

export type BoardState = {
  visible: boolean;
  title: BoardItem | null;
  groups: BoardGroup[];
  /** Array order is render order. */
  items: BoardItem[];
  /** The last revision applied. */
  rev: number;
  /** A gap in `rev` was seen: the state has drifted and needs a fresh snapshot. */
  diverged: boolean;
};

export const INITIAL_BOARD_STATE: BoardState = {
  visible: false,
  title: null,
  groups: [],
  items: [],
  rev: 0,
  diverged: false,
};

/* ————— Messages ————— */

export type BoardControlEvent =
  | { action: "board_show"; rev: number }
  | { action: "board_hide"; rev: number }
  | { action: "board_clear"; scope: BoardScope; rev: number }
  | { action: "board_set_title"; id: string; text: string; rev: number }
  | { action: "board_add"; item: BoardItem; rev: number }
  | { action: "board_group"; group: BoardGroup; rev: number }
  | {
      action: "board_update";
      id: string;
      /** Without a slot it replaces the item's text; with one it addresses a child. */
      slot: string | null;
      text: string | null;
      state: SlotState | null;
      rev: number;
    }
  | { action: "board_annotate"; id: string; kind: AnnotationKind | null; rev: number }
  | {
      action: "board_mark";
      id: string;
      scope: MarkScope;
      index: number | null;
      cell: [number, number] | null;
      option: string | null;
      match: string | null;
      state: MarkState | "clear";
      rev: number;
    }
  | { action: "board_remove"; id: string; rev: number }
  /** `index` is the chunk that has just appeared (from 0). */
  | { action: "board_reveal"; id: string; index: number; rev: number }
  | { action: "board_pin"; id: string; pinned: boolean; region: BoardRegion; rev: number }
  | {
      action: "board_snapshot";
      rev: number;
      visible: boolean;
      title: BoardItem | null;
      groups: BoardGroup[];
      items: BoardItem[];
    };

/** `board_reset` is internal: it never comes from the tutor agent and carries no `rev`. */
export type BoardAction = BoardControlEvent | { action: "board_reset" };
