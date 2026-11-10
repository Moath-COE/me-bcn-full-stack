/* Messages from the tutor agent to the page: a contract with a separate service.

   The agent publishes JSON on the `ui-control` data topic, and the student writes to it on
   `lk.chat`. The agent reads and writes these action and field names as they are, so they
   cannot be renamed on one side only. The `board_*` messages are in `teaching-board.ts`. */

export const UI_CONTROL_TOPIC = "ui-control";
export const CHAT_TOPIC = "lk.chat";

export type UIControlEvent =
  /** Go to a slide (1-based). */
  | { action: "scroll"; page: number }
  /** A lesson from the chapter's list has started, with its number of topics. */
  | { action: "set_lesson"; lesson: string; totalTopics: number }
  /** A topic has started. */
  | {
      action: "set_topic";
      topic: string | null;
      index: number;
    }
  /** The open understanding check, or null to close it. */
  | {
      action: "set_checkpoint";
      checkpoint: { id: string; question: string; choices: string[] } | null;
    }
  | { action: "topic_done" }
  /** The student's usage limits are the reason for the ending that follows. */
  | { action: "allowance_reached" }
  /** The session has reached its time limit. */
  | { action: "session_ending"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function parseUIControlEvent(value: unknown): UIControlEvent | null {
  if (!isRecord(value) || typeof value.action !== "string") return null;

  switch (value.action) {
    case "scroll":
      return positiveInteger(value.page) ? { action: "scroll", page: value.page } : null;
    case "set_lesson":
      return typeof value.lesson === "string" && value.lesson && positiveInteger(value.number_of_topics)
        ? { action: "set_lesson", lesson: value.lesson, totalTopics: value.number_of_topics }
        : null;
    case "set_topic":
      if (typeof value.topic !== "string" || !positiveInteger(value.current_topic_index)) return null;
      return {
        action: "set_topic",
        topic: value.topic || null,
        index: value.current_topic_index,
      };
    case "set_checkpoint": {
      const checkpoint = value.checkpoint;
      if (checkpoint === null) return { action: "set_checkpoint", checkpoint: null };
      if (!isRecord(checkpoint) || typeof checkpoint.id !== "string" || !checkpoint.id ||
          typeof checkpoint.text !== "string" || !Array.isArray(checkpoint.choices) ||
          !checkpoint.choices.every((choice): choice is string => typeof choice === "string")) return null;
      return {
        action: "set_checkpoint",
        checkpoint: { id: checkpoint.id, question: checkpoint.text, choices: checkpoint.choices },
      };
    }
    case "topic_done":
      return { action: "topic_done" };
    case "allowance_reached":
      return { action: "allowance_reached" };
    case "session_ending":
      return typeof value.message === "string" ? { action: "session_ending", message: value.message } : null;
    default:
      return null;
  }
}
