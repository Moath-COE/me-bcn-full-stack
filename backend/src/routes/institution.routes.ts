import { Router } from "express";
import { getInstitutions } from "../controllers/institution.controller.js";

const router = Router();

router.get("/", getInstitutions);

export default router;
