import { useCallback, useSyncExternalStore } from "react";

/* Below `md` (48rem) there are no side columns, so the lessons button opens a bottom sheet
   instead of toggling a column that is not there.

   The server snapshot is false: the desktop layout renders first and hydration corrects it. */
const MOBILE_MQ = "(max-width: 47.9375rem)";

export function useIsMobile() {
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia(MOBILE_MQ);
    mq.addEventListener("change", notify);
    return () => mq.removeEventListener("change", notify);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_MQ).matches,
    () => false,
  );
}
