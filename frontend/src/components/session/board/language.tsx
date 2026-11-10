import { createContext, useContext } from "react";
import type { TutorLanguage } from "@/lib/session/tutor-language";

/* The tutor language applies to the whole board, including state labels
   inside isolated left-to-right runs. */
const BoardLanguage = createContext<TutorLanguage>("English");
export const BoardLanguageProvider = BoardLanguage.Provider;

export function useBoardLanguage(): TutorLanguage {
  return useContext(BoardLanguage);
}
