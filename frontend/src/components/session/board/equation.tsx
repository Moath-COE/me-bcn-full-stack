"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { latexMarks, trustedLatexClass } from "@/lib/session/board/latex-marks";
import type { BoardKindProps } from "./kind-props";
import { RichText } from "./rich-text";
import { MarkIcon } from "./table";

/* The raw text stays the source of truth: if the maths or its wrapping
   fails, it is shown as it arrived instead of an error message or
   trusted author markup. */
export function EquationItem({ item, language }: BoardKindProps<"equation">) {
  const { payload } = item;
  const rendered = useMemo(() => {
    const marked = latexMarks(payload.latex, item.marks);
    try {
      let trustedWrappers = 0;
      const html = katex.renderToString(marked.latex, {
        throwOnError: true,
        displayMode: payload.display,
        output: "htmlAndMathml",
        strict: "ignore",
        trust: (context) => {
          /* An author's command gains no trust just because its class name looks like ours. */
          const generated = !/\\htmlClass\b/.test(payload.latex) && trustedLatexClass(context.command, "class" in context ? context.class : undefined);
          if (!generated) throw new Error("Untrusted equation command");
          trustedWrappers += 1;
          return true;
        },
      });
      if (trustedWrappers !== marked.spans.length) throw new Error("Equation wrapper was not parsed");
      return { html, marked };
    } catch {
      return null;
    }
  }, [payload.latex, payload.display, item.marks]);

  if (rendered === null) {
    return <code dir="ltr" className={`min-w-0 max-w-full whitespace-pre-wrap text-sm text-ink-2 [overflow-wrap:anywhere] [unicode-bidi:isolate] ${payload.display ? "block" : "inline-block"}`}>
      {payload.latex}
    </code>;
  }

  return (
    <span className={payload.display ? "block min-w-0 max-w-full" : "inline-block min-w-0 max-w-full align-middle"}>
      <span dir="ltr" data-equation-focus={rendered.marked.focus ? "" : undefined} className={`board-equation max-w-full overflow-x-auto py-1 text-ink [unicode-bidi:isolate] ${payload.display ? "block text-center" : "inline-block align-middle"}`} dangerouslySetInnerHTML={{ __html: rendered.html }} />
      {rendered.marked.spans.map((span) => {
        const answer = span.states.find((state) => state === "correct" || state === "wrong");
        return answer === "correct" || answer === "wrong" ? <span key={span.start} data-mark-answer={answer} className="relative inline-block min-h-5 align-middle">
          <MarkIcon answer={answer} language={language} />
          <span className="sr-only">
            <RichText text={payload.latex.slice(span.start, span.end)} markup={false} pen={item.pen} spans={item.marks.filter((mark) => mark.scope === "span")} />
          </span>
        </span> : null;
      })}
    </span>
  );
}
