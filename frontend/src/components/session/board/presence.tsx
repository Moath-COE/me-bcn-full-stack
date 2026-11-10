import type { ReactNode } from "react";
import { AnimatePresence } from "motion/react";

/* A leaving item stays until its fade-out completes, and a new one
   arrives without waiting. With reduced motion it is removed at once.
   `propagate` keeps exit animations when a whole container is cleared. */
export function BoardPresence({ children, reduce }: { children: ReactNode; reduce: boolean }) {
  return reduce ? children : <AnimatePresence propagate>{children}</AnimatePresence>;
}
