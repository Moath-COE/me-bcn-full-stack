"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { Marked } from "./kit";

/* The heading is typed out like a message, then the brush stroke is drawn under one word.

   The reveal is a clip, not letters appearing one by one: the text is laid out once, so the
   line never reflows while it types.

   Two motion values drive everything, so nothing re-renders while the animation plays. */

/* The size is an option, not a class passed in `className`: a `text-4xl` given from outside
   would not beat the `xl:text-7xl` written here, because Tailwind's output order decides the
   winner, and the heading would overflow its container at its largest size. */
const HEADLINE_SIZE = {
  page: "text-5xl md:text-6xl xl:text-7xl",
  card: "text-3xl md:text-4xl",
} as const;

export function TypedHeadline({
  prefix,
  word,
  suffix,
  className = "",
  size = "page",
}: {
  prefix: string;
  word: string;
  suffix?: string;
  className?: string;
  size?: keyof typeof HEADLINE_SIZE;
}) {
  const reduce = useReducedMotion();

  const typing = useMotionValue(0);
  const drawing = useMotionValue(0);

  /* At 1 the clip is lifted entirely; otherwise it would cut the stroke where it overshoots the word. */
  const clipPath = useTransform(typing, (p) => (p >= 1 ? "none" : `inset(0 ${(1 - p) * 100}% 0 0)`));
  const caretStart = useTransform(typing, (p) => `${p * 100}%`);
  const caretOpacity = useTransform(typing, (p) => (p >= 1 ? 0 : 1));

  const chars = prefix.length + word.length + (suffix?.length ?? 0);
  const duration = Math.max(0.7, chars * 0.11);

  useEffect(() => {
    if (reduce) {
      typing.set(1);
      drawing.set(1);
      return;
    }
    const type = animate(typing, 1, { duration, ease: "linear" });
    const draw = animate(drawing, 1, {
      duration: 0.45,
      delay: duration,
      ease: [0.2, 0.7, 0.3, 1],
    });
    return () => {
      type.stop();
      draw.stop();
    };
  }, [reduce, typing, drawing, duration]);

  return (
    <h1
      className={`font-display leading-tight font-bold text-ink ${HEADLINE_SIZE[size]} ${className}`}
    >
      <motion.span className="relative inline-block" style={{ clipPath }}>
        <span className="relative z-10">{prefix}</span>{" "}
        <span className="relative isolate inline-block">
          {/* The stroke sits behind an invisible copy of the word, so it can be drawn in
              without scaling the letters the reader sees. */}
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 origin-left"
            style={{ scaleX: drawing, opacity: drawing }}
          >
            <Marked>
              <span className="invisible">{word}</span>
            </Marked>
          </motion.span>
          <span className="relative z-10">{word}</span>
        </span>
        {suffix ? <span className="relative z-10">{suffix}</span> : null}
        {/* The typing caret travels with the clip edge, then disappears. */}
        <motion.span
          aria-hidden="true"
          className="absolute top-[0.18em] bottom-[0.12em] z-20 w-[3px] rounded-pill bg-ink"
          style={{ insetInlineStart: caretStart, opacity: caretOpacity }}
        />
      </motion.span>
    </h1>
  );
}
