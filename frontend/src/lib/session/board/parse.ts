import {
  CALLOUT_KINDS,
  type AnnotationKind,
  type BoardControlEvent,
  type BoardGroup,
  type BoardItem,
  type BoardItemKind,
  type BoardPayload,
  type BoardRegion,
  type BoardScope,
  type SlotState,
  type SlotValue,
  type Mark,
  type MarkScope,
  type MarkState,
  type Pen,
  type TableCell,
} from "./types";

/* Parsing board messages: the guard between the data channel and the reducer.

   Every payload is validated by shape, and its text is never trimmed,
   truncated or re-encoded: the tutor agent sends text already
   normalised, so touching it here would distort it, not protect it.

   There is no cap on count or length either. Capacity belongs to the
   tutor agent, and the page applies no overflow policy of its own. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-empty text, exactly as it arrived. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** A cell may legitimately be empty: a journal entry line fills one side only. */
function cell(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function texts(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    const t = text(entry);
    if (t === null) return null;
    out.push(t);
  }
  return out;
}

const REGIONS: readonly BoardRegion[] = ["pinned", "live", "temporary"];
const SCOPES: readonly BoardScope[] = ["all", "live", "temporary"];
const ANNOTATIONS: readonly AnnotationKind[] = [
  "key",
  "warning",
  "correct",
  "wrong",
  "broken",
  "dim",
];
const SLOT_STATES: readonly SlotState[] = ["correct", "wrong", "broken", "key"];
const ITEM_KINDS: readonly BoardItemKind[] = [
  "heading",
  "text",
  "bullet",
  "step",
  "note",
  "divider",
  "timeline",
  "icon",
  "definition",
  "term",
  "equation",
  "compare",
  "table",
  "chain",
  "blanks",
  "options",
  "callout",
];

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;

/* ————— Payloads ————— */

function parsePayload(kind: BoardItem["kind"], raw: unknown): BoardPayload | null {
  if (!isRecord(raw)) return null;

  switch (kind) {
    case "title":
    case "heading":
    case "text":
    case "step":
    case "note": {
      const t = text(raw.text);
      return t === null ? null : { text: t };
    }

    case "bullet": {
      const t = text(raw.text);
      const children = raw.children === undefined ? [] : texts(raw.children);
      return t === null || children === null ? null : { text: t, children };
    }

    case "definition": {
      const chunks = texts(raw.chunks);
      if (!chunks || chunks.length === 0) return null;
      const keyWords = raw.key_words === undefined ? [] : texts(raw.key_words);
      return keyWords === null ? null : { chunks, keyWords };
    }

    case "term": {
      const en = text(raw.en);
      const ar = text(raw.ar);
      return en === null || ar === null ? null : { en, ar };
    }

    case "equation": {
      const latex = text(raw.latex);
      if (latex === null) return null;
      if (raw.display !== undefined && typeof raw.display !== "boolean") return null;
      return { latex, display: raw.display !== false };
    }

    case "compare": {
      const columns = texts(raw.columns);
      if (!columns || columns.length !== 2) return null;
      if (!Array.isArray(raw.rows) || raw.rows.length === 0) return null;

      const rows = [];
      for (const entry of raw.rows) {
        if (!isRecord(entry)) return null;
        const aspect = text(entry.aspect);
        const x = text(entry.x);
        const y = text(entry.y);
        if (aspect === null || x === null || y === null) return null;
        rows.push({ aspect, x, y });
      }

      const aspectLabel = text(raw.aspect_label);
      if (aspectLabel === null) return null;
      return {
        aspectLabel,
        columns: [columns[0], columns[1]],
        rows,
      };
    }

    case "table": {
      if (!Array.isArray(raw.header) || raw.header.length === 0 ||
          !Array.isArray(raw.rows) || raw.rows.length === 0) return null;
      const header = raw.header.map(parseCell);
      if (header.some((entry) => entry === null || text(entry.text) === null)) return null;
      const rows: TableCell[][] = [];
      for (const entry of raw.rows) {
        if (!Array.isArray(entry) || entry.length !== header.length) return null;
        const row = entry.map(parseCell);
        if (row.some((value) => value === null)) return null;
        rows.push(row as TableCell[]);
      }
      const variant = oneOf(["plain", "journal"] as const, raw.variant);
      if (variant === null || (raw.numbered_columns !== undefined &&
          typeof raw.numbered_columns !== "boolean") ||
          (raw.reveal !== undefined && raw.reveal !== "progressive")) return null;
      if (variant === "journal" && (header.length !== 3 ||
          header.some((entry, index) => entry?.text !== ["Account", "Debit", "Credit"][index]))) return null;
      return {
        variant,
        header: header as TableCell[],
        rows,
        numberedColumns: raw.numbered_columns === true,
        progressive: raw.reveal === "progressive",
      };
    }

    case "divider":
      return {};

    case "timeline": {
      const axisLabel = text(raw.axis_label);
      const divisions = texts(raw.divisions);
      if (axisLabel === null || divisions === null || divisions.length < 2 ||
          !Array.isArray(raw.markers) ||
          (raw.reveal !== undefined && raw.reveal !== "progressive")) return null;
      const markers = [];
      const ids = new Set<string>();
      for (const entry of raw.markers) {
        if (!isRecord(entry)) return null;
        const id = text(entry.id);
        const at = int(entry.at);
        const label = entry.label === null ? null : text(entry.label);
        const pen = oneOf(PENS, entry.pen);
        if (id === null || ids.has(id) || at === null || at < 0 || at >= divisions.length ||
            (entry.label !== null && label === null) ||
            (entry.pen !== null && pen === null)) return null;
        ids.add(id);
        markers.push({ id, at, label, pen });
      }
      return { axisLabel, divisions, markers, progressive: raw.reveal === "progressive" };
    }

    case "icon": {
      const icon = text(raw.icon);
      const label = text(raw.label);
      const attachTo = text(raw.attach_to);
      if (icon === null || label === null ||
          (raw.attach_to !== null && attachTo === null)) return null;
      return { icon, label, attachTo };
    }

    case "chain": {
      const links = texts(raw.links);
      if (!links || links.length < 2) return null;

      const breakAt = raw.break_at === null || raw.break_at === undefined ? null : int(raw.break_at);
      if (raw.break_at !== null && raw.break_at !== undefined && breakAt === null) return null;

      return {
        links,
        breakAt: breakAt !== null && breakAt >= 1 && breakAt < links.length ? breakAt : null,
      };
    }

    case "blanks": {
      const template = text(raw.template);
      if (template === null || !Array.isArray(raw.blanks)) return null;

      const blanks = [];
      for (const entry of raw.blanks) {
        if (!isRecord(entry)) return null;
        const id = text(entry.id);
        if (id === null) return null;
        /* `fill` is dropped on purpose: the value arrives later through
           `board_update`, and drawing it on add would reveal the answer early. */
        blanks.push({ id });
      }

      return { template, blanks };
    }

    case "options": {
      const stem = text(raw.stem);
      if (stem === null || !Array.isArray(raw.options)) return null;

      const options = [];
      for (const entry of raw.options) {
        if (!isRecord(entry)) return null;
        const id = text(entry.id);
        const label = text(entry.text);
        if (id === null || label === null) return null;
        /* `correct` is dropped here, not when rendering: a value that never
           reaches the page cannot leak onto the screen before the student answers. */
        options.push({ id, text: label });
      }

      return { stem, options };
    }

    case "callout": {
      const calloutKind = oneOf(CALLOUT_KINDS, raw.kind);
      const t = text(raw.text);
      return calloutKind === null || t === null ? null : { kind: calloutKind, text: t };
    }
  }
  return null;
}

const PENS: readonly Pen[] = ["mark", "construct", "flow", "trap", "alt"];
const MARK_SCOPES: readonly MarkScope[] = ["item", "row", "cell", "column", "option", "span", "division"];
const MARK_STATES: readonly (MarkState | "clear")[] = [
  "highlight", "correct", "wrong", "dim", "strike", "focus", "clear",
];

function parseCell(raw: unknown): TableCell | null {
  if (typeof raw === "string") return { text: raw, state: null };
  if (!isRecord(raw) || typeof raw.text !== "string") return null;
  const state = oneOf(["highlight", "correct", "wrong", "dim"] as const, raw.state);
  return state === null ? null : { text: raw.text, state };
}

function parseMark(raw: unknown): Omit<Mark, "state"> & { state: MarkState | "clear" } | null {
  if (!isRecord(raw)) return null;
  const scope = oneOf(MARK_SCOPES, raw.scope);
  const state = oneOf(MARK_STATES, raw.state);
  const index = int(raw.index);
  const pair = Array.isArray(raw.cell) && raw.cell.length === 2 &&
    int(raw.cell[0]) !== null && int(raw.cell[1]) !== null
    ? [raw.cell[0], raw.cell[1]] as [number, number] : null;
  const option = text(raw.option);
  const match = text(raw.match);
  if (scope === null || state === null ||
      (raw.index !== null && index === null) ||
      (raw.cell !== null && pair === null) ||
      (raw.option !== null && option === null) ||
      (raw.match !== null && match === null)) return null;
  if ((["row", "column", "division"].includes(scope) ? index === null : raw.index !== null) ||
      (scope === "cell" ? pair === null : raw.cell !== null) ||
      (scope === "option" ? option === null : raw.option !== null) ||
      (scope === "span" ? match === null : raw.match !== null)) return null;
  return { scope, index, cell: pair, option, match, state };
}

function parseSlots(raw: unknown, kind: BoardItem["kind"]): Record<string, SlotValue> {
  if (!isRecord(raw)) return {};
  const slots: Record<string, SlotValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    if (kind === "blanks") {
      Object.defineProperty(slots, key, { value: { text: value }, enumerable: true });
    } else if (kind === "options" || kind === "chain") {
      const state = oneOf(SLOT_STATES, value);
      if (state !== null) Object.defineProperty(slots, key, { value: { state }, enumerable: true });
    }
  }
  return slots;
}

/** Serves both `board_add` and the items of a `board_snapshot`: the fields are the same. */
function parseItem(raw: unknown, snapshot = false, titleAllowed = false): BoardItem | null {
  if (!isRecord(raw)) return null;

  const id = text(raw.id);
  const region = oneOf(REGIONS, raw.region);
  const kind =
    titleAllowed && raw.kind === "title"
      ? ("title" as const)
      : oneOf(ITEM_KINDS, raw.kind) ?? (text(raw.kind) !== null && raw.kind !== "title" ? "unsupported" : null);
  if (id === null || region === null || kind === null || (titleAllowed && kind !== "title") ||
      (raw.group_id !== undefined && raw.group_id !== null && text(raw.group_id) === null) ||
      (snapshot && raw.annotation !== undefined && raw.annotation !== null &&
        oneOf(ANNOTATIONS, raw.annotation) === null)) return null;

  const payload = kind === "unsupported" ? { wireKind: raw.kind as string } : parsePayload(kind, raw.payload);
  if (payload === null) return null;

  const revealed = snapshot ? int(raw.revealed) : null;
  if (snapshot && ((raw.revealed !== undefined && (revealed === null || revealed < 1)) ||
      (raw.slots !== undefined && !isRecord(raw.slots)))) return null;
  const pen = oneOf(PENS, raw.pen);
  if (raw.pen !== undefined && raw.pen !== null && pen === null) return null;
  const marks: Mark[] = [];
  if (snapshot && raw.marks !== undefined) {
    if (!Array.isArray(raw.marks)) return null;
    for (const entry of raw.marks) {
      const mark = parseMark(entry);
      if (mark !== null && mark.state !== "clear") marks.push({ ...mark, state: mark.state });
    }
  }

  return {
    id,
    kind,
    region,
    payload,
    groupId: text(raw.group_id),
    annotation: snapshot ? oneOf(ANNOTATIONS, raw.annotation) : null,
    revealed: revealed !== null && revealed > 0 ? revealed : 1,
    slots: snapshot ? parseSlots(raw.slots, kind) : {},
    pen,
    marks,
  } as BoardItem;
}

function parseGroup(raw: unknown): BoardGroup | null {
  if (!isRecord(raw)) return null;

  const id = text(raw.id);
  const kind = oneOf(["box", "columns", "example", "scenario"] as const, raw.kind);
  const region = oneOf(REGIONS, raw.region);
  if (id === null || kind === null || region === null) return null;

  const heading = text(raw.heading);
  const stage = oneOf(["worked", "faded", "try"] as const, raw.stage);
  if (heading === null || (raw.stage !== undefined && raw.stage !== null && stage === null)) return null;
  return { id, kind, region, heading, stage };
}

/* ————— Message ————— */

export function parseBoardControlEvent(value: unknown): BoardControlEvent | null {
  if (!isRecord(value) || typeof value.action !== "string") return null;
  if (!value.action.startsWith("board_")) return null;

  /* Every message carries `rev`, which alone defines its order. A message
     without a valid one is not applied: now that the vocabulary includes
     removals and updates, a dropped message corrupts the state instead of
     merely leaving a line out. */
  const rev = int(value.rev);
  if (rev === null || rev < 0) return null;

  switch (value.action) {
    case "board_show":
    case "board_hide":
      return { action: value.action, rev };

    case "board_clear": {
      /* A missing scope is read as "all", to be safe. */
      const scope = value.scope === undefined ? "all" : oneOf(SCOPES, value.scope);
      return scope === null ? null : { action: "board_clear", scope, rev };
    }

    case "board_set_title": {
      const id = text(value.id);
      const t = text(value.text);
      return id === null || t === null ? null : { action: "board_set_title", id, text: t, rev };
    }

    case "board_add": {
      const item = parseItem(value);
      return item === null ? null : { action: "board_add", item, rev };
    }

    case "board_group": {
      const group = parseGroup(value);
      return group === null ? null : { action: "board_group", group, rev };
    }

    case "board_update": {
      const id = text(value.id);
      if (id === null) return null;

      /* A blank or option slot is a string id; a chain link slot is its
         index from 0, so it may arrive as a number. Both become strings. */
      const slot =
        typeof value.slot === "number" && Number.isInteger(value.slot)
          ? String(value.slot)
          : text(value.slot);
      const t = cell(value.text);
      const state = oneOf(SLOT_STATES, value.state);
      /* Without a slot, text is required; with one, either text or state is. */
      if (slot === null && t === null) return null;
      if (slot !== null && t === null && state === null) return null;

      return { action: "board_update", id, slot, text: t, state, rev };
    }

    case "board_annotate": {
      const id = text(value.id);
      if (id === null || (value.kind !== null && oneOf(ANNOTATIONS, value.kind) === null)) return null;
      /* `kind: null` clears the state. When `key` moves, the clear arrives
         as its own message before the new assignment. */
      return { action: "board_annotate", id, kind: oneOf(ANNOTATIONS, value.kind), rev };
    }

    case "board_mark": {
      const id = text(value.id);
      const mark = parseMark(value);
      return id === null || mark === null ? null : { action: "board_mark", id, ...mark, rev };
    }

    case "board_remove": {
      const id = text(value.id);
      return id === null ? null : { action: "board_remove", id, rev };
    }

    case "board_reveal": {
      const id = text(value.id);
      const index = int(value.index);
      return id === null || index === null || index < 0
        ? null
        : { action: "board_reveal", id, index, rev };
    }

    case "board_pin": {
      const id = text(value.id);
      if (id === null) return null;
      if ((value.pinned !== undefined && typeof value.pinned !== "boolean") ||
          (value.region !== undefined && oneOf(REGIONS, value.region) === null)) return null;
      const pinned = value.pinned !== false;
      return {
        action: "board_pin",
        id,
        pinned,
        region: oneOf(REGIONS, value.region) ?? (pinned ? "pinned" : "live"),
        rev,
      };
    }

    case "board_snapshot": {
      if (typeof value.visible !== "boolean" || !Array.isArray(value.items) ||
          !Array.isArray(value.groups) || (value.title !== null && !isRecord(value.title))) return null;
      /* A broken item is dropped on its own and does not invalidate the whole snapshot. */
      const items = value.items.map((raw) => parseItem(raw, true))
        .filter((it): it is BoardItem => it !== null);
      const groups = value.groups.map(parseGroup).filter((g): g is BoardGroup => g !== null);

      return {
        action: "board_snapshot",
        rev,
        visible: value.visible,
        title: parseItem(value.title, true, true),
        groups,
        items,
      };
    }

    default:
      return null;
  }
}
