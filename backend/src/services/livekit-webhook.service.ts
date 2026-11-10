import { ParticipantInfo } from "livekit-server-sdk";

import { logger } from "../config/logger.js";
import { db } from "../db/index.js";
import { receiveLivekitWebhook } from "../lib/livekit.js";
import { lockCurrentPlanAssignment } from "../repositories/plan.repository.js";
import {
  findStudySession,
  insertWebhookEvent,
  recordSessionPresence
} from "../repositories/study-session.repository.js";

// The SDK exports ParticipantInfo, but not its Kind enum; use its protocol descriptor.
const kindField = ParticipantInfo.fields.list().find((field) => field.name === "kind");
const agentKind =
  kindField?.kind === "enum" ? kindField.T.findName("AGENT")!.no : undefined;

export async function handleLivekitWebhook(rawBody: Buffer, authorization?: string) {
  const event = await receiveLivekitWebhook(rawBody, authorization);
  await db.transaction(async (tx) => {
    if (!event.id || !(await insertWebhookEvent(tx, event.id))) return;
    if (event.event !== "participant_joined" && event.event !== "participant_left")
      return;
    if (!event.participant || event.participant.kind === agentKind) return;
    const match =
      /^ss_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
        event.room?.name ?? ""
      );
    if (!match) return;
    const session = await findStudySession(tx, match[1]!);
    if (!session || event.participant.identity !== session.userId) return;
    await lockCurrentPlanAssignment(tx, session.userId);
    const recorded = await recordSessionPresence(
      tx,
      session.id,
      event.event,
      new Date(Number(event.createdAt) * 1000)
    );
    if (!recorded) {
      logger.warn(
        { userId: session.userId, sessionId: session.id, eventId: event.id },
        "Session leave without open presence interval"
      );
    }
  });
}
