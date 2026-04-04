import { Router } from "express";
import { pool } from "../db/index.js";

const router = Router();

router.get("/", async (_req, res) => {
  let dbStatus = "disconnected";
  try {
    const client = await pool.connect();
    client.release();
    dbStatus = "connected";
  } catch {}

  res.json({
    status: "ok",
    app: "ooru",
    port: Number(process.env.PORT) || 3002,
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
