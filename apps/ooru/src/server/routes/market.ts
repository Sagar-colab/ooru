import { Router } from "express";
import { db } from "../db/index.js";
import { ondcCatalogue, shopBusinesses } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const router = Router();

// GET /api/market/:slug
router.get("/:slug", async (req, res) => {
  const slug = req.params.slug;
  const category = req.query.category as string | undefined;

  const items = await db
    .select({
      id: ondcCatalogue.id,
      itemName: ondcCatalogue.itemName,
      description: ondcCatalogue.description,
      photoUrl: ondcCatalogue.photoUrl,
      pricePaise: ondcCatalogue.pricePaise,
      unit: ondcCatalogue.unit,
      category: ondcCatalogue.category,
      isAvailable: ondcCatalogue.isAvailable,
      shopBusinessId: ondcCatalogue.shopBusinessId,
      shopName: shopBusinesses.businessName,
      shopType: shopBusinesses.businessType,
      shopPhone: shopBusinesses.phone,
    })
    .from(ondcCatalogue)
    .innerJoin(shopBusinesses, eq(ondcCatalogue.shopBusinessId, shopBusinesses.id))
    .where(
      category
        ? and(
            eq(ondcCatalogue.neighbourhoodSlug, slug),
            eq(ondcCatalogue.isAvailable, true),
            eq(ondcCatalogue.category, category)
          )
        : and(
            eq(ondcCatalogue.neighbourhoodSlug, slug),
            eq(ondcCatalogue.isAvailable, true)
          )
    );

  res.json(items);
});

// GET /api/market/:slug/categories
router.get("/:slug/categories", async (req, res) => {
  const items = await db
    .select()
    .from(ondcCatalogue)
    .where(
      and(
        eq(ondcCatalogue.neighbourhoodSlug, req.params.slug),
        eq(ondcCatalogue.isAvailable, true)
      )
    );

  const cats = new Map<string, number>();
  for (const item of items) {
    cats.set(item.category, (cats.get(item.category) || 0) + 1);
  }

  res.json(
    Array.from(cats.entries()).map(([name, count]) => ({ name, count }))
  );
});

// GET /api/market/:slug/shops
router.get("/:slug/shops", async (req, res) => {
  const items = await db
    .select({
      shopBusinessId: ondcCatalogue.shopBusinessId,
      shopName: shopBusinesses.businessName,
      shopType: shopBusinesses.businessType,
    })
    .from(ondcCatalogue)
    .innerJoin(shopBusinesses, eq(ondcCatalogue.shopBusinessId, shopBusinesses.id))
    .where(
      and(
        eq(ondcCatalogue.neighbourhoodSlug, req.params.slug),
        eq(ondcCatalogue.isAvailable, true)
      )
    );

  const shops = new Map<number, { name: string; type: string; itemCount: number }>();
  for (const item of items) {
    const existing = shops.get(item.shopBusinessId!) || { name: item.shopName!, type: item.shopType!, itemCount: 0 };
    existing.itemCount++;
    shops.set(item.shopBusinessId!, existing);
  }

  res.json(Array.from(shops.entries()).map(([id, data]) => ({ id, ...data })));
});

export default router;
