import { Router } from "express";
import { db } from "../db/index.js";
import { neighbourhoods } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await db.select().from(neighbourhoods);
  res.json(rows);
});

router.get("/:slug", async (req, res) => {
  const [row] = await db
    .select()
    .from(neighbourhoods)
    .where(eq(neighbourhoods.slug, req.params.slug));
  if (!row) return res.status(404).json({ error: "Neighbourhood not found" });
  res.json(row);
});

export default router;
