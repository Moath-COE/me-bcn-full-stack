import type { Request, Response } from "express";
import { z } from "zod";

import { getCourse, listCourses } from "../services/catalog.service.js";

const catalogQuery = z.object({
  institution: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/)
    .optional()
});
const publicCache = "public, max-age=60, s-maxage=300";

export async function getCourses(req: Request, res: Response): Promise<void> {
  const { institution } = catalogQuery.parse(req.query);
  const courses = await listCourses(institution);
  res.set("Cache-Control", publicCache).status(200).json(courses);
}

export async function getCourseDetail(
  req: Request<{ courseId: string }>,
  res: Response
): Promise<void> {
  const course = await getCourse(req.params.courseId);
  res.set("Cache-Control", publicCache).status(200).json(course);
}
