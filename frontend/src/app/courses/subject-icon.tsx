"use client";

import { motion, type Variant, type Variants } from "motion/react";
import type { IconKey } from "@/lib/courses/presentation";

/* Line icons, one per course subject, in a single colour inherited from the parent (currentColor).
   Each icon has its own movement, driven by the card's "hover" variant, so it needs no listener
   of its own. */

const spring = { type: "spring" as const, stiffness: 300, damping: 14 };

/** The same animation under two keys: `hover` for the mouse, `play` for scrolling into view. */
const v = (anim: Variant): Variants => ({ hover: anim, play: anim });

const ICONS: Record<IconKey, React.ReactNode> = {
  /* Accounting: a stack of coins; the top one lifts. */
  coins: (
    <>
      <path d="M10 17v13c0 3 6.3 5.5 14 5.5s14-2.5 14-5.5V17" />
      <path d="M10 24c0 3 6.3 5.5 14 5.5S38 27 38 24" />
      <motion.g variants={v({ y: -5, transition: spring })}>
        <ellipse cx="24" cy="17" rx="14" ry="5.5" />
      </motion.g>
    </>
  ),

  /* Economics: bars that grow one after another. */
  bars: (
    <>
      <path d="M8 40h32" />
      {[
        [13, 28],
        [24, 20],
        [35, 25],
      ].map(([x, y], i) => (
        <motion.path
          key={x}
          d={`M${x} 40V${y}`}
          strokeWidth="6"
          variants={v({
            pathLength: [1, 0.55, 1],
            transition: { duration: 0.7, delay: i * 0.08 },
          })}
        />
      ))}
    </>
  ),

  /* Management: blocks that move apart. */
  blocks: (
    <>
      <motion.rect
        x="7"
        y="25"
        width="15"
        height="15"
        rx="3.5"
        variants={v({ x: -2, y: 2, transition: spring })}
      />
      <motion.rect
        x="26"
        y="25"
        width="15"
        height="15"
        rx="3.5"
        variants={v({ x: 2, y: 2, transition: spring })}
      />
      <motion.rect
        x="16.5"
        y="7"
        width="15"
        height="15"
        rx="3.5"
        variants={v({ y: -4, transition: spring })}
      />
    </>
  ),

  /* Mathematics: a ring that turns. */
  torus: (
    <motion.g
      style={{ originX: "24px", originY: "24px" }}
      variants={v({ rotate: 180, transition: { duration: 0.7 } })}
    >
      <circle cx="24" cy="24" r="16" />
      <circle cx="24" cy="24" r="6.5" />
      <path d="M24 8v9.5" />
    </motion.g>
  ),

  /* Chemistry: a flask with rising bubbles. */
  flask: (
    <>
      <path d="M19 6h10" />
      <path d="M21 6v13L11 36c-1.6 2.7.4 6 3.5 6h19c3.1 0 5.1-3.3 3.5-6L27 19V6" />
      <path d="M15.5 28h17" />
      {[
        [20, 0],
        [27, 0.12],
        [23.5, 0.24],
      ].map(([cx, d], i) => (
        <motion.circle
          key={i}
          cx={cx}
          cy="34"
          r="1.8"
          fill="currentColor"
          stroke="none"
          variants={v({
            y: [-0, -8, -0],
            opacity: [0.35, 1, 0.35],
            transition: { duration: 0.9, delay: d },
          })}
        />
      ))}
    </>
  ),

  /* Physics: orbits turning around a nucleus. */
  atom: (
    <>
      <motion.g
        style={{ originX: "24px", originY: "24px" }}
        variants={v({ rotate: 180, transition: { duration: 0.9 } })}
      >
        <ellipse cx="24" cy="24" rx="19" ry="7.5" />
        <ellipse
          cx="24"
          cy="24"
          rx="19"
          ry="7.5"
          transform="rotate(60 24 24)"
        />
        <ellipse
          cx="24"
          cy="24"
          rx="19"
          ry="7.5"
          transform="rotate(120 24 24)"
        />
      </motion.g>
      <circle cx="24" cy="24" r="4" fill="currentColor" stroke="none" />
    </>
  ),

  /* Statistics: a slice that separates from the ring. */
  donut: (
    <>
      <circle cx="24" cy="24" r="15" />
      <circle cx="24" cy="24" r="5.5" />
      <motion.path
        d="M24 9a15 15 0 0 1 13 7.6"
        strokeWidth="5"
        variants={v({ x: 3, y: -3, transition: spring })}
      />
    </>
  ),

  /* Programming: a cube that tilts. */
  cube: (
    <motion.g
      variants={v({ rotate: -12, scale: 1.06, transition: spring })}
      style={{ originX: "24px", originY: "24px" }}
    >
      <path d="M24 6 40 15v18l-16 9-16-9V15z" />
      <path d="M8 15l16 9 16-9" />
      <path d="M24 24v18" />
    </motion.g>
  ),

  /* Electricity: a bolt that flashes. */
  bolt: (
    <motion.path
      d="M27 5 12 27h10l-3 16 17-23H25z"
      variants={v({ scale: [1, 1.18, 1], transition: { duration: 0.5 } })}
      style={{ originX: "24px", originY: "24px" }}
    />
  ),
};

export function SubjectIcon({
  icon,
  className = "",
}: {
  icon: IconKey;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[icon]}
    </svg>
  );
}
