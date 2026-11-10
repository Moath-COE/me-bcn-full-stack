import { createHash, randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import request from "supertest";

import app from "../../src/app.js";
import { env } from "../../src/config/env.js";

export const webhookEndpoint = "/api/v1/livekit/webhook";

export function webhookEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    event: "participant_joined",
    createdAt: Math.floor(Date.now() / 1000).toString(),
    ...overrides
  };
}

export async function signedWebhook(
  event: Record<string, unknown>,
  contentType = "application/webhook+json"
) {
  const rawBody = JSON.stringify(event);
  return request(app)
    .post(webhookEndpoint)
    .set("Content-Type", contentType)
    .set("Authorization", await webhookSignature(rawBody))
    .send(rawBody);
}

export async function webhookSignature(rawBody: string) {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  token.sha256 = createHash("sha256").update(rawBody).digest("base64");
  return token.toJwt();
}
