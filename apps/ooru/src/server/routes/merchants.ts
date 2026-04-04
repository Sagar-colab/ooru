import { Router } from "express";
import { db } from "../db/index.js";
import { merchants, menuCategories, menuItems } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const slug = req.query.neighbourhood_slug as string | undefined;
  if (slug) {
    const rows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.neighbourhoodSlug, slug));
    return res.json(rows);
  }
  const rows = await db.select().from(merchants);
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid merchant id" });

  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, id));
  if (!merchant) return res.status(404).json({ error: "Merchant not found" });

  const categories = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.merchantId, id));
  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.merchantId, id));

  res.json({ ...merchant, categories, menuItems: items });
});

export default router;
