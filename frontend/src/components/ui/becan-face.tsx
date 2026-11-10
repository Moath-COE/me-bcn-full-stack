"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";

/* Becan's face. The eyes and the smile are drawn here because they move: both eyes blink, then
   one winks, and the head tilts slightly. */

const EYE = {
  transformBox: "fill-box" as const,
  transformOrigin: "center" as const,
};

/* The face at small sizes, such as the play button. It is not `BecanFace` scaled down: that one
   runs two springs, two blink cycles and a tilt, which are lost below 24px but still cost. This
   one is two eyes and a mouth.

   It inherits its colour through `currentColor`, so it works on amber and on anything else. The
   mouth moves with CSS, not Motion, because its movement is a fixed loop, not driven by an event. */
export function BecanGlyph({
  /* The ratio of the cropped viewBox (68×52). A square box would letterbox the face and shrink it. */
  className = "h-5 w-[26px]",
  speaking = false,
}: {
  className?: string;
  speaking?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      /* The shapes are the ones in `BecanFace` below: same eye coordinates, same smile arc and
         stroke width. A change to one face has to be made in the other.

         Only the viewBox differs: it is cropped to the features (16 6 68 52) instead of 100×58.
         The full box leaves a wide margin, and at 28px the eyes shrink to dots. */
      viewBox="16 6 68 52"
      className={`${speaking ? "" : "animate-face-tilt"} ${className}`}
      style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
      fill="currentColor"
    >
      {/* The eyes always blink. The wink is for the idle state only: while the tutor speaks the
          mouth is enough, and a wink would distract from what is being said. */}
      <rect
        x="30"
        y="10"
        width="12"
        height="19"
        rx="6"
        className="animate-blink"
        style={EYE}
      />
      <rect
        x="58"
        y="10"
        width="12"
        height="19"
        rx="6"
        className={speaking ? "animate-blink" : "animate-wink"}
        style={EYE}
      />

      {/* The mouth is the smile arc itself. While speaking it stretches and springs back in an
          uneven rhythm that reads as speech; swapping in another shape would change the face. */}
      <path
        d="M24 42c16 11 36 11 52 0"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
        className={speaking ? "animate-talk" : undefined}
        style={
          speaking
            ? { transformBox: "fill-box", transformOrigin: "center" }
            : undefined
        }
      />
    </svg>
  );
}

/** A point the face looks at, in viewport coordinates. `null` looks straight ahead. */
export type LookPoint = { x: number; y: number } | null;

export function BecanFace({
  className = "w-24",
  lookAt = null,
}: {
  className?: string;
  lookAt?: LookPoint;
}) {
  const reduce = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);

  /* The eyes shift toward the point on a spring, so they follow smoothly instead of jumping. */
  const dx = useSpring(0, { stiffness: 220, damping: 20, mass: 0.4 });
  const dy = useSpring(0, { stiffness: 220, damping: 20, mass: 0.4 });

  useEffect(() => {
    if (!lookAt || reduce) {
      dx.set(0);
      dy.set(0);
      return;
    }
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    // The centre of the eye line, not of the frame.
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height * 0.34;
    const vx = lookAt.x - cx;
    const vy = lookAt.y - cy;
    const len = Math.hypot(vx, vy) || 1;
    dx.set((vx / len) * 5);
    dy.set((vy / len) * 3.5);
  }, [lookAt, reduce, dx, dy]);

  /* A 5.2s cycle: both eyes blink at the start, then the right eye winks halfway through. */
  const blink = reduce
    ? undefined
    : {
        scaleY: [1, 0.08, 1, 1, 1],
        transition: {
          duration: 5.2,
          times: [0, 0.03, 0.06, 0.6, 1],
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
      };

  const wink = reduce
    ? undefined
    : {
        scaleY: [1, 0.08, 1, 1, 0.08, 1, 1],
        transition: {
          duration: 5.2,
          times: [0, 0.03, 0.06, 0.5, 0.53, 0.57, 1],
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
      };

  const tilt = reduce
    ? undefined
    : {
        rotate: [0, -3, 0, 2, 0],
        transition: {
          duration: 7.5,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
      };

  return (
    <motion.svg
      ref={svgRef}
      role="img"
      aria-label="Becan"
      viewBox="0 0 100 58"
      className={className}
      animate={tilt}
      style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
    >
      <g className="text-warmth">
        <motion.g style={{ x: dx, y: dy }}>
          <motion.rect
            x="30"
            y="10"
            width="12"
            height="19"
            rx="6"
            fill="currentColor"
            style={EYE}
            animate={blink}
          />
          <motion.rect
            x="58"
            y="10"
            width="12"
            height="19"
            rx="6"
            fill="currentColor"
            style={EYE}
            animate={wink}
          />
        </motion.g>
        <path
          d="M24 42c16 11 36 11 52 0"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </motion.svg>
  );
}
