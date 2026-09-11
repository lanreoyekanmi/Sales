import { Router } from "express";
import applicationRoutes from "./application.routes.js";

const router = Router();

router.use("/applications", applicationRoutes);

export default router;
