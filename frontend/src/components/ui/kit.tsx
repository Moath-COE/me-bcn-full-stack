import Link from "next/link";
import { ArrowForward, Chevron } from "./icons";
import { BecanLogo } from "./logo";
import { SiteNav } from "./site-nav";

/* The shared building blocks every page is made from. */

/* The highlight overshoots its word; the overshoot is narrower on phones so a word at the
   container's edge cannot push the stroke off screen. */
const highlightBox =
  "absolute -inset-x-3 sm:-inset-x-7 -top-[0.04em] -bottom-[0.08em] z-0 block -rotate-3";

/** An amber brush stroke behind one word of a heading. */
function HighlightSvg() {
  return (
    <svg
      viewBox="0 0 240 74"
      preserveAspectRatio="none"
      className="h-full w-full text-highlight"
    >
      <defs>
        {/* Noise displaces the edges so they fray like bristles. */}
        <filter
          id="becan-brush"
          x="-16%"
          y="-45%"
          width="132%"
          height="190%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.014 0.16"
            numOctaves="4"
            seed="9"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        {/* The mask cuts dry horizontal streaks into the stroke. */}
        <mask id="becan-brush-mask">
          <rect x="-12" y="-12" width="264" height="98" fill="white" />
          <g stroke="black" strokeLinecap="round" filter="url(#becan-brush)">
            <path d="M2 22h236" strokeWidth="2.6" opacity="0.8" />
            <path d="M2 33h236" strokeWidth="1.5" opacity="0.5" />
            <path d="M2 44h236" strokeWidth="2.2" opacity="0.7" />
            <path d="M2 55h236" strokeWidth="1.3" opacity="0.45" />
          </g>
        </mask>
      </defs>
      <rect
        x="6"
        y="10"
        width="228"
        height="54"
        rx="2"
        fill="currentColor"
        filter="url(#becan-brush)"
        mask="url(#becan-brush-mask)"
      />
    </svg>
  );
}

function Highlight() {
  return (
    <span aria-hidden="true" className={highlightBox}>
      <HighlightSvg />
    </span>
  );
}

/** A highlighted word in a heading; the letters are drawn above the stroke. */
export function Marked({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative isolate inline-block">
      <Highlight />
      <span className="relative z-10">{children}</span>
    </span>
  );
}

/** The page frame: header, content, and an optional footer pinned to the bottom of the viewport. */
export function PageShell({
  children,
  withFooter = false,
}: {
  children: React.ReactNode;
  withFooter?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      {children}
      {withFooter ? <SiteFooter /> : null}
    </div>
  );
}

function SiteFooter() {
  return (
    <footer data-theme="dark" className="mt-auto bg-aubergine-deep">
      <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8 xl:px-10">
        <BecanLogo height={48} onDark className="h-12 w-auto self-start" />
        <p className="max-w-measure text-sm text-ink-2">
          Becan is a voice tutor for university courses: it explains a chapter out loud, writes on a board as it
          goes, and asks questions to check you understood.
        </p>
      </div>
    </footer>
  );
}

/** `minimal` drops the navigation, for the sign-in and sign-up screens. */
export function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-page items-center justify-between gap-2 px-4 py-3 md:gap-3 md:px-8 md:py-4 xl:px-10">
        <Link href="/" className="inline-flex min-h-11 min-w-11 items-center">
          <BecanLogo height={64} priority className="h-13 w-auto md:h-16" />
        </Link>
        {minimal ? null : <SiteNav />}
      </div>
    </header>
  );
}

export function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`mx-auto w-full max-w-page px-4 md:px-8 xl:px-10 ${className}`}
    >
      {children}
    </section>
  );
}

/** The primary action: one amber button per screen. */
export function PrimaryButton({
  href,
  type,
  onClick,
  children,
  className = "",
  disabled = false,
}: {
  href?: string;
  type?: "submit" | "button";
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const cls = `group inline-flex h-14 items-center justify-center gap-3 rounded-pill bg-pressable px-8 text-lg font-semibold text-on-pressable transition-transform duration-200 hover:-translate-y-1 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none ${className}`;
  return href ? (
    <Link href={href} className={cls}>
      {children}
      <ArrowForward className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  ) : (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} className={cls}>
      {children}
      <ArrowForward className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
    </button>
  );
}

/** A quiet link with an arrow, for secondary actions. */
export function QuietLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex min-h-11 items-center gap-2 font-semibold text-ink ${className}`}
    >
      {children}
      <ArrowForward className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  );
}

/** An outlined secondary button. */
export function GhostButton({
  href,
  type,
  onClick,
  disabled = false,
  children,
  className = "",
}: {
  href?: string;
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const cls = `inline-flex h-14 items-center justify-center rounded-pill border border-aubergine-mid px-8 text-lg font-semibold text-aubergine-base disabled:cursor-not-allowed disabled:opacity-60 ${className}`;
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="text-sm font-semibold text-ink-2">{children}</span>
      {hint ? (
        <span className="mt-1 block text-xs text-ink-2">{hint}</span>
      ) : null}
    </label>
  );
}

const controlCls =
  "mt-2 h-14 w-full rounded-xl bg-surface px-4 text-ink shadow-soft placeholder:text-ink-2 border";

/* The border colour is chosen, not stacked: two border-colour classes have equal specificity,
   so Tailwind's output order would decide the winner, not the attribute order. */
const borderCls = (invalid?: boolean) =>
  invalid ? "border-error" : "border-aubergine-deep";

export function TextField({
  invalid,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  invalid?: boolean;
}) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`${controlCls} ${borderCls(invalid)} ${className}`}
    />
  );
}

/** An error message under a field: text, never colour alone. */
export function ErrorText({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mt-2 text-sm font-semibold text-error">
      {children}
    </p>
  );
}

/** A select with a custom chevron. */
export function SelectField({
  children,
  invalid,
  className = "",
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <select
        {...rest}
        aria-invalid={invalid || undefined}
        className={`${controlCls} ${borderCls(invalid)} appearance-none pe-14 ${className}`}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center pt-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-aubergine-tint text-aubergine-base">
          <Chevron />
        </span>
      </span>
    </div>
  );
}

/** A dark call-to-action band; `data-theme` switches the tokens to their dark values. */
export function CaptureBand({
  title,
  body,
  cta,
  href,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <section data-theme="dark" className="bg-aubergine-deep">
      <div className="mx-auto flex w-full max-w-page flex-col gap-7 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-8 xl:px-10">
        <div>
          <h2 className="font-display text-3xl leading-snug font-bold text-ink md:text-4xl">
            {title}
          </h2>
          <p className="mt-3 max-w-measure text-ink-2">{body}</p>
        </div>
        <PrimaryButton href={href} className="shrink-0">
          {cta}
        </PrimaryButton>
      </div>
    </section>
  );
}
