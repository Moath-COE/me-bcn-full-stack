import { Router } from "express";

import { getAllowance } from "../controllers/allowance.controller.js";
import { requireSession } from "../middlewares/require-session.middleware.js";

const router = Router();
router.use(requireSession);
router.get("/", getAllowance);

export default router;
