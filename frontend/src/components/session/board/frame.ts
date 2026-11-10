import type { TutorLanguage } from "@/lib/session/tutor-language";

export function boardFrame(language: TutorLanguage) {
  return language === "Arabic"
    ? { dir: "rtl", lang: "ar" } as const
    : { dir: "ltr", lang: "en" } as const;
}
