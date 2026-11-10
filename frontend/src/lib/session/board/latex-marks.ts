import type { Mark, MarkState } from "./types";

export type LatexSpan = { start: number; end: number; states: MarkState[] };
const markStates = new Set<MarkState>(["highlight", "correct", "wrong", "dim", "strike", "focus"]);

/* Marks are matched against the original source, which keeps the
   positions of fractions and commands stable when marks are cleared. A
   range matched by several marks collects their states; a partially
   overlapping range is skipped rather than nested. */
export function latexMarks(latex: string, marks: Mark[]): { latex: string; spans: LatexSpan[]; focus: boolean } {
  const spans: LatexSpan[] = [];
  for (const mark of marks) {
    if (mark.scope !== "span" || !mark.match || !markStates.has(mark.state)) continue;
    for (let start = latex.indexOf(mark.match); start !== -1; start = latex.indexOf(mark.match, start + mark.match.length)) {
      const end = start + mark.match.length;
      let span = spans.find((candidate) => candidate.start === start && candidate.end === end);
      if (!span) {
        if (spans.some((candidate) => start < candidate.end && end > candidate.start)) continue;
        span = { start, end, states: [] };
        spans.push(span);
      }
      if (mark.state === "correct" || mark.state === "wrong") {
        span.states = span.states.filter((state) => state !== "correct" && state !== "wrong");
      }
      if (!span.states.includes(mark.state)) span.states.push(mark.state);
    }
  }
  spans.sort((a, b) => a.start - b.start);
  let source = "";
  let cursor = 0;
  for (const span of spans) {
    source += latex.slice(cursor, span.start);
    source += `\\htmlClass{${span.states.map((state) => `board-mark-${state}`).join(" ")}}{${latex.slice(span.start, span.end)}}`;
    cursor = span.end;
  }
  source += latex.slice(cursor);
  return { latex: source, spans, focus: spans.some((span) => span.states.includes("focus")) };
}

/** Trusts only `\htmlClass` carrying our own mark classes, so class names
    cannot be used to bring in HTML or other trusted commands. */
export function trustedLatexClass(command: string, classes: unknown): boolean {
  return command === "\\htmlClass" && typeof classes === "string" && classes.length > 0 && classes.split(/\s+/).every((name) => name.startsWith("board-mark-") && markStates.has(name.slice("board-mark-".length) as MarkState));
}
