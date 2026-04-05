import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { emitToMerchant } from "../socket.js";

const router = Router();

const createOrderSchema = z.object({
  consumerId: z.number().nullable().optional(),
  merchantId: z.number(),
  status: z.string().default("placed"),
  orderType: z.string().default("delivery"),
  orderNumber: z.string(),
  items: z.array(z.any()),
  subtotalPaise: z.number().int(),
  gstPaise: z.number().int().optional(),
  deliveryFeePaise: z.number().int().optional(),
  totalPaise: z.number().int(),
  paymentMethod: z.string().optional(),
  deliveryAddress: z.string().optional(),
  specialInstructions: z.string().optional(),
  neighbourhoodSlug: z.string().optional(),
});

router.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  if (status) {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.status, status));
    return res.json(rows);
  }
  const rows = await db.select().from(orders);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [order] = await db.insert(orders).values(parsed.data).returning();

  // Emit to KDS
  if (order.merchantId) {
    emitToMerchant(order.merchantId, "order:new", order);
  }

  res.status(201).json(order);
});

export default router;
