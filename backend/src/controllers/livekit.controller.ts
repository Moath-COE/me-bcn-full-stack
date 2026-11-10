import type { Request, Response } from "express";

import {
  createLivekitToken,
  type LivekitTokenInput
} from "../services/livekit.service.js";

export async function postLivekitToken(
  req: Request<Record<string, never>, unknown, LivekitTokenInput>,
  res: Response
): Promise<void> {
  const result = await createLivekitToken(res.locals.session!.user, req.body);
  res.set("Cache-Control", "no-store").status(200).json(result);
}
