import type { Request, Response } from "express";

import { readAdminInsights } from "../services/admin-insights.service.js";
import type { InsightsRange } from "../utils/insights-range.js";

export async function getAdminInsights(_req: Request, res: Response): Promise<void> {
  const { range } = res.locals.query as { range: InsightsRange };

  res
    .set("Cache-Control", "private, no-store")
    .status(200)
    .json(await readAdminInsights(range));
}
