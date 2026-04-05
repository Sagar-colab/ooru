import { Router } from "express";
import { db } from "../db/index.js";
import { satelliteCache } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const router = Router();

// GET /api/satellite/:slug/:overlay
router.get("/:slug/:overlay", async (req, res) => {
  const { slug, overlay } = req.params;
  const valid = ["ndvi", "heat", "flood", "safety", "water", "health"];
  if (!valid.includes(overlay)) {
    return res.status(400).json({ error: `Invalid overlay. Valid: ${valid.join(", ")}` });
  }

  const rows = await db
    .select()
    .from(satelliteCache)
    .where(
      and(
        eq(satelliteCache.neighbourhoodSlug, slug),
        eq(satelliteCache.overlayType, overlay)
      )
    );

  res.json(rows);
});

export default router;
