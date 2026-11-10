import type { Request, Response } from "express";

import { enroll, listEnrollments, unenroll } from "../services/enrollment.service.js";

export async function getEnrollments(_req: Request, res: Response): Promise<void> {
  res
    .set("Cache-Control", "private, no-store")
    .status(200)
    .json(await listEnrollments(res.locals.session!.user.id));
}

export async function putEnrollment(
  req: Request<{ courseId: string }>,
  res: Response
): Promise<void> {
  res.set("Cache-Control", "no-store");
  const result = await enroll(res.locals.session!.user.id, req.params.courseId);
  res.status(result.created ? 201 : 200).json(result.enrollment);
}

export async function deleteEnrollment(
  req: Request<{ courseId: string }>,
  res: Response
): Promise<void> {
  await unenroll(res.locals.session!.user.id, req.params.courseId);
  res.status(204).end();
}
