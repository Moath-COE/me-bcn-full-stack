import type { Request, Response } from "express";

import { handleLivekitWebhook } from "../services/livekit-webhook.service.js";

export async function postLivekitWebhook(req: Request, res: Response): Promise<void> {
  await handleLivekitWebhook(req.body, req.get("Authorization"));
  res.sendStatus(200);
}
