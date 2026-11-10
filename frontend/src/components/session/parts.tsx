"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { useAudioWaveform, useTrackVolume, type useSession } from "@livekit/components-react";
import {
  ChatIcon,
  CheckIcon,
  Chevron,
  CloseIcon,
  ListIcon,
  MicIcon,
  PlayIcon,
  RotateIcon,
  SlidesIcon,
  LeaveIcon,
  Waveform,
} from "@/components/ui/icons";
import { BecanGlyph } from "@/components/ui/becan-face";
import type { Checkpoint } from "@/lib/session/session-reducer";
import type { TutorLanguage } from "@/lib/session/tutor-language";

/* The parts of the session screen. State comes from the tutor agent, and the student's voice
   is confined to a student question. */

export type Phase =
  | "idle"
  | "connecting"
  | "live"
  | "thinking"
  | "listening"
  | "question"
  | "ending"
  | "cut";

export type TopicState = "none" | "now" | "done";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  connecting: "Preparing the session",
  live: "Explaining now",
  thinking: "Thinking",
  listening: "Listening to you",
  question: "Question",
  ending: "Session ended",
  cut: "Connection lost",
};

const LESSON_STATE_LABEL: Record<TopicState, string> = {
  none: "Not started",
  now: "Explaining now",
  done: "Done",
};

const MIC_UNAVAILABLE = "The microphone is unavailable or permission was denied — you can type in chat.";
const ASK_SHORTCUT = "Ask: Space · Send: Space again · Cancel: Escape";

/* ————— A dialog inside the session surface —————
   Radix renders the dialog in a portal outside the session shell, where it would lose the
   `data-theme` and `data-surface` attributes and read the light site colours. This wrapper
   restores them, and sets `text-ink` because text inherits the body colour. Radix also gives
   us the focus trap and Escape to close. */

function SessionDialog({
  open,
  onOpenChange,
  title,
  overlayClassName,
  contentClassName,
  onOpenAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  overlayClassName: string;
  contentClassName: string;
  /** Send the initial focus to a specific button instead of the dialog's first element. */
  onOpenAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div data-theme="dark" data-surface="session" className="text-ink">
          <Dialog.Overlay className={overlayClassName} />
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={onOpenAutoFocus}
            className={contentClassName}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ————— Top bar ————— */

export function TopBar({
  phase,
  courseName,
  chapterNo,
  detail,
  onExit,
}: {
  phase: Phase;
  courseName: string;
  chapterNo: number;
  /** "Topic 2 of 5", from the agent's `set_topic` message. */
  detail?: string;
  onExit: () => void;
}) {
  const live = phase === "live";
  /* During a question the pulse stops and the label reads "Question". */
  const pulse = phase === "listening" || phase === "thinking";

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 px-3 py-1 md:px-4">
      <p
        role="status"
        className={`flex items-center gap-2 text-xs font-semibold ${
          live ? "text-success" : "text-ink"
        }`}
      >
        {/* One indicator per state: a waveform while explaining, a pulse while listening. */}
        {live ? <Waveform className="h-3 text-success" /> : null}
        {pulse ? (
          <span
            aria-hidden="true"
            className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center"
          >
            <span className="absolute inline-block h-2 w-2 rounded-pill bg-ink animate-speak" />
            <span className="relative inline-block h-2 w-2 rounded-pill bg-ink" />
          </span>
        ) : null}
        {PHASE_LABEL[phase]}
      </p>

      <p className="min-w-0 truncate text-xs text-ink-2">
        {courseName} · Chapter {chapterNo}
        {detail ? ` · ${detail}` : null}
      </p>

      {/* A 44px touch target on mobile, smaller on desktop where the input is a mouse. */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit session"
        title="Exit session"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-2 hover:bg-panel pointer-fine:md:h-8 pointer-fine:md:w-8"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </header>
  );
}

/* ————— Lessons list ————— */

/** A lesson's numbered dot: the colour carries its state and the text its number. */
function TopicPip({
  n,
  state,
  active,
}: {
  n: number;
  state: TopicState;
  active: boolean;
}) {
  const skin =
    state === "done"
      ? "border-transparent bg-success text-ground"
      : state === "now"
        ? "border-transparent bg-ink text-ground"
        : "border-ink-3 text-ink-2";

  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
      {state === "now" ? (
        <span
          aria-hidden="true"
          className="absolute h-5 w-5 rounded-pill bg-success animate-speak"
        />
      ) : null}
      <span
        className={`relative flex h-5 w-5 items-center justify-center rounded-pill border text-[10px] font-bold transition-colors ${skin} ${
          active ? "ring-1 ring-ink ring-offset-1 ring-offset-panel" : ""
        }`}
      >
        {/* A finished lesson gets a check mark, not colour alone. */}
        {state === "done" ? <CheckIcon className="h-3 w-3" /> : n}
      </span>
    </span>
  );
}

type TopicsProps = {
  topics: string[];
  stateOf: (i: number) => TopicState;
  current: number;
  onPick: (i: number) => void;
};

/** The full list, used in the desktop dropdown and in the mobile sheet. */
function TopicsList({ topics, stateOf, current, onPick }: TopicsProps) {
  if (topics.length === 0) {
    return (
      <p className="p-4 text-sm leading-base text-ink-2">
        The lesson list hasn’t arrived. You can start the explanation from the first lesson.
      </p>
    );
  }

  return (
    <ol className="no-scrollbar h-full overflow-y-auto p-1.5">
      {topics.map((topic, i) => {
        const st = stateOf(i);
        const active = i === current;
        return (
          <li key={`${i}-${topic}`}>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={active ? "step" : undefined}
              className={`relative flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start transition-colors ${
                active
                  ? "bg-surface text-ink"
                  : "text-ink-2 hover:bg-surface/60 hover:text-ink"
              }`}
            >
              <TopicPip n={i + 1} state={st} active={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{topic}</span>
                <span className="block text-xs text-ink-2">{LESSON_STATE_LABEL[st]}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ————— Lessons track on mobile —————
   The same dots as on desktop, joined by lines, but laid out horizontally under the top bar. */

export function TopicsTrack({
  topics,
  stateOf,
  current,
  onPick,
  open,
  onToggle,
}: TopicsProps & { open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const toggleLabel = open ? "Close lesson list" : "Open lesson list";

  useEffect(() => {
    const el = ref.current?.querySelector('[data-current="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);

  return (
    <div className="flex shrink-0 items-center gap-1 px-2 md:hidden">
      {/* The toggle sits at the start of the row, outside the scrolling part, so it stays put. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-2 transition-colors hover:bg-surface hover:text-ink"
      >
        <Chevron
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        ref={ref}
        className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto"
      >
        {topics.map((topic, i) => (
          <div key={`${i}-${topic}`} className="flex shrink-0 items-center">
            <button
              type="button"
              data-current={i === current ? "true" : undefined}
              onClick={() => onPick(i)}
              aria-current={i === current ? "step" : undefined}
              aria-label={`${i + 1}. ${topic} — ${LESSON_STATE_LABEL[stateOf(i)]}`}
              title={`${i + 1}. ${topic}`}
              className="flex h-11 w-11 items-center justify-center"
            >
              <TopicPip n={i + 1} state={stateOf(i)} active={i === current} />
            </button>

            {i < topics.length - 1 ? (
              <span
                aria-hidden="true"
                className={`h-px w-3 shrink-0 ${stateOf(i) === "done" ? "bg-success" : "bg-line"}`}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ————— Lessons column on desktop ————— */

export function TopicsRail({
  topics,
  stateOf,
  current,
  onPick,
  open,
  onToggle,
}: TopicsProps & { open: boolean; onToggle: () => void }) {
  const done = topics.filter((_, i) => stateOf(i) === "done").length;
  const toggleLabel = open ? "Close lesson list" : "Open lesson list";

  return (
    <div className="relative hidden shrink-0 flex-col md:flex">
      <section className="flex min-h-0 w-16 flex-1 flex-col items-center overflow-hidden rounded-xl border border-line bg-panel py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={toggleLabel}
          title={toggleLabel}
          /* 44px for touch (tablets above `md` are touch too), 32px when the pointer is a mouse. */
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-2 transition-colors hover:bg-surface hover:text-ink pointer-fine:h-8 pointer-fine:w-8"
        >
          {/* The list floats towards the end of the row: closed, the chevron points at it;
              open, it points back at the column. */}
          <Chevron
            className={`h-4 w-4 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
          />
        </button>

        <p className="mt-1 shrink-0 text-[10px] font-semibold text-ink-2">Lessons</p>
        <p className="shrink-0 text-[10px] text-ink-2">
          {done}/{topics.length}
        </p>

        <ol className="no-scrollbar mt-2 flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
          {topics.map((topic, i) => (
            <li key={`${i}-${topic}`} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === current ? "step" : undefined}
                aria-label={`${i + 1}. ${topic} — ${LESSON_STATE_LABEL[stateOf(i)]}`}
                title={`${i + 1}. ${topic}`}
                className="flex h-6 w-6 items-center justify-center"
              >
                <TopicPip n={i + 1} state={stateOf(i)} active={i === current} />
              </button>

              {i < topics.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-px shrink-0 ${stateOf(i) === "done" ? "bg-success" : "bg-line"}`}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {/* The dropdown floats over the board and does not widen the column. */}
      {open ? (
        <div className="absolute inset-y-0 start-[calc(100%+0.5rem)] z-30 w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-lift">
          <TopicsList
            topics={topics}
            stateOf={stateOf}
            current={current}
            onPick={onPick}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The lessons sheet on mobile, within thumb reach. */
export function TopicsSheet({
  open,
  onClose,
  ...list
}: TopicsProps & { open: boolean; onClose: () => void }) {
  return (
    <SessionDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Lessons"
      overlayClassName="fixed inset-0 z-40 bg-ground/80 backdrop-blur-sm md:hidden"
      contentClassName="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-xl border border-line bg-panel shadow-lift md:hidden"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-1">
        <p className="text-sm font-semibold text-ink">Lessons</p>
        <Dialog.Close
          aria-label="Close lessons"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-2 transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </Dialog.Close>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <TopicsList {...list} />
      </div>
    </SessionDialog>
  );
}

/* ————— Rotate-your-screen notice —————
   Shown once before the start and only in portrait: `portrait:` hides it the moment the phone
   is turned, with no JavaScript and no event listener. */

export function RotateNotice({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 hidden items-center justify-center p-6 portrait:flex md:portrait:hidden">
      {/* The backdrop is out of the tab order: "Okay" does the same dismissal. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onDismiss}
        className="absolute inset-0 bg-ground/85 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rotate your screen"
        className="relative w-full max-w-xs rounded-xl border border-line bg-surface-3 p-6 text-center shadow-lift"
      >
        <RotateIcon spinning className="mx-auto h-12 w-12 text-ink-2" />
        <p className="mt-4 text-xl font-bold text-ink">Rotate your screen</p>
        <p className="mx-auto mt-2 max-w-[22ch] text-sm leading-base text-ink-2">
          For the best experience
        </p>
        {/* Inverted, not amber: the only amber control on the screen is the start button. */}
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-pill bg-ink px-5 text-sm font-bold text-ground"
        >
          Okay
        </button>
      </div>
    </div>
  );
}

export function Caret() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-5 w-[3px] bg-ink-2 align-middle animate-caret"
    />
  );
}

const TUTOR_LANGUAGES: TutorLanguage[] = ["Arabic", "English"];

/** The tutor's language. Only offered before the start, because it is sent with the token request. */
export function LanguageChoice({
  value,
  onChange,
}: {
  value: TutorLanguage;
  onChange: (v: TutorLanguage) => void;
}) {
  const labelId = useId();

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <p id={labelId} className="text-sm text-ink-2">
        Explanation language
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex items-center gap-0.5 rounded-pill bg-surface p-0.5"
      >
        {TUTOR_LANGUAGES.map((language) => {
          const on = value === language;
          return (
            <button
              key={language}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(language)}
              className={`inline-flex h-11 items-center rounded-pill px-4 text-sm font-semibold transition-colors md:h-8 ${
                on ? "bg-ink text-ground" : "text-ink-2 hover:text-ink"
              }`}
            >
              {language}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ————— Chat —————
   The student's text is sent to the tutor agent on `lk.chat`. */

export function ChatPanel({
  onSend,
  onClose,
}: {
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    const ok = await onSend(message);
    setSending(false);
    if (ok) {
      setText("");
      onClose();
    }
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="absolute inset-x-2 bottom-[4.25rem] z-20 rounded-xl border border-line bg-surface-2 p-4 animate-board-in"
    >
      <label htmlFor="ask" className="text-sm text-ink-2">
        Type your question
      </label>
      <div className="mt-2 flex gap-2">
        {/* Focus through a callback ref at mount: no timer and no animation frame.
            `dir="auto"` because the student may write in the tutor's language. */}
        <input
          id="ask"
          ref={(el) => el?.focus()}
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-ground px-4 text-ink placeholder:text-ink-2"
          placeholder="What’s unclear?"
        />
        <button
          type="submit"
          aria-disabled={sending || !text.trim() ? true : undefined}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-pill border border-line px-5 text-sm font-semibold text-ink"
        >
          Send
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          title="Close chat"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill text-ink-2 transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

/* ————— Toolbar ————— */

function IconBtn({
  label,
  text,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  /** A visible word next to the icon; without it the button is the icon alone. */
  text?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const skin = disabled
    ? "bg-surface text-ink-2 opacity-45"
    : active
      ? "bg-ink text-ground"
      : "bg-surface text-ink-2 hover:text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={`group/btn flex h-11 shrink-0 items-center justify-center rounded-pill pointer-fine:md:h-8 ${text ? "focus-visible:outline-none" : "w-11 pointer-fine:md:w-8"}`}
    >
      <span
        className={`inline-flex h-[34px] items-center justify-center rounded-pill transition-colors md:h-8 [&_svg]:h-[18px] [&_svg]:w-[18px] md:[&_svg]:h-4 md:[&_svg]:w-4 ${text ? "gap-1 px-2.5 text-sm font-semibold group-focus-visible/btn:outline-2 group-focus-visible/btn:outline-offset-2 group-focus-visible/btn:outline-ring" : "w-[34px] md:w-8"} ${skin}`}
      >
        {children}
        {text}
      </span>
    </button>
  );
}

/** The bubble above the start button. Inverted, not amber. */
function StartHint() {
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-full z-20 flex justify-center pb-2">
      <span className="flex flex-col items-center animate-nudge">
        <span className="whitespace-nowrap rounded-pill bg-ink px-3 py-1.5 text-xs font-bold text-ground shadow-lift">
          Press here to start the explanation
        </span>
        <span
          aria-hidden="true"
          className="-mt-1 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-ink"
        />
      </span>
    </span>
  );
}

type MicrophoneTrack = ReturnType<typeof useSession>["local"]["microphoneTrack"];

export function Toolbar({
  phase,
  canAsk,
  micUnavailable,
  studentQuestionStartedAt,
  microphoneTrack,
  noSpeech,
  reduce,
  chat,
  slides,
  topics,
  hint,
  onPrimary,
  onAsk,
  onSendStudentQuestion,
  onCancelStudentQuestion,
  onSpeech,
  onChat,
  onSlides,
  onTopics,
  onEnd,
}: {
  phase: Phase;
  canAsk: boolean;
  micUnavailable: boolean;
  studentQuestionStartedAt: number | null;
  microphoneTrack: MicrophoneTrack;
  noSpeech: boolean;
  reduce: boolean;
  chat: boolean;
  slides: boolean;
  topics: boolean;
  hint?: boolean;
  onPrimary: () => void;
  onAsk: () => void;
  onSendStudentQuestion: () => void;
  onCancelStudentQuestion: () => void;
  onSpeech: () => void;
  onChat: () => void;
  onSlides: () => void;
  onTopics: () => void;
  onEnd: () => void;
}) {
  const canStart = phase === "idle" || phase === "cut";
  const inSession = !canStart && phase !== "ending";
  const recording = studentQuestionStartedAt !== null;
  const askRef = useRef<HTMLButtonElement>(null);
  const wasRecording = useRef(false);
  useEffect(() => {
    if (
      wasRecording.current &&
      !recording &&
      !document.querySelector('[role="dialog"]')
    ) {
      askRef.current?.focus();
    }
    wasRecording.current = recording;
  }, [recording]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-2 px-3">
      <div role="status" className="text-sm text-ink-2">
        {noSpeech ? "We didn't hear anything" : null}
      </div>
      <motion.div
        layout={reduce ? false : true}
        transition={{ layout: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
        className={`pointer-events-auto relative max-w-full rounded-pill border border-line bg-panel px-1 py-0.5 shadow-lift md:px-1.5 md:py-1 ${recording ? "w-[22rem]" : "w-fit"}`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {recording ? (
            <motion.div
              key="recorder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <StudentQuestionRecorder
                startedAt={studentQuestionStartedAt}
                microphoneTrack={microphoneTrack}
                reduce={reduce}
                onSend={onSendStudentQuestion}
                onCancel={onCancelStudentQuestion}
                onSpeech={onSpeech}
              />
            </motion.div>
          ) : (
            <motion.div
              key="toolbar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-1"
            >
              <div className="flex items-center justify-start gap-1">
                <button
                  ref={askRef}
                  type="button"
                  disabled={!canAsk}
                  onClick={onAsk}
                  title={micUnavailable ? MIC_UNAVAILABLE : ASK_SHORTCUT}
                  className="group/ask flex h-11 shrink-0 items-center justify-center rounded-pill focus-visible:outline-none pointer-fine:md:h-8"
                >
                  <span
                    className={`inline-flex h-[34px] items-center justify-center gap-1 rounded-pill px-2.5 text-sm font-semibold transition-[transform,background-color] group-focus-visible/ask:outline-2 group-focus-visible/ask:outline-offset-2 group-focus-visible/ask:outline-ring group-disabled/ask:opacity-45 motion-safe:group-enabled/ask:group-active/ask:scale-95 md:h-8 [&_svg]:h-[18px] [&_svg]:w-[18px] md:[&_svg]:h-4 md:[&_svg]:w-4 ${canStart ? "border border-line text-ink-2" : "bg-pressable text-on-pressable group-enabled/ask:group-hover/ask:bg-pressable/90"}`}
                  >
                    <MicIcon />
                    Ask
                  </span>
                </button>
                <IconBtn label="Chat" text="Chat" onClick={onChat} active={chat}>
                  <ChatIcon />
                </IconBtn>
              </div>

              <span className="group/primary relative flex shrink-0">
                {hint ? <StartHint /> : null}
                {canStart ? (
                  <button
                    type="button"
                    onClick={onPrimary}
                    aria-label="Start explanation"
                    title="Start explanation"
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-pressable text-on-pressable transition-transform duration-200 motion-safe:hover:scale-110 motion-safe:active:scale-95"
                  >
                    <BecanGlyph className="h-6 w-8 transition-opacity group-hover/primary:opacity-0 group-focus-within/primary:opacity-0" />
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/primary:opacity-100 group-focus-within/primary:opacity-100">
                      <PlayIcon className="h-5 w-5 md:h-4 md:w-4" />
                    </span>
                  </button>
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-2"
                  >
                    <BecanGlyph
                      speaking={phase === "live"}
                      className="h-6 w-8"
                    />
                  </span>
                )}
              </span>

              <div className="flex items-center justify-end gap-1">
                <IconBtn label="Slides" onClick={onSlides} active={slides}>
                  <SlidesIcon />
                </IconBtn>
                <IconBtn label="Lessons" onClick={onTopics} active={topics}>
                  <ListIcon />
                </IconBtn>
                <IconBtn label="End session" onClick={onEnd} disabled={!inSession}>
                  <LeaveIcon />
                </IconBtn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** Audio subscriptions and clock stay here so they never re-render the teaching board. */
function StudentQuestionRecorder({
  startedAt,
  microphoneTrack,
  reduce,
  onSend,
  onCancel,
  onSpeech,
}: {
  startedAt: number;
  microphoneTrack: MicrophoneTrack;
  reduce: boolean;
  onSend: () => void;
  onCancel: () => void;
  onSpeech: () => void;
}) {
  const { bars } = useAudioWaveform(reduce ? undefined : (microphoneTrack ?? undefined), {
    barCount: 24,
    updateInterval: 50,
  });
  const volume = useTrackVolume(microphoneTrack ?? undefined);
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startedAt) / 1000),
  );
  const sendRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    sendRef.current?.focus();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      250,
    );
    return () => clearInterval(timer);
  }, [startedAt]);
  useEffect(() => {
    if (volume > 0.02) onSpeech();
  }, [volume, onSpeech]);

  return (
    <div className="flex h-11 items-center gap-3">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        title="Cancel"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-line text-ink-2 transition-colors hover:border-ink-2 hover:text-ink"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
      <span
        aria-hidden="true"
        className="flex h-8 min-w-0 flex-1 items-center justify-center gap-0.5 text-ink"
      >
        {reduce ? (
          <span className="h-[3px] w-full rounded-pill bg-ink-2" />
        ) : (
          bars.map((bar, index) => (
            <span
              key={index}
              className="w-[3px] shrink-0 rounded-pill bg-current"
              style={{ height: `${4 + Math.min(1, Math.max(0, bar)) * 28}px` }}
            />
          ))
        )}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-ink-2">
        {`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
      </span>
      <button
        ref={sendRef}
        type="button"
        onClick={onSend}
        title={ASK_SHORTCUT}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-pill bg-pressable px-4 text-sm font-semibold text-on-pressable transition-colors hover:bg-pressable/90"
      >
        Send
      </button>
    </div>
  );
}

/* ————— Understanding check —————
   A choice is sent to the tutor agent as text and the agent corrects it by voice, so nothing
   is coloured right or wrong here. The question and choices are written by the agent in the
   tutor's language, hence `dir="auto"`. */

export function CheckpointDialog({
  checkpoint,
  open,
  onChoose,
  onDismiss,
  canAnswerByVoice,
  micUnavailable,
  onAnswerByVoice,
}: {
  checkpoint: Checkpoint | null;
  open: boolean;
  onChoose: (choice: string) => void;
  onDismiss: () => void;
  canAnswerByVoice: boolean;
  micUnavailable: boolean;
  onAnswerByVoice: () => void;
}) {
  return (
    <SessionDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onDismiss();
      }}
      title="Understanding check"
      overlayClassName="fixed inset-0 z-40 bg-ground/80 backdrop-blur-sm"
      contentClassName="fixed inset-x-4 bottom-4 z-50 mx-auto max-h-[80dvh] max-w-measure overflow-y-auto rounded-xl border-2 border-ink-3 bg-surface-3 p-5 shadow-lift animate-board-in md:inset-x-0 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:p-6"
    >
      <p className="text-xs font-semibold text-ink-2">Question</p>
      <p dir="auto" className="mt-2 text-xl font-bold text-ink">
        {checkpoint?.question}
      </p>
      {checkpoint && checkpoint.choices.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {checkpoint.choices.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => onChoose(c)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-line bg-ground px-4 text-start text-ink transition-colors hover:border-ink-2"
              >
                <span dir="auto">{c}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 leading-base text-ink-2">
          Press “Answer by voice”, or type your answer in chat.
        </p>
      )}
      <button
        type="button"
        disabled={!canAnswerByVoice}
        onClick={onAnswerByVoice}
        title={micUnavailable ? MIC_UNAVAILABLE : "Answer by voice"}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-ink-2 px-4 font-semibold text-ink transition-colors enabled:hover:bg-ground disabled:opacity-45"
      >
        <MicIcon className="h-4 w-4" />
        Answer by voice
      </button>
    </SessionDialog>
  );
}

/* ————— End-session confirmation —————
   A stray press on the toolbar must not end a live spoken explanation. Initial focus goes to
   "Continue" so Enter cannot end it by accident, and Escape cancels. */

export function EndSessionDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);

  return (
    <SessionDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      title="End the session?"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        stayRef.current?.focus();
      }}
      overlayClassName="fixed inset-0 z-40 bg-ground/80 backdrop-blur-sm"
      contentClassName="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border-2 border-ink-3 bg-surface-3 p-5 shadow-lift animate-board-in md:inset-x-0 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:p-6"
    >
      <p className="text-xl font-bold text-ink">End the session?</p>
      <p className="mt-2 leading-base text-ink-2">You can return to the same chapter later.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          ref={stayRef}
          type="button"
          onClick={onCancel}
          className="inline-flex h-12 items-center justify-center rounded-pill border border-ink-2 px-6 font-semibold text-ink"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex h-12 items-center justify-center rounded-pill border border-line px-6 font-semibold text-ink"
        >
          End session
        </button>
      </div>
    </SessionDialog>
  );
}

/** The slides pane's state before the viewer loads or when it fails. */
export function SlidesMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-line bg-panel p-4 text-center text-sm text-ink-2">
      {text}
    </div>
  );
}
