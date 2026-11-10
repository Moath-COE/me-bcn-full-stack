import { Router } from "express";

import { getCourseDetail, getCourses } from "../controllers/catalog.controller.js";

const router = Router();
router.get("/", getCourses);
router.get("/:courseId", getCourseDetail);

export default router;
