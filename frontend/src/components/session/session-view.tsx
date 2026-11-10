"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useSession,
} from "@livekit/components-react";
import {
  ConnectionState,
  createLocalAudioTrack,
  RoomEvent,
  Track,
  TokenSource,
} from "livekit-client";
import { createStudentQuestion, type StudentQuestionStatus } from "./student-question";
import {
  getServerTutorLanguage,
  getTutorLanguage,
  setTutorLanguage,
  subscribeTutorLanguage,
  type TutorLanguage,
} from "@/lib/session/tutor-language";
import { tokenSchema } from "@/lib/courses/schema";
import { AllowanceUsedUpError, tokenErrorOutcome } from "@/lib/session/token-error";
import { readSessionAllowance } from "@/lib/allowance/client";
import type { Allowance } from "@/lib/allowance/schema";
import { sessionEndingQuota } from "@/lib/session/ending";
import { QuotaBlock } from "@/components/ui/quota";
import { SessionShell as Shell } from "./session-start";
import { RemainingMinutes } from "./remaining-minutes";
import {
  INITIAL_SESSION_STATE,
  checkpointShown,
  parseAgentMessage,
  sessionReducer,
  type Lesson,
} from "@/lib/session/session-reducer";
import { CHAT_TOPIC, UI_CONTROL_TOPIC } from "@/lib/session/ui-control";
import { Board } from "./board/board";
import {
  ChatPanel,
  EndSessionDialog,
  LanguageChoice,
  CheckpointDialog,
  RotateNotice,
  SlidesMessage,
  Toolbar,
  TopBar,
  TopicsRail,
  TopicsSheet,
  TopicsTrack,
  type Phase,
  type TopicState,
} from "./parts";
import { useIsMobile } from "./use-is-mobile";
import { useReducedMotion } from "./use-reduced-motion";

/* The session screen: lessons column, board, slides. It is driven by the tutor agent, a
   separate service that joins the same room.

   The agent controls the page with `ui-control` messages (board, slide, lesson and topic,
   understanding check, ending), and the student talks to it with a spoken question or with
   text on `lk.chat`. All state lives in `sessionReducer`, and the phase shown is derived purely
   from the room connection and the agent's state. */

const SlidesPane = dynamic(() => import("./slides-pdf").then((m) => m.SlidesPane), {
  ssr: false,
  loading: () => <SlidesMessage text="Preparing slides…" />,
});

const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

type SessionViewProps = {
  courseName: string;
  courseId: string;
  chapterNo: number;
  chapterTitle: string;
  minutes: number;
  pdfUrl: string;
  lessons: Lesson[];
  minutesRemaining: number | null;
};

export function SessionView(props: SessionViewProps) {
  const { courseId, chapterNo: chapterNumber } = props;
  const stored = useSyncExternalStore(subscribeTutorLanguage, getTutorLanguage, getServerTutorLanguage);
  /* The pick holds even when storage is blocked, and once the session has started a change
     from another tab no longer affects it. */
  const [picked, setPicked] = useState<TutorLanguage | null>(null);
  const [locked, setLocked] = useState<TutorLanguage | null>(null);
  const language = locked ?? picked ?? stored;
  const chooseLanguage = (value: TutorLanguage) => {
    if (locked) return;
    setPicked(value);
    setTutorLanguage(value);
  };

  const tokenSource = useMemo(
    () =>
      TokenSource.custom(async () => {
        const res = await fetch("/api/v1/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* The backend requires `experience`; this app has a single teaching pace. */
          body: JSON.stringify({ courseId, chapterNumber, language, experience: "relaxed" }),
          cache: "no-store",
        });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          if (tokenErrorOutcome(res.status, body) === "used-up") throw new AllowanceUsedUpError();
          throw new Error(`Token request failed (${res.status})`);
        }
        const { serverUrl, token } = tokenSchema.parse(await res.json());
        return { serverUrl, participantToken: token };
      }),
    [courseId, chapterNumber, language],
  );

  const session = useSession(tokenSource);

  return (
    <SessionProvider session={session}>
      <SessionScreen
        {...props}
        session={session}
        language={language}
        onLanguage={chooseLanguage}
        onLockLanguage={() => setLocked(language)}
      />
    </SessionProvider>
  );
}

function SessionScreen({
  session,
  language,
  onLanguage,
  onLockLanguage,
  courseName,
  courseId,
  chapterNo,
  chapterTitle,
  minutes,
  pdfUrl,
  lessons,
  minutesRemaining,
}: SessionViewProps & {
  session: ReturnType<typeof useSession>;
  language: TutorLanguage;
  onLanguage: (l: TutorLanguage) => void;
  onLockLanguage: () => void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const agent = useAgent(session);
  const [state, dispatch] = useReducer(sessionReducer, INITIAL_SESSION_STATE);
  const [endingAllowance, setEndingAllowance] = useState<Allowance | null>(null);
  const allowanceRead = useRef<Promise<Allowance | null> | null>(null);
  const allowanceRequest = useRef<AbortController | null>(null);

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [userEnding, setUserEnding] = useState(false);
  const [micUnavailable, setMicUnavailable] = useState(false);
  /* `useSession().local.microphoneTrack` stays null while the microphone is muted, so it cannot
     tell us the track was published. Track the success of `publishTrack` ourselves. */
  const [micPublished, setMicPublished] = useState(false);
  const [studentQuestionStatus, setStudentQuestionStatus] = useState<StudentQuestionStatus>({
    busy: false,
    startedAt: null,
  });
  const [noSpeech, setNoSpeech] = useState(false);
  const voiceAnswerId = useRef<string | null>(null);
  const studentQuestion = useMemo(
    () => createStudentQuestion(
      session.room.localParticipant,
      setStudentQuestionStatus,
      () => setNoSpeech(true),
      // eslint-disable-next-line react-hooks/refs -- only called after the student question has closed.
      (outcome) => {
        const id = voiceAnswerId.current;
        voiceAnswerId.current = null;
        if (outcome === "cancelled" && id !== null) {
          dispatch({ action: "checkpoint_unhandled", id });
        }
      },
    ),
    [session.room],
  );

  useEffect(() => {
    if (!noSpeech) return;
    const timer = setTimeout(() => setNoSpeech(false), 3_000);
    return () => clearTimeout(timer);
  }, [noSpeech]);

  useEffect(() => {
    if (!session.isConnected || state.ending || userEnding || agent.state === "failed") {
      void studentQuestion.close("cancel_turn");
    } else {
      studentQuestion.observeAgentState(agent.state);
    }
  }, [
    agent.state, session.isConnected, state.ending, userEnding,
    studentQuestion, studentQuestionStatus.startedAt,
  ]);
  const [chat, setChat] = useState(false);
  const [showTopics, setShowTopics] = useState(true);
  const [showSlides, setShowSlides] = useState(true);
  /* null = automatic: the list opens by itself while the agent waits for a lesson choice. */
  const [topicsPref, setTopicsPref] = useState<boolean | null>(null);
  /* The end confirmation, opened from the toolbar button and from the top bar's close button. */
  const [confirmEnd, setConfirmEnd] = useState(false);

  /* A lesson requested before the agent was ready to listen. Sent the first time it listens. */
  const pendingLesson = useRef<string | null>(null);
  const finishing = useRef(false);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  const courseHref = `/courses/${courseId}`;

  /* ————— Agent messages ————— */
  useEffect(() => {
    const room = session.room;
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== UI_CONTROL_TOPIC) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      const message = parseAgentMessage(parsed);
      if (message?.action === "allowance_reached" && !allowanceRead.current) {
        const request = new AbortController();
        allowanceRequest.current = request;
        allowanceRead.current = readSessionAllowance(
          AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]),
        ).then((allowance) => {
          if (!request.signal.aborted) setEndingAllowance(allowance);
          return allowance;
        });
      }
      if (message) dispatch(message);
    };
    const onDisconnected = () => dispatch({ action: "board_reset" });
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      allowanceRequest.current?.abort();
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [session.room]);

  /* Leaving the page without an explicit exit must not leave the room open. */
  useEffect(
    () => () => {
      void studentQuestion.close("cancel_turn")
        .then(() => sessionRef.current.end())
        .catch(() => undefined);
    },
    [studentQuestion],
  );

  const sendText = useCallback(
    async (text: string) => {
      if (!session.isConnected) return false;
      try {
        await session.room.localParticipant.sendText(text, { topic: CHAT_TOPIC });
        return true;
      } catch (error) {
        console.error("Failed to send message:", error);
        return false;
      }
    },
    [session],
  );

  const start = async (lessonSlug: string | null = null) => {
    if (starting) return;
    onLockLanguage();
    allowanceRequest.current?.abort();
    allowanceRead.current = null;
    setEndingAllowance(null);
    dispatch({ action: "session_reset" });
    pendingLesson.current = lessonSlug;
    setFailed(false);
    setStarted(true);
    setStarting(true);
    try {
      setMicUnavailable(false);
      setMicPublished(false);
      setNoSpeech(false);
      // enabled:false skips capture in useSession. Acquire and mute BEFORE publishing.
      const microphone = await createLocalAudioTrack().catch((error) => {
        console.error("Microphone unavailable:", error);
        setMicUnavailable(true);
        return null;
      });
      try {
        if (microphone) await microphone.mute();
        // publishTrack waits for the signal connection; publish before start waits for the agent.
        await Promise.all([
          session.start({ tracks: { microphone: { enabled: false } } }),
          microphone
            ? session.room.localParticipant.publishTrack(microphone, {
                source: Track.Source.Microphone,
                stopMicTrackOnMute: false,
              }).then(() => setMicPublished(true), (error) => {
                microphone.stop();
                setMicUnavailable(true);
                console.error("Failed to publish muted microphone:", error);
              })
            : Promise.resolve(),
        ]);
      } catch (error) {
        microphone?.stop();
        throw error;
      }
    } catch (error) {
      if (error instanceof AllowanceUsedUpError) {
        /* The start was refused after the page had loaded. Re-read the usage and the renewal
           date from the server. */
        setStarted(false);
        router.refresh();
        return;
      }
      console.error("Failed to start session:", error);
      setFailed(true);
    } finally {
      setStarting(false);
    }
  };

  /* Leave for the course page, at the student's request or when a limit is reached. */
  const finish = useCallback(
    async (reason: "user" | "limit") => {
      if (finishing.current) return;
      finishing.current = true;
      await studentQuestion.close("cancel_turn");
      await sessionRef.current.end().catch(() => undefined);
      /* The read started with the agent's signal: wait for that one instead of starting a new
         timer or a second ending path. */
      if (reason === "limit") await allowanceRead.current;
      // `limit=1` makes the course page say the session ended on its time limit.
      router.push(reason === "limit" ? `${courseHref}?limit=1` : courseHref);
    },
    [router, courseHref, studentQuestion],
  );

  useEffect(() => {
    if (state.ending) void finish("limit");
  }, [state.ending, finish]);

  const agentListening = agent.state === "listening";

  useEffect(() => {
    if (!agentListening || !pendingLesson.current) return;
    const slug = pendingLesson.current;
    pendingLesson.current = null;
    void sendText(`please explain ${slug}`);
  }, [agentListening, sendText]);

  /* ————— The phase shown, purely derived ————— */
  const cs = session.connectionState;
  const ending = state.ending || userEnding;
  const endingQuota = sessionEndingQuota(state, endingAllowance);
  let phase: Phase;
  if (ending) phase = "ending";
  else if (
    failed ||
    agent.state === "failed" ||
    (started && !starting && cs === ConnectionState.Disconnected)
  )
    phase = "cut";
  else if (!started) phase = "idle";
  else if (starting || cs !== ConnectionState.Connected) phase = "connecting";
  else if (agent.state === "speaking") phase = "live";
  else if (agent.state === "thinking") phase = "thinking";
  else if (agentListening) {
    phase = checkpointShown(state, agent.state, studentQuestionStatus) ? "question" : "listening";
  } else phase = "connecting";

  /* ————— Lessons ————— */
  const titles = lessons.map((l) => l.name);
  const current = lessons.findIndex((l) => l.slug === state.lesson?.slug);
  const stateOf = (i: number): TopicState =>
    i === current ? "now" : state.completedLessons.includes(lessons[i]?.slug) ? "done" : "none";

  const autoTopics = phase === "listening" && !state.lesson && lessons.length > 0;
  const topicsOpen = topicsPref ?? autoTopics;

  const pickLesson = (i: number) => {
    const slug = lessons[i]?.slug;
    if (!slug) return;
    setTopicsPref(false);
    if (phase === "idle" || phase === "cut") {
      void start(slug);
    } else if (agentListening || agent.state === "speaking" || agent.state === "thinking") {
      void sendText(`please explain ${slug}`);
    } else {
      pendingLesson.current = slug;
    }
  };

  const onTopics = () =>
    isMobile ? setTopicsPref(!topicsOpen) : setShowTopics((v) => !v);

  const inRoom = session.isConnected;
  const canAsk = inRoom && agent.isConnected && !ending && !micUnavailable &&
    micPublished && !studentQuestionStatus.busy &&
    studentQuestionStatus.startedAt === null;
  const startStudentQuestion = useCallback(() => {
    if (!canAsk || finishing.current) return;
    setChat(false);
    setTopicsPref(false);
    setNoSpeech(false);
    void studentQuestion.start(agent.internal.agentParticipant!.identity, agent.state);
  }, [canAsk, studentQuestion, agent.internal.agentParticipant, agent.state]);

  useEffect(() => {
    if (isMobile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
        (target instanceof HTMLElement &&
          (target.closest("input, textarea, select") || target.isContentEditable)) ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (event.code === "Space") {
        if (studentQuestionStatus.startedAt !== null) {
          event.preventDefault();
          void studentQuestion.close("end_turn");
        } else if (canAsk) {
          event.preventDefault();
          startStudentQuestion();
        }
      } else if (event.key === "Escape" &&
        (studentQuestionStatus.startedAt !== null || studentQuestionStatus.busy)) {
        event.preventDefault();
        void studentQuestion.close("cancel_turn");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isMobile, canAsk, startStudentQuestion, studentQuestion,
    studentQuestionStatus.startedAt, studentQuestionStatus.busy,
  ]);

  const endNow = () => {
    setConfirmEnd(false);
    setUserEnding(true);
    void finish("user");
  };

  /* Before the start or after a cut there is no explanation to lose, so exit straight to the
     course. During a session the exit goes through the confirmation. */
  const onExit = () => {
    if (phase === "idle" || phase === "cut") {
      sessionRef.current.end().catch(() => undefined);
      router.push(courseHref);
      return;
    }
    if (phase === "ending") return;
    setConfirmEnd(true);
  };

  const detail =
    state.topic && state.topic.index > 0
      ? state.lesson?.totalTopics
        ? `Topic ${state.topic.index} of ${state.lesson.totalTopics}`
        : `Topic ${state.topic.index}`
      : undefined;

  /* ————— Connection cut —————
     Rejoining in place (calling `start` again) does not recover in practice; only a fresh page
     load does. So the button reloads and the student is back on the start screen. */
  if (phase === "cut") {
    const lastLesson = lessons.find((l) => l.slug === state.lesson?.slug);
    return (
      <Shell reduce={reduce}>
        <TopBar phase="cut" courseName={courseName} chapterNo={chapterNo} onExit={onExit} />
        <div className="mx-auto flex w-full max-w-measure flex-1 flex-col justify-center px-5 py-10">
          <h1 className="text-3xl font-bold text-ink">Connection lost</h1>
          <p className="mt-4 leading-base text-ink-2">
            {lastLesson ? (
              <>
                You were in: <span className="font-semibold text-ink">{lastLesson.name}</span>
                {detail ? ` · ${detail}` : null}
              </>
            ) : (
              "We couldn’t connect to the explanation. Check your connection and try again."
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-12 items-center justify-center rounded-pill bg-pressable px-6 font-semibold text-on-pressable"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex h-12 items-center justify-center rounded-pill border border-line px-6 font-semibold text-ink"
            >
              Back to course
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  const intro = (
    <>
      <p className="text-sm text-ink-2">Chapter {chapterNo}</p>
      <h1 className="mt-2 text-3xl font-bold text-ink md:text-4xl">{chapterTitle}</h1>
      {phase === "idle" ? (
        <>
          <p className="mt-4 text-ink-2">
            {lessons.length > 0
              ? `${lessons.length} ${plural(lessons.length, "lesson", "lessons")} · `
              : null}
            ~{minutes} {plural(minutes, "minute", "minutes")}
          </p>
          {minutesRemaining !== null ? <RemainingMinutes count={minutesRemaining} /> : null}
          <LanguageChoice value={language} onChange={onLanguage} />
          {lessons.length > 0 ? (
            <p className="mt-6 text-sm text-ink-2">Or choose a lesson from the track to start there.</p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-ink-2">
          {phase === "connecting"
            ? "Preparing the explanation…"
            : "The board is written as the explanation unfolds."}
        </p>
      )}
    </>
  );

  return (
    <Shell reduce={reduce}>
      <TopBar
        phase={phase}
        courseName={courseName}
        chapterNo={chapterNo}
        detail={detail}
        onExit={onExit}
      />

      {/* The lessons track on mobile, in place of the side column. */}
      <TopicsTrack
        topics={titles}
        stateOf={stateOf}
        current={current}
        onPick={pickLesson}
        open={topicsOpen}
        onToggle={() => setTopicsPref(!topicsOpen)}
      />

      {phase === "idle" ? (
        <RotateNotice open={!rotateDismissed} onDismiss={() => setRotateDismissed(true)} />
      ) : null}

      <div className="relative flex flex-1 flex-col gap-2 overflow-hidden p-2 md:flex-row md:p-3">
        {showTopics ? (
          <TopicsRail
            topics={titles}
            stateOf={stateOf}
            current={current}
            onPick={pickLesson}
            open={!isMobile && topicsOpen}
            onToggle={() => setTopicsPref(!topicsOpen)}
          />
        ) : null}

        {/* The board takes 60% and the toolbar floats over it: 3 parts of 5 of the height on
            mobile, and of the row's width (after the narrow column) on desktop, never below
            20rem. */}
        <main className="relative flex min-w-0 flex-[3] flex-col md:min-w-[20rem]">
          {endingQuota ? (
            <div
              role="status"
              className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-5 md:p-8"
            >
              <QuotaBlock {...endingQuota} surface="session" />
            </div>
          ) : <Board
            board={state.board}
            speaking={phase === "live"}
            intro={intro}
            reduce={reduce}
            language={language}
          />}

          {!endingQuota && chat && inRoom ? (
            <ChatPanel
              onSend={sendText}
              onClose={() => setChat(false)}
            />
          ) : null}

          {!endingQuota ? <Toolbar
            phase={phase}
            hint={phase === "idle"}
            canAsk={canAsk}
            micUnavailable={micUnavailable}
            studentQuestionStartedAt={studentQuestionStatus.startedAt}
            microphoneTrack={session.local.microphoneTrack}
            noSpeech={noSpeech}
            reduce={reduce}
            onAsk={startStudentQuestion}
            onSendStudentQuestion={() => void studentQuestion.close("end_turn")}
            onCancelStudentQuestion={() => void studentQuestion.close("cancel_turn")}
            onSpeech={studentQuestion.speechDetected}
            chat={chat && inRoom}
            slides={showSlides}
            topics={isMobile ? topicsOpen : showTopics}
            onPrimary={() => void start(null)}
            onChat={() => setChat((c) => !c)}
            onSlides={() => setShowSlides((v) => !v)}
            onTopics={onTopics}
            onEnd={() => setConfirmEnd(true)}
          /> : null}
        </main>

        {/* The slides take the other 40% and fill their column. Never below 19rem, so a card
            stays readable at 768px. */}
        {showSlides ? (
          <aside className="flex min-h-0 w-full flex-[2] flex-col md:min-w-[19rem] md:basis-0">
            <SlidesPane url={pdfUrl} agentPage={state.page} />
          </aside>
        ) : null}
      </div>

      <TopicsSheet
        open={isMobile && topicsOpen}
        onClose={() => setTopicsPref(false)}
        topics={titles}
        stateOf={stateOf}
        current={current}
        onPick={pickLesson}
      />

      <CheckpointDialog
        checkpoint={state.checkpoint}
        open={phase === "question"}
        onChoose={(choice) => {
          if (!state.checkpoint) return;
          dispatch({ action: "checkpoint_handled", id: state.checkpoint.id });
          void sendText(choice);
        }}
        canAnswerByVoice={canAsk}
        micUnavailable={micUnavailable}
        onAnswerByVoice={() => {
          if (!state.checkpoint || !canAsk || finishing.current) return;
          const id = state.checkpoint.id;
          dispatch({ action: "checkpoint_handled", id });
          voiceAnswerId.current = id;
          startStudentQuestion();
        }}
        onDismiss={() => {
          if (state.checkpoint) dispatch({ action: "checkpoint_handled", id: state.checkpoint.id });
        }}
      />

      <EndSessionDialog
        open={confirmEnd && phase !== "ending"}
        onConfirm={endNow}
        onCancel={() => setConfirmEnd(false)}
      />

      <RoomAudioRenderer />
    </Shell>
  );
}
