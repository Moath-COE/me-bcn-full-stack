import type {
  BoardGroup,
  BoardItem,
  BoardRegion,
  BoardState,
} from "@/lib/session/board/types";

/* Projects the board state onto one region, as a pure function.

   A container does not belong to the region of its members: pinning
   moves the member alone and keeps its `groupId`, so the container is
   drawn around its members in every region they occupy, and its identity
   (heading, kind, stage) is read from its record wherever that is. If
   the record goes when its region is cleared, the members remain
   without a container and nothing is lost. */

/** A single item, or a cluster of icons attached to each other through `attachTo`. */
export type RegionEntry =
  | { type: "item"; item: BoardItem }
  | { type: "cluster"; items: BoardItem[] };

export type RegionBlock =
  | RegionEntry
  | { type: "group"; group: BoardGroup; entries: RegionEntry[] };

/**
 * Valid attachments: icon id → target id.
 *
 * The target must come before the icon in order, and be an icon in the
 * same region and the same container. Anything else (a removed target,
 * or one in another container or region) falls back to the normal flow,
 * so the icon is neither lost nor left dangling.
 */
export function validAttachments(items: BoardItem[]): Map<string, string> {
  const position = new Map(items.map((item, index) => [item.id, index]));
  const valid = new Map<string, string>();

  items.forEach((item, index) => {
    if (item.kind !== "icon" || item.payload.attachTo === null) return;
    const targetIndex = position.get(item.payload.attachTo);
    if (targetIndex === undefined || targetIndex >= index) return;
    const target = items[targetIndex];
    if (target.kind !== "icon") return;
    if (target.region !== item.region || target.groupId !== item.groupId) return;
    valid.set(item.id, target.id);
  });

  return valid;
}

/* A cluster forms at its root: an icon that attaches to nothing and has
   others attached to it. All its branches join it in the order they were
   added, so the units stand next to their target. The result maps the id
   of the first item of each entry to that entry; an item that joined an
   earlier cluster has no entry of its own, because it appears in its
   cluster. */
function arrange(members: BoardItem[], attachments: Map<string, string>): Map<string, RegionEntry> {
  const rootOf = (id: string): string => {
    let current = id;
    while (attachments.has(current)) current = attachments.get(current)!;
    return current;
  };
  const hasDependents = new Set(attachments.values());
  const clusters = new Map<string, BoardItem[]>();
  const entries = new Map<string, RegionEntry>();

  for (const item of members) {
    if (attachments.has(item.id)) {
      const cluster = clusters.get(rootOf(item.id));
      if (cluster) {
        cluster.push(item);
        continue;
      }
    }
    if (hasDependents.has(item.id) && !attachments.has(item.id)) {
      const items = [item];
      clusters.set(item.id, items);
      entries.set(item.id, { type: "cluster", items });
      continue;
    }
    entries.set(item.id, { type: "item", item });
  }

  return entries;
}

/** Orders the members of one list by appearance, attaching icons to their targets. */
function entriesOf(members: BoardItem[], attachments: Map<string, string>): RegionEntry[] {
  const arranged = arrange(members, attachments);
  return members.flatMap((item) => {
    const entry = arranged.get(item.id);
    return entry ? [entry] : [];
  });
}

export function projectRegion(board: BoardState, region: BoardRegion): RegionBlock[] {
  const regionItems = board.items.filter((item) => item.region === region);
  const attachments = validAttachments(board.items);
  const groupsById = new Map(board.groups.map((group) => [group.id, group]));
  const members = new Map<string, BoardItem[]>();
  const loose = regionItems.filter((item) => !(item.groupId && groupsById.has(item.groupId)));
  const looseEntries = arrange(loose, attachments);
  const blocks: RegionBlock[] = [];

  /* A block sits where its first item sits: a container arrives before
     its members, so it stays among its neighbours where it started
     instead of at the end of the region. */
  for (const item of regionItems) {
    const group = item.groupId ? groupsById.get(item.groupId) : undefined;
    if (!group) {
      const entry = looseEntries.get(item.id);
      if (entry) blocks.push(entry);
      continue;
    }
    const list = members.get(group.id);
    if (list) {
      list.push(item);
    } else {
      members.set(group.id, [item]);
      blocks.push({ type: "group", group, entries: [] });
    }
  }

  for (const block of blocks) {
    if (block.type === "group") {
      block.entries = entriesOf(members.get(block.group.id) ?? [], attachments);
    }
  }

  /* A container with no members in any region has its heading drawn on
     its own, in the live region only. If its members are in another
     region it has been drawn there, and repeating it empty here would be
     a useless shell; the pinned and temporary regions are a reference
     and a detour, so they never carry a heading without content. */
  if (region === "live") {
    const occupied = new Set(board.items.map((item) => item.groupId));
    for (const group of board.groups) {
      if (group.region === "live" && !occupied.has(group.id)) {
        blocks.push({ type: "group", group, entries: [] });
      }
    }
  }

  return blocks;
}

function entryItems(entry: RegionEntry): BoardItem[] {
  return entry.type === "item" ? [entry.item] : entry.items;
}

/** Items in the order they appear on screen. */
function blockItems(blocks: RegionBlock[]): BoardItem[] {
  return blocks.flatMap((block) =>
    block.type === "group" ? block.entries.flatMap(entryItems) : entryItems(block),
  );
}

/**
 * Step numbering is per region and follows the order of appearance, so
 * the student never sees 3 above 2. Containers and other kinds are not
 * numbered and do not interrupt the count.
 */
export function stepNumbers(blocks: RegionBlock[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;
  for (const item of blockItems(blocks)) {
    if (item.kind === "step") numbers.set(item.id, next++);
  }
  return numbers;
}
