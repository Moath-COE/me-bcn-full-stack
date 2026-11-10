import type { BoardItem } from "@/lib/session/board/types";
import type { TutorLanguage } from "@/lib/session/tutor-language";

/** One prop shape for every kind: the item keeps its identity and state alongside its payload. */
export type BoardKindProps<K extends BoardItem["kind"] = BoardItem["kind"]> = {
  item: Extract<BoardItem, { kind: K }>;
  language: TutorLanguage;
  n: number;
};
