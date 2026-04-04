import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { shopBusinesses, udharLedger } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

const createShopSchema = z.object({
  phone: z.string().min(10),
  ownerName: z.string().optional(),
  businessName: z.string().min(1),
  businessType: z.string().min(1),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  neighbourhoodSlug: z.string().optional(),
});

const createUdharSchema = z.object({
  shopBusinessId: z.number(),
  customerName: z.string().min(1),
  customerPhoneHash: z.string().optional(),
  amountPaise: z.number().int(),
  transactionType: z.enum(["credit", "debit"]),
  note: z.string().optional(),
});

// Shop businesses
router.get("/", async (req, res) => {
  const slug = req.query.neighbourhood_slug as string | undefined;
  const type = req.query.business_type as string | undefined;
  let query = db.select().from(shopBusinesses).$dynamic();
  if (slug) query = query.where(eq(shopBusinesses.neighbourhoodSlug, slug));
  if (type) query = query.where(eq(shopBusinesses.businessType, type));
  const rows = await query;
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = createShopSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const [row] = await db
    .insert(shopBusinesses)
    .values(parsed.data)
    .returning();
  res.status(201).json(row);
});

// Udhar ledger
router.get("/udhar/:shopId", async (req, res) => {
  const shopId = Number(req.params.shopId);
  if (isNaN(shopId))
    return res.status(400).json({ error: "Invalid shop id" });
  const rows = await db
    .select()
    .from(udharLedger)
    .where(eq(udharLedger.shopBusinessId, shopId));
  res.json(rows);
});

router.post("/udhar", async (req, res) => {
  const parsed = createUdharSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const [row] = await db.insert(udharLedger).values(parsed.data).returning();
  res.status(201).json(row);
});

export default router;
