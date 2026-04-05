import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { orders } from "../db/schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { emitToMerchant } from "../socket.js";
import {
  advanceOrder,
  cancelOrder,
  rejectOrder,
  generateOrderNumber,
  type OrderStatus,
} from "../orders/stateMachine.js";

const router = Router();

// ── Schemas ────────────────────────────────────────────────

const createOrderSchema = z.object({
  consumerId: z.number().nullable().optional(),
  merchantId: z.number(),
  orderType: z.string().default("delivery"),
  items: z.array(z.any()),
  subtotalPaise: z.number().int(),
  gstPaise: z.number().int().optional(),
  deliveryFeePaise: z.number().int().optional(),
  totalPaise: z.number().int(),
  paymentMethod: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryLat: z.number().optional(),
  deliveryLng: z.number().optional(),
  specialInstructions: z.string().optional(),
  neighbourhoodSlug: z.string().optional(),
});

const advanceSchema = z.object({
  status: z.string(),
  actorRole: z.string().default("system"),
});

// ── GET /api/orders ────────────────────────────────────────

router.get("/", async (req, res) => {
  const {
    merchant_id,
    consumer_id,
    status,
    neighbourhood_slug,
    date_from,
    date_to,
  } = req.query as Record<string, string | undefined>;

  let query = db.select().from(orders).$dynamic();

  if (merchant_id) query = query.where(eq(orders.merchantId, Number(merchant_id)));
  if (consumer_id) query = query.where(eq(orders.consumerId, Number(consumer_id)));
  if (status) query = query.where(eq(orders.status, status));
  if (neighbourhood_slug) query = query.where(eq(orders.neighbourhoodSlug, neighbourhood_slug));
  if (date_from) query = query.where(gte(orders.createdAt, new Date(date_from)));
  if (date_to) query = query.where(lte(orders.createdAt, new Date(date_to)));

  const rows = await query.orderBy(desc(orders.createdAt)).limit(100);
  res.json(rows);
});

// ── GET /api/orders/:id ────────────────────────────────────

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return res.status(404).json({ error: "Order not found" });

  res.json(order);
});

// ── POST /api/orders ───────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const orderNumber = await generateOrderNumber(data.merchantId);

  const [order] = await db
    .insert(orders)
    .values({
      ...data,
      orderNumber,
      status: "placed",
      paymentStatus: "pending",
    })
    .returning();

  // Emit to KDS
  if (order.merchantId) {
    emitToMerchant(order.merchantId, "order:new", order);
  }

  console.log(`[order] Created ${orderNumber} for merchant ${data.merchantId}`);
  res.status(201).json(order);
});

// ── PATCH /api/orders/:id/status ───────────────────────────

router.patch("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

  const parsed = advanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { status, actorRole } = parsed.data;

  // Handle rejection separately
  if (status === "rejected") {
    const result = await rejectOrder(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result.order);
  }

  const result = await advanceOrder(id, status as OrderStatus, actorRole);
  if (!result.success) return res.status(400).json({ error: result.error });

  res.json(result.order);
});

// ── POST /api/orders/:id/cancel ────────────────────────────

router.post("/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

  const actorRole = (req.body?.actorRole as string) || "consumer";

  const result = await cancelOrder(id, actorRole);
  if (!result.success) return res.status(400).json({ error: result.error });

  res.json({
    order: result.order,
    refundType: result.refundType,
  });
});

export default router;
