import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { consumers } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

const createConsumerSchema = z.object({
  phone: z.string().min(10),
  name: z.string().optional(),
  language: z.string().optional(),
  neighbourhoodSlug: z.string().optional(),
  dietary: z.array(z.string()).optional(),
  spiceLevel: z.string().optional(),
});

router.get("/", async (req, res) => {
  const slug = req.query.neighbourhood_slug as string | undefined;
  if (slug) {
    const rows = await db
      .select()
      .from(consumers)
      .where(eq(consumers.neighbourhoodSlug, slug));
    return res.json(rows);
  }
  const rows = await db.select().from(consumers);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = createConsumerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const [row] = await db.insert(consumers).values(parsed.data).returning();
  res.status(201).json(row);
});

export default router;
