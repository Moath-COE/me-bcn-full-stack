/* Shared interface icons. Stroked icons draw in currentColor, so they inherit the parent's colour. */

type P = { className?: string };

const base = {
  "aria-hidden": true as const,
  focusable: "false" as const,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function Chevron({ className = "h-4 w-4" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className} strokeWidth={2.5}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ArrowForward({ className = "h-4 w-4" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M5 12h14m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

export function ArrowBack({ className = "h-4 w-4" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}

export function CheckIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className} strokeWidth={2.5}>
      <path d="m4 12.5 5.5 5.5L20 7" />
    </svg>
  );
}

/* Session icons. */

export function PlayIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg
      {...base}
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      stroke="none"
    >
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

export function MicIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function ChatIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
    </svg>
  );
}

export function SlidesIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
    </svg>
  );
}

export function ListIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </svg>
  );
}

export function CloseIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function MenuIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** A sound wave: bars that pulse with a staggered delay while the tutor speaks. */
export function Waveform({
  className = "h-5",
  bars = 7,
}: {
  className?: string;
  bars?: number;
}) {
  const heights = [0.45, 0.8, 1, 0.65, 1, 0.75, 0.5];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center gap-[3px] ${className}`}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="block w-[3px] rounded-pill bg-current animate-wave"
          style={{
            height: `${heights[i % heights.length] * 100}%`,
            animationDelay: `${(i % heights.length) * 110}ms`,
          }}
        />
      ))}
    </span>
  );
}

/** A phone with an arrow around it: "rotate your screen". With `spinning` the phone really turns to
    landscape and back, which explains the request better than a still drawing. */
export function RotateIcon({
  className = "h-5 w-5",
  spinning = false,
}: P & { spinning?: boolean }) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <rect
        x="9"
        y="2"
        width="6"
        height="11"
        rx="1.5"
        className={spinning ? "animate-flip" : undefined}
        style={
          spinning
            ? { transformBox: "fill-box", transformOrigin: "center" }
            : undefined
        }
      />
      <path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H8.5" />
      <path d="m10.8 17.6-2.6 2.4 2.6 2.4" />
    </svg>
  );
}

export function ExpandIcon({ className = "h-4 w-4" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M9 4H4v5M4 4l6 6M15 20h5v-5M20 20l-6-6" />
    </svg>
  );
}

export function ShrinkIcon({ className = "h-4 w-4" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M4 9h5V4M4 4l5 5M20 15h-5v5M20 20l-5-5" />
    </svg>
  );
}

/** A door with an arrow pointing out. */
export function LeaveIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4" />
    </svg>
  );
}

/* Board icons: one per callout kind and one for the warning state, so the kinds are never told
   apart by colour alone. All are 24×24 with the same stroke. */

/** "Loses marks": the most valuable item on the board. */
export function LosesMarksIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M10.3 3.9 2.6 17.2a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

/** A caution: something that weighs heavily in the exam, not an error. */
export function WarningIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V13" />
      <path d="M12 16.4h.01" />
    </svg>
  );
}

/** A common mistake. */
export function MistakeIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </svg>
  );
}

/** A memory trick. */
export function MnemonicIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .9 1.6l.1.6h5.2l.1-.6c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

/** A definition. */
export function BookIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v14H6.5A2.5 2.5 0 0 0 4 19.5Z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H19v4H6.5A2.5 2.5 0 0 1 4 19.5Z" />
    </svg>
  );
}

/** A worked example. The lines are centred, so the icon assumes no text direction. */
export function ExampleIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M5 5h14M5 10h14M7.5 15h9" />
      <path d="m8.5 19.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

/** Comes up in the exam. */
export function ExamIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg {...base} viewBox="0 0 24 24" className={className}>
      <path d="M9 3h6v2.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1Z" />
      <path d="M15 4.2h2.5a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V6.2a2 2 0 0 1 2-2H9" />
      {/* Centred, so the icon assumes no text direction. */}
      <path d="M7.5 12h9M9 16h6" />
    </svg>
  );
}
