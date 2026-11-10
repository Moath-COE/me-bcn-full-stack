import type { Request, Response } from "express";

import { readAllowance } from "../services/allowance.service.js";

export async function getAllowance(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await readAllowance(res.locals.session!.user.id));
}
