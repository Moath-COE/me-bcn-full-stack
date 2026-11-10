/* The language the tutor speaks and writes in. It is sent to the backend with the session token
   request and reaches the tutor agent as a participant attribute. The choice is remembered in
   the browser so the next session starts in the same language. */

export type TutorLanguage = "Arabic" | "English";

const DEFAULT_TUTOR_LANGUAGE: TutorLanguage = "English";

const STORAGE_KEY = "becan:tutor-language";
const CHANGE_EVENT = "becan:tutor-language-change";

export function getTutorLanguage(): TutorLanguage {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "Arabic" || value === "English" ? value : DEFAULT_TUTOR_LANGUAGE;
  } catch {
    return DEFAULT_TUTOR_LANGUAGE;
  }
}

export function setTutorLanguage(value: TutorLanguage) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage is blocked: the choice still applies to this session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Server snapshot for `useSyncExternalStore`: the default, so hydration matches. */
export const getServerTutorLanguage = (): TutorLanguage => DEFAULT_TUTOR_LANGUAGE;

/** For `useSyncExternalStore`: notifies on a change in this tab or another one. */
export function subscribeTutorLanguage(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}
