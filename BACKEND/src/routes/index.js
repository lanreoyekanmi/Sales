import { Router } from "express";
import applicationRoutes from "./application.routes.js";

const router = Router();

// Deployment verification only — deliberately returns nothing beyond a static success body, no
// database/Cloudinary/Telegram connectivity check and no internal detail, so it stays safe to
// leave publicly reachable in production (e.g. as a Vercel health check).
router.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "API is running" });
});

router.use("/applications", applicationRoutes);

export default router;
