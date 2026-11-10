import { AccessToken, RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { LIVEKIT_TOKEN_TTL_SECONDS } from "../utils/livekit-token-ttl.js";
import { AppError } from "../utils/app-error.js";

const webhookReceiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

export async function receiveLivekitWebhook(rawBody: Buffer, authorization?: string) {
  try {
    if (!Buffer.isBuffer(rawBody)) throw new Error("Raw webhook body required");
    return await webhookReceiver.receive(rawBody.toString("utf8"), authorization);
  } catch {
    throw new AppError(401, "Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE");
  }
}

export async function mintLivekitToken(options: {
  identity: string;
  name: string;
  room: string;
  attributes: Record<string, string>;
}): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: options.identity,
    name: options.name,
    ttl: LIVEKIT_TOKEN_TTL_SECONDS,
    attributes: options.attributes
  });
  token.addGrant({ roomJoin: true, room: options.room });
  return token.toJwt();
}

export async function deleteLivekitRoom(room: string): Promise<void> {
  try {
    const url = new URL(env.LIVEKIT_URL);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    const client = new RoomServiceClient(
      url.toString(),
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET
    );
    await client.deleteRoom(room);
  } catch (err) {
    logger.warn({ err, room }, "Could not delete superseded Session room");
  }
}
