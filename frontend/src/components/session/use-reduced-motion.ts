import { useCallback, useSyncExternalStore } from "react";

/* Replaces motion's `useReducedMotion` inside the session.

   That hook reads the system preference on the first client render, so hydration would see
   true where the server rendered false. `reduce` changes the shape of the tree (the board adds
   or drops `AnimatePresence`), which shifts `useId` values and breaks hydration for anyone
   with "reduce motion" on.

   Here the server snapshot is false and is also used during hydration; React then corrects
   the value in a second render. */
const REDUCE_MQ = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia(REDUCE_MQ);
    mq.addEventListener("change", notify);
    return () => mq.removeEventListener("change", notify);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCE_MQ).matches,
    () => false,
  );
}
