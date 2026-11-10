import {
  INITIAL_BOARD_STATE,
  parseBoardControlEvent,
  teachingBoardReducer,
  type BoardAction,
  type BoardState,
} from "./teaching-board";
import { parseUIControlEvent, type UIControlEvent } from "./ui-control";

/* All session state lives in one reducer: everything the tutor agent writes goes through here.
   Actions come from the data-channel listener or from a student's press, never from effects
   that set state. */

/** A lesson from the chapter's `lessons_list.json` in content storage. */
export type Lesson = { name: string; brief: string; slug: string };

export type Checkpoint = { id: string; question: string; choices: string[] };

export type SessionState = {
  board: BoardState;
  /** The last slide the agent asked for (1-based), or null before it asks. */
  page: number | null;
  lesson: { slug: string; totalTopics: number } | null;
  topic: { name: string; index: number } | null;
  /** Lessons the agent has moved on from. */
  completedLessons: string[];
  checkpoint: Checkpoint | null;
  handledCheckpointId: string | null;
  /** The agent announced that the time limit was reached. */
  ending: boolean;
  /** The student's usage limits, not the session's time limit, caused the ending. */
  allowanceReached: boolean;
  /** A diagnostic reason from the agent. It is not written for students, so it is never shown. */
  endingMessage: string | null;
};

export const INITIAL_SESSION_STATE: SessionState = {
  board: INITIAL_BOARD_STATE,
  page: null,
  lesson: null,
  topic: null,
  completedLessons: [],
  checkpoint: null,
  handledCheckpointId: null,
  ending: false,
  allowanceReached: false,
  endingMessage: null,
};

export type AgentMessage = BoardAction | UIControlEvent;

export type SessionAction =
  | AgentMessage
  | { action: "checkpoint_handled"; id: string }
  | { action: "checkpoint_unhandled"; id: string }
  | { action: "session_reset" };

export function parseAgentMessage(value: unknown): AgentMessage | null {
  return parseBoardControlEvent(value) ?? parseUIControlEvent(value);
}

/** An open check the student has not dealt with yet, while the agent is ready to listen. */
export function checkpointShown(
  state: SessionState,
  agentState: string,
  studentQuestionStatus: { busy: boolean; startedAt: number | null },
): boolean {
  return state.checkpoint !== null &&
    agentState === "listening" &&
    studentQuestionStatus.busy === false &&
    studentQuestionStatus.startedAt === null &&
    state.checkpoint.id !== state.handledCheckpointId;
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.action) {
    /* Restarting after a cut keeps the lessons the student has completed. */
    case "session_reset":
      return { ...INITIAL_SESSION_STATE, completedLessons: state.completedLessons };

    case "checkpoint_handled":
      return { ...state, handledCheckpointId: action.id };

    case "checkpoint_unhandled":
      return state.handledCheckpointId === action.id
        ? { ...state, handledCheckpointId: null }
        : state;

    case "set_checkpoint":
      return { ...state, checkpoint: action.checkpoint };

    case "scroll":
      return state.page === action.page ? state : { ...state, page: action.page };

    case "set_lesson": {
      const next = { slug: action.lesson, totalTopics: action.totalTopics };
      const prev = state.lesson?.slug;
      if (prev === action.lesson) return { ...state, lesson: next };
      return {
        ...state,
        lesson: next,
        topic: null,
        completedLessons:
          prev && !state.completedLessons.includes(prev)
            ? [...state.completedLessons, prev]
            : state.completedLessons,
      };
    }

    case "set_topic":
      return {
        ...state,
        topic: action.topic ? { name: action.topic, index: action.index } : state.topic,
      };

    case "topic_done":
      return { ...state, topic: null };

    case "allowance_reached":
      return { ...state, allowanceReached: true };

    case "session_ending":
      return { ...state, ending: true, endingMessage: action.message };

    default: {
      const board = teachingBoardReducer(state.board, action);
      return board === state.board ? state : { ...state, board };
    }
  }
}
