"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Dialog } from "radix-ui";
import { ArrowBack, ArrowForward, ExpandIcon, ShrinkIcon } from "@/components/ui/icons";
import {
  DEFAULT_SLIDE_RATIO,
  centerDelta,
  currentSlide,
  isWithin,
  slideMark,
  slideRatio,
  type PickedSlide,
  type SlideMark,
} from "@/lib/session/slides";
import { SlidesMessage } from "./parts";

/* The slides pane: the chapter's PDF, rendered with react-pdf.

   A stack of cards, vertical on desktop and horizontal on mobile. The open slide follows the
   tutor agent's request (`scroll`), and a student's pick overrides that until the agent asks
   for another slide. Only the tutor's slide carries the "Now" tag; the other cards are dimmed.
   The worker is bundled locally from pdfjs-dist, at the version react-pdf uses, so no external
   CDN is involved. */

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/* An element's width through a callback ref (React 19 accepts a cleanup function from one). */
function useWidth() {
  const [width, setWidth] = useState(0);
  const ref = (el: HTMLElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  };
  return [ref, width] as const;
}

/* Width and height together, for the enlarged slide, which fits on both axes. */
function useSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = (el: HTMLElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  };
  return [ref, size] as const;
}

const MARK_CLASS: Record<SlideMark, string> = {
  now: "border-[3px] border-warmth ring-4 ring-warmth/35",
  start: "border-[3px] border-warmth ring-4 ring-warmth/35",
  picked: "border-[3px] border-ink-2",
  other: "border border-line opacity-50 hover:opacity-100 focus-within:opacity-100",
};

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SlidesPane({
  url,
  agentPage,
}: {
  url: string;
  agentPage: number | null;
}) {
  const [numPages, setNumPages] = useState(0);
  const [picked, setPicked] = useState<PickedSlide | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  /* Slides that have come near the viewport once: they are rendered and stay rendered. */
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set());
  const [cardRef, cardWidth] = useWidth();
  const [zoomRef, zoomBox] = useSize();
  /* The cards' ratio comes from the file's first page (4:3 until it is read), so no slide is cropped. */
  const [docRatio, setDocRatio] = useState(DEFAULT_SLIDE_RATIO);
  /* The enlarged slide's own ratio, in case it differs from the first page. */
  const [zoomRatio, setZoomRatio] = useState<number | null>(null);
  const ratio = zoomRatio ?? docRatio;
  /* The enlarged slide fits whole, with no scrolling: the smaller of the container's width
     and the width its height allows, minus the frame's border (2px on each side). */
  const zoomWidth = Math.max(
    0,
    Math.floor(Math.min(zoomBox.width - 4, (zoomBox.height - 4) * ratio)),
  );
  const listRef = useRef<HTMLOListElement>(null);

  const clamp = (p: number) => (numPages > 0 ? Math.min(Math.max(p, 1), numPages) : p);
  const current = currentSlide({ picked, agentPage, numPages });
  const { page, pickedActive } = current;

  /* The tutor's slide is centred in the column (vertically on desktop, horizontally on
     mobile); a slide the student picked is left alone when it is fully visible. Scrolling
     happens inside the list only (`scrollBy`, not `scrollIntoView`), so the containers above
     it do not move. It reruns when the ratio changes because the cards change size. */
  useEffect(() => {
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!list || !card) return;
    const c = list.getBoundingClientRect();
    const i = card.getBoundingClientRect();
    if (
      pickedActive &&
      isWithin(c.top, c.height, i.top, i.height) &&
      isWithin(c.left, c.width, i.left, i.width)
    ) {
      return;
    }
    list.scrollBy({
      top: centerDelta(c.top, c.height, i.top, i.height),
      left: centerDelta(c.left, c.width, i.left, i.width),
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, [page, pickedActive, numPages, ratio]);

  /* Lazy rendering with no cap: each card is rendered when it comes within 600px of the
     viewport on either axis and is never unmounted afterwards, so scrolling back does not
     render it again. State is set inside the observer callback, not in the effect body. */
  useEffect(() => {
    const root = listRef.current;
    if (!root || numPages === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const fresh = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number((e.target as HTMLElement).dataset.page));
        if (fresh.length === 0) return;
        setSeen((prev) => {
          if (fresh.every((p) => prev.has(p))) return prev;
          const next = new Set(prev);
          fresh.forEach((p) => next.add(p));
          return next;
        });
      },
      { root, rootMargin: "600px" },
    );

    root.querySelectorAll("li[data-page]").forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, [numPages]);

  /* ————— Enlarged view ————— */
  const go = (p: number) => setZoom(clamp(p));
  /* Closing leaves the column on the last slide the student saw enlarged. */
  const closeZoom = () => {
    if (zoom !== null) setPicked({ page: zoom, agentPage });
    setZoom(null);
  };

  return (
    <Document
      file={url}
      onLoadSuccess={async (pdf) => {
        setNumPages(pdf.numPages);
        try {
          const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
          setDocRatio(slideRatio(viewport.width, viewport.height));
        } catch {
          /* Stays 4:3. */
        }
      }}
      loading={<SlidesMessage text="Preparing slides…" />}
      error={<SlidesMessage text="We couldn’t open the slides. Try refreshing the page." />}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ol
        ref={listRef}
        aria-label="Slides"
        className="no-scrollbar flex min-h-0 flex-1 gap-3 overflow-x-auto px-1.5 py-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto"
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
          const mark = slideMark(p, current);
          const drawn = seen.has(p) || Math.abs(p - page) <= 1;
          return (
            <li key={p} data-page={p} className="w-[85%] shrink-0 md:w-auto">
              {/* The warm frame marks the tutor's slide, the student's pick gets a neutral
                  frame, and the rest are dimmed until hovered or focused. */}
              <div
                className={`relative overflow-hidden rounded-lg bg-panel transition-[opacity,border-color] motion-reduce:transition-none ${MARK_CLASS[mark]}`}
              >
                <button
                  type="button"
                  onClick={() => setPicked({ page: p, agentPage })}
                  aria-current={mark === "now" || mark === "start" ? "true" : undefined}
                  aria-label={`Slide ${p}`}
                  /* The container clips what is outside it, so the focus ring is drawn inside the button. */
                  className="block w-full focus-visible:outline-offset-[-3px]"
                >
                  {/* An empty card has the file's ratio too: it has its real size before it
                      is rendered, so the observer sees it in place and no slide is cropped. */}
                  <span
                    ref={p === page ? cardRef : undefined}
                    style={{ aspectRatio: docRatio }}
                    className="block w-full overflow-hidden"
                  >
                    {drawn && cardWidth > 0 ? (
                      <Page
                        pageNumber={p}
                        width={cardWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        loading={null}
                      />
                    ) : null}
                  </span>
                </button>

                {mark === "now" ? (
                  <span className="pointer-events-none absolute top-1 start-1 inline-flex items-center gap-1.5 rounded-pill bg-ground/85 px-2 py-0.5 text-xs font-semibold text-ink">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-live" />
                    Now
                  </span>
                ) : null}

                <div className="absolute top-1 end-1 flex items-center gap-1">
                  <span className="rounded-pill bg-ground/85 px-1.5 text-[10px] font-semibold text-ink">
                    {p}
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom(p)}
                    aria-label={`Enlarge slide ${p}`}
                    title="Enlarge"
                    className="group/zoom flex h-11 w-11 items-center justify-center pointer-fine:md:h-8 pointer-fine:md:w-8"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-ground/85 text-ink-2 transition-colors group-hover/zoom:text-ink">
                      <ExpandIcon className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>

                {/* "Start explanation here": the tutor agent cannot map a slide to its lesson yet. */}
                {pickedActive && picked?.page === p ? (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center p-2">
                    <button
                      type="button"
                      aria-disabled
                      title="Coming soon"
                      className="inline-flex min-h-11 items-center rounded-pill border border-dashed border-ink-3 bg-ground/85 px-3 text-xs font-bold text-ink-2"
                    >
                      Start explanation here — Coming soon
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <Dialog.Root
        open={zoom !== null}
        onOpenChange={(o) => {
          if (!o) closeZoom();
        }}
      >
        <Dialog.Portal>
          <div data-theme="dark" data-surface="session" className="text-ink">
            <Dialog.Content
              aria-describedby={undefined}
              onKeyDown={(e) => {
                if (zoom === null) return;
                const target =
                  e.key === "ArrowRight"
                    ? zoom + 1
                    : e.key === "ArrowLeft"
                      ? zoom - 1
                      : e.key === "Home"
                        ? 1
                        : e.key === "End"
                          ? numPages
                          : null;
                if (target === null) return;
                e.preventDefault();
                go(target);
              }}
              className="fixed inset-0 z-50 flex flex-col bg-ground/90 p-4 backdrop-blur-sm"
            >
              {/* There is one visible counter, under the slide near the thumb; the title is
                  for screen readers. */}
              <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-3 pb-2">
                <Dialog.Title className="sr-only">
                  Slide {zoom ?? 1} of {numPages}
                </Dialog.Title>
                <Dialog.Close
                  aria-label="Close enlarged view"
                  className="flex h-11 w-11 items-center justify-center rounded-pill text-ink-2 transition-colors hover:bg-surface hover:text-ink pointer-fine:md:h-8 pointer-fine:md:w-8"
                >
                  <ShrinkIcon className="h-4 w-4" />
                </Dialog.Close>
              </div>

              <div
                ref={zoomRef}
                className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center overflow-hidden"
              >
                {zoom !== null && zoomWidth > 0 ? (
                  <span className="block overflow-hidden rounded-xl border-2 border-warmth bg-panel">
                    <Page
                      pageNumber={zoom}
                      width={zoomWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={null}
                      onLoadSuccess={(pg) => {
                        if (pg.originalWidth > 0 && pg.originalHeight > 0) {
                          setZoomRatio(slideRatio(pg.originalWidth, pg.originalHeight));
                        }
                      }}
                    />
                  </span>
                ) : null}
              </div>

              {/* Navigation sits under the slide, within thumb reach. */}
              {zoom !== null ? (
                <div className="mx-auto flex w-full max-w-5xl items-center justify-center gap-4 pt-3">
                  <ZoomNav
                    label="Previous slide"
                    disabled={zoom <= 1}
                    onClick={() => go(zoom - 1)}
                  >
                    <ArrowBack className="h-5 w-5" />
                  </ZoomNav>
                  <p aria-live="polite" className="min-w-20 text-center text-sm font-semibold text-ink">
                    {zoom} of {numPages}
                  </p>
                  <ZoomNav
                    label="Next slide"
                    disabled={zoom >= numPages}
                    onClick={() => go(zoom + 1)}
                  >
                    <ArrowForward className="h-5 w-5" />
                  </ZoomNav>
                </div>
              ) : null}
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </Document>
  );
}

function ZoomNav({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      title={label}
      aria-disabled={disabled ? true : undefined}
      className={`flex h-11 w-11 items-center justify-center rounded-pill border border-line transition-colors ${
        disabled ? "text-ink-2 opacity-45" : "bg-surface text-ink hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
