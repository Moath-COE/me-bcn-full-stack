import type { Request, Response } from "express";

import { listPlans } from "../services/plan.service.js";

export async function getPlans(_req: Request, res: Response): Promise<void> {
  const plans = await listPlans();

  res.set("Cache-Control", "public, max-age=300").status(200).json({ plans });
}
