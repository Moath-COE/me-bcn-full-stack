import type { Request, Response } from "express";

import { listInstitutions } from "../services/institution.service.js";

export async function getInstitutions(_req: Request, res: Response): Promise<void> {
  const institutions = await listInstitutions();

  res.set("Cache-Control", "public, max-age=300").status(200).json(institutions);
}
