import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { orders } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { emitToMerchant } from "../socket.js";

const router = Router();

let orderCounter = Date.now() % 100000;

const saleSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number().int().default(1),
      pricePaise: z.number().int(),
    })
  ),
  totalPaise: z.number().int(),
  paymentMethod: z.enum(["cash", "upi"]),
  gstPaise: z.number().int().optional(),
});

// POST /api/pos/:merchantId/sale
router.post("/:merchantId/sale", async (req, res) => {
  const merchantId = Number(req.params.merchantId);
  if (isNaN(merchantId)) return res.status(400).json({ error: "Invalid merchantId" });

  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { items, totalPaise, paymentMethod, gstPaise } = parsed.data;
  const subtotalPaise = items.reduce((s, i) => s + i.pricePaise * i.qty, 0);
  const orderNumber = `OO-POS-${String(++orderCounter).padStart(5, "0")}`;

  const [order] = await db
    .insert(orders)
    .values({
      merchantId,
      orderNumber,
      status: "delivered",
      orderType: "walkin",
      items,
      subtotalPaise,
      gstPaise: gstPaise || 0,
      totalPaise,
      paymentMethod,
      paymentStatus: "paid",
    })
    .returning();

  emitToMerchant(merchantId, "order:new", order);

  res.status(201).json({ orderId: order.id, orderNumber: order.orderNumber });
});

// GET /api/pos/:merchantId/whatsapp-orders
router.get("/:merchantId/whatsapp-orders", async (req, res) => {
  const merchantId = Number(req.params.merchantId);
  if (isNaN(merchantId)) return res.status(400).json({ error: "Invalid merchantId" });

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.merchantId, merchantId))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  res.json(rows);
});

export default router;
