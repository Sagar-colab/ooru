import { Router } from "express";
import { db } from "../db/index.js";
import { orders, menuItems, menuCategories } from "../db/schema.js";
import { eq, and, inArray, asc } from "drizzle-orm";
import { advanceOrder, type OrderStatus } from "../orders/stateMachine.js";

const router = Router();

const ACTIVE_STATUSES = ["placed", "accepted", "preparing", "ready"];

// Simple next-status map for KDS single-tap advance
const KDS_NEXT: Record<string, OrderStatus> = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "delivered", // walk-in shortcut; delivery orders use pickup_assigned
};

// GET /api/kds/:merchantId/orders
router.get("/:merchantId/orders", async (req, res) => {
  const merchantId = Number(req.params.merchantId);
  if (isNaN(merchantId)) return res.status(400).json({ error: "Invalid merchantId" });

  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        inArray(orders.status, ACTIVE_STATUSES)
      )
    )
    .orderBy(asc(orders.createdAt));

  res.json(rows);
});

// POST /api/kds/:merchantId/orders/:orderId/advance
router.post("/:merchantId/orders/:orderId/advance", async (req, res) => {
  const merchantId = Number(req.params.merchantId);
  const orderId = Number(req.params.orderId);
  if (isNaN(merchantId) || isNaN(orderId)) {
    return res.status(400).json({ error: "Invalid IDs" });
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
    .limit(1);

  if (!order) return res.status(404).json({ error: "Order not found" });

  const nextStatus = KDS_NEXT[order.status || ""];
  if (!nextStatus) {
    return res.status(400).json({ error: `Cannot advance from status: ${order.status}` });
  }

  const result = await advanceOrder(orderId, nextStatus, "merchant");
  if (!result.success) return res.status(400).json({ error: result.error });

  res.json(result.order);
});

// GET /api/kds/:merchantId/menu
router.get("/:merchantId/menu", async (req, res) => {
  const merchantId = Number(req.params.merchantId);
  if (isNaN(merchantId)) return res.status(400).json({ error: "Invalid merchantId" });

  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.merchantId, merchantId));

  const categories = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.merchantId, merchantId));

  res.json({ items, categories });
});

export default router;
