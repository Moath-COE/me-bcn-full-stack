import type { LocalParticipant } from "livekit-client";
import type { AgentState } from "@livekit/components-react";

export type StudentQuestionStatus = { busy: boolean; startedAt: number | null };
export type StudentQuestionOutcome = "sent" | "cancelled";
type CloseMethod = "end_turn" | "cancel_turn" | null;

/** Owns the mic gate and turn guards, including cancellation while start_turn is pending. */
export function createStudentQuestion(
  participant: Pick<LocalParticipant, "performRpc" | "setMicrophoneEnabled">,
  onChange: (status: StudentQuestionStatus) => void,
  onNoSpeech: () => void,
  onClosed: (outcome: StudentQuestionOutcome) => void,
) {
  let turn: {
    destinationIdentity: string;
    opening: Promise<void>;
    closing: Promise<void> | null;
    method: CloseMethod;
    lastAgentState: AgentState;
    listened: boolean;
    micOpened: boolean;
  } | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;

  const clearGuards = () => {
    clearTimeout(silenceTimer);
    clearTimeout(capTimer);
  };

  const close = (method: CloseMethod) => {
    const current = turn;
    if (!current) return Promise.resolve();
    // Session ending wins over a queued Send or automatic close.
    if (current.closing) {
      if (method === "cancel_turn") current.method = method;
      return current.closing;
    }
    current.method = method;
    clearGuards();
    onChange({ busy: true, startedAt: null });
    current.closing = (async () => {
      // start_turn must settle before cancel_turn; never unmute a cancelled startup.
      await current.opening.catch(() => undefined);
      try {
        await participant.setMicrophoneEnabled(false);
        if (current.method) {
          await participant.performRpc({
            destinationIdentity: current.destinationIdentity,
            method: current.method,
            payload: "",
          });
        }
      } catch (error) {
        console.error("Failed to close student question:", error);
      } finally {
        turn = null;
        onChange({ busy: false, startedAt: null });
        onClosed(current.micOpened && current.method !== "cancel_turn" ? "sent" : "cancelled");
      }
    })();
    return current.closing;
  };

  const start = async (destinationIdentity: string, agentState: AgentState) => {
    if (turn) return;
    const current = {
      destinationIdentity,
      opening: Promise.resolve(),
      closing: null as Promise<void> | null,
      method: null as CloseMethod,
      lastAgentState: agentState,
      listened: agentState === "listening",
      micOpened: false,
    };
    turn = current;
    onChange({ busy: true, startedAt: null });
    let acknowledged = false;
    current.opening = (async () => {
      await participant.performRpc({ destinationIdentity, method: "start_turn", payload: "" });
      acknowledged = true;
      if (current.closing) return;
      await participant.setMicrophoneEnabled(true);
      current.micOpened = true;
      if (current.closing) return;
      onChange({ busy: false, startedAt: Date.now() });
      silenceTimer = setTimeout(() => {
        onNoSpeech();
        void close("cancel_turn");
      }, 8_000);
      capTimer = setTimeout(() => void close("end_turn"), 60_000);
    })();
    try {
      await current.opening;
    } catch (error) {
      console.error("Failed to start student question:", error);
      await close(acknowledged ? "cancel_turn" : null);
    }
  };

  const observeAgentState = (agentState: AgentState) => {
    if (!turn || turn.closing) return;
    const changed = agentState !== turn.lastAgentState;
    turn.lastAgentState = agentState;
    if (agentState === "listening") turn.listened = true;
    if (changed && (agentState === "thinking" || (agentState === "speaking" && turn.listened))) {
      void close(null);
    }
  };

  return {
    start,
    close,
    observeAgentState,
    speechDetected: () => clearTimeout(silenceTimer),
  };
}
