import type { AnnotationKind, CalloutKind, MarkState, Stage } from "@/lib/session/board/types";
import type { TutorLanguage } from "@/lib/session/tutor-language";

/* The board's own labels, in both tutor languages. Board labels are part
   of what the tutor writes, so they follow the tutor language the student
   chose, not the interface language. That is why this file holds Arabic
   text. */
export const BOARD_LABEL = { Arabic: "السبورة", English: "Board" } as const;

export const BAND_LABEL = {
  pinned: { Arabic: "مرجع", English: "Reference" },
  temporary: { Arabic: "جانبيّ", English: "Aside" },
} as const;

export const ANNOTATION_LABEL: Partial<Record<AnnotationKind, Record<TutorLanguage, string>>> = {
  warning: { Arabic: "تنبيه", English: "Note" },
  correct: { Arabic: "إجابة صحيحة", English: "Correct" },
  wrong: { Arabic: "إجابة خاطئة", English: "Wrong" },
  broken: { Arabic: "وصلة ملغاة", English: "Cancelled link" },
};

export const CALLOUT_LABEL: Record<CalloutKind, Record<TutorLanguage, string>> = {
  loses_marks: { Arabic: "يضيّع درجات", English: "Loses marks" },
  mistake: { Arabic: "غلط شائع", English: "Common mistake" },
  mnemonic: { Arabic: "حيلة للحفظ", English: "Mnemonic" },
  definition: { Arabic: "تعريف", English: "Definition" },
  example: { Arabic: "مثال", English: "Example" },
  exam: { Arabic: "يجي في الاختبار", English: "In the exam" },
  verbatim: { Arabic: "بنص الكتاب", English: "Textbook text" },
};

export const BLANK_LABEL = { Arabic: "فراغ", English: "blank" } as const;

export const OPTION_LABELS = {
  Arabic: ["A", "B", "C", "D", "E", "F"],
  English: ["A", "B", "C", "D", "E", "F"],
} as const;

export const STAGE_LABEL: Record<Stage, Record<TutorLanguage, string>> = {
  worked: { Arabic: "أنا أشاهد", English: "I'm watching" },
  faded: { Arabic: "أنا أملأ", English: "I'm filling in" },
  try: { Arabic: "هذا لي", English: "This one is mine" },
};

export const EXAMPLE_LABEL = { Arabic: "مثال", English: "Example" } as const;

export const MARK_LABEL: Record<MarkState, Record<TutorLanguage, string>> = {
  highlight: { Arabic: "مُبرَز", English: "Highlighted" },
  correct: { Arabic: "إجابة صحيحة", English: "Correct" },
  wrong: { Arabic: "إجابة خاطئة", English: "Wrong" },
  dim: { Arabic: "أقل بروزًا", English: "Dimmed" },
  strike: { Arabic: "مشطوب", English: "Struck through" },
  focus: { Arabic: "انظر هنا", English: "Focus here" },
};

export const UNKNOWN_ICON_LABEL = { Arabic: "رمز غير معروف", English: "Unknown icon" } as const;
export const UNSUPPORTED_LABEL = { Arabic: "عنصر غير مدعوم", English: "Unsupported item" } as const;
