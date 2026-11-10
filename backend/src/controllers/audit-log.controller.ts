import type { Request, Response } from "express";

import { listAuditLog, type AuditLogQuery } from "../services/audit-log.service.js";

export async function getAuditLog(_req: Request, res: Response): Promise<void> {
  res
    .set("Cache-Control", "private, no-store")
    .status(200)
    .json(await listAuditLog(res.locals.query as AuditLogQuery));
}
