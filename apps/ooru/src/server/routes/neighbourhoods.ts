import { Router } from "express";
import { db } from "../db/index.js";
import { neighbourhoods, neighbourhoodScores } from "../db/schema.js";
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

router.get("/:slug/score", async (req, res) => {
  const rows = await db
    .select()
    .from(neighbourhoodScores)
    .where(eq(neighbourhoodScores.neighbourhoodSlug, req.params.slug));

  if (rows.length === 0) {
    return res.json({ composite: 0, dimensions: {}, hexCount: 0 });
  }

  const avg = (field: keyof typeof rows[0]) => {
    const vals = rows.map((r) => (r[field] as number) || 0);
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
  };

  res.json({
    composite: Math.round(avg("compositeScore") * 100),
    dimensions: {
      infrastructure: avg("infrastructureScore"),
      environment: avg("environmentScore"),
      safety: avg("safetyScore"),
      governance: avg("governanceScore"),
      greenCover: avg("greenCoverScore"),
      heatIsland: avg("heatIslandScore"),
      floodRisk: avg("floodRiskScore"),
      mobility: avg("mobilityScore"),
      commercialVitality: avg("commercialVitalityScore"),
      liveability: avg("liveabilityScore"),
    },
    hexCount: rows.length,
    calculatedAt: rows[0].calculatedAt,
  });
});

export default router;
