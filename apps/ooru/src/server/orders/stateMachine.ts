import { db } from "../db/index.js";
import { orders, merchants, consumers, dailyPnl } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { emitToMerchant } from "../socket.js";

// ── States ─────────────────────────────────────────────────

export const ORDER_STATES = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "pickup_assigned",
  "picked_up",
  "at_hub",
  "lastmile_assigned",
  "out_for_delivery",
  "at_gate",
  "delivered",
  "cancelled",
  "rejected",
  "payment_failed",
] as const;

export type OrderStatus = (typeof ORDER_STATES)[number];

const TERMINAL: Set<string> = new Set(["delivered", "cancelled", "rejected", "payment_failed"]);

// ── Transition map ─────────────────────────────────────────

const TRANSITIONS: Record<string, string[]> = {
  placed: ["accepted", "rejected", "cancelled", "payment_failed"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: ["pickup_assigned"],
  pickup_assigned: ["picked_up"],
  picked_up: ["at_hub"],
  at_hub: ["lastmile_assigned"],
  lastmile_assigned: ["out_for_delivery"],
  out_for_delivery: ["at_gate", "delivered"],
  at_gate: ["delivered"],
};

// Walk-in shortcut transitions (no delivery states)
const WALKIN_TRANSITIONS: Record<string, string[]> = {
  placed: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: ["delivered"],
};

export function isValidTransition(
  currentStatus: string,
  targetStatus: string,
  orderType: string
): boolean {
  if (TERMINAL.has(currentStatus)) return false;
  const map = orderType === "walkin" || orderType === "dinein"
    ? { ...TRANSITIONS, ...WALKIN_TRANSITIONS }
    : TRANSITIONS;
  const allowed = map[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

// ── Advance order ──────────────────────────────────────────

export interface AdvanceResult {
  success: boolean;
  order?: any;
  error?: string;
}

export async function advanceOrder(
  orderId: number,
  targetStatus: OrderStatus,
  actorRole: string
): Promise<AdvanceResult> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return { success: false, error: "Order not found" };

  const currentStatus = order.status || "placed";
  const orderType = order.orderType || "delivery";

  if (!isValidTransition(currentStatus, targetStatus, orderType)) {
    return {
      success: false,
      error: `Cannot transition from '${currentStatus}' to '${targetStatus}' (type: ${orderType})`,
    };
  }

  const [updated] = await db
    .update(orders)
    .set({ status: targetStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  // Socket.IO notification
  if (updated.merchantId) {
    emitToMerchant(updated.merchantId, "order:status", updated);
  }

  // WhatsApp notification (log for now)
  logNotification(updated, targetStatus, actorRole);

  // Update daily P&L on delivered
  if (targetStatus === "delivered" && updated.merchantId) {
    updateDailyPnl(updated.merchantId, updated.totalPaise, updated.gstPaise || 0).catch(
      (e) => console.error("[pnl] Error:", e.message)
    );
  }

  return { success: true, order: updated };
}

// ── Cancellation ───────────────────────────────────────────

export interface CancelResult {
  success: boolean;
  order?: any;
  refundType?: string;
  error?: string;
}

export async function cancelOrder(
  orderId: number,
  actorRole: string
): Promise<CancelResult> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return { success: false, error: "Order not found" };

  const status = order.status || "";

  if (TERMINAL.has(status)) {
    return { success: false, error: `Order already ${status}` };
  }

  let refundType = "none";

  if (status === "placed") {
    // Pre-accepted: full immediate refund
    refundType = "full_refund";
  } else if (status === "accepted") {
    // Within 2 min of accepted
    const acceptedAt = order.updatedAt ? new Date(order.updatedAt).getTime() : 0;
    const elapsed = Date.now() - acceptedAt;
    if (elapsed < 2 * 60 * 1000) {
      refundType = "full_refund";
    } else {
      refundType = "complaint_only";
    }
  } else if (status === "preparing") {
    // After preparing: complaint path only
    refundType = "complaint_only";
  } else {
    refundType = "complaint_only";
  }

  if (refundType === "complaint_only" && actorRole === "consumer") {
    return {
      success: false,
      error: "Order is already being prepared. Please contact support for cancellation.",
    };
  }

  const [updated] = await db
    .update(orders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  if (updated.merchantId) {
    emitToMerchant(updated.merchantId, "order:status", updated);
  }

  console.log(`[order] #${updated.orderNumber} cancelled by ${actorRole}. Refund: ${refundType}`);

  return { success: true, order: updated, refundType };
}

export async function rejectOrder(
  orderId: number
): Promise<AdvanceResult> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "placed") {
    return { success: false, error: `Can only reject placed orders, current: ${order.status}` };
  }

  const [updated] = await db
    .update(orders)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  if (updated.merchantId) {
    emitToMerchant(updated.merchantId, "order:status", updated);
  }

  // Full refund + ₹50 credit for consumer
  if (updated.consumerId) {
    console.log(
      `[order] #${updated.orderNumber} rejected. Refund: full + ₹50 credit for consumer ${updated.consumerId}`
    );
  }

  return { success: true, order: updated };
}

// ── Daily P&L ──────────────────────────────────────────────

async function updateDailyPnl(
  merchantId: number,
  totalPaise: number,
  gstPaise: number
) {
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  const commissionRate = merchant?.commissionRate || 0.15;
  const commissionPaise = Math.round(totalPaise * commissionRate);
  const netPaise = totalPaise - commissionPaise - gstPaise;
  const today = new Date().toISOString().split("T")[0];

  // Upsert: try update first, then insert
  const [existing] = await db
    .select()
    .from(dailyPnl)
    .where(and(eq(dailyPnl.merchantId, merchantId), eq(dailyPnl.date, today)))
    .limit(1);

  if (existing) {
    await db
      .update(dailyPnl)
      .set({
        ordersCount: (existing.ordersCount || 0) + 1,
        grossPaise: (existing.grossPaise || 0) + totalPaise,
        commissionPaise: (existing.commissionPaise || 0) + commissionPaise,
        netPaise: (existing.netPaise || 0) + netPaise,
        gstPaise: (existing.gstPaise || 0) + gstPaise,
        updatedAt: new Date(),
      })
      .where(eq(dailyPnl.id, existing.id));
  } else {
    await db.insert(dailyPnl).values({
      merchantId,
      date: today,
      ordersCount: 1,
      grossPaise: totalPaise,
      commissionPaise,
      netPaise,
      gstPaise,
      updatedAt: new Date(),
    });
  }

  console.log(
    `[pnl] Merchant ${merchantId} | ${today} | +${totalPaise / 100} gross, -${commissionPaise / 100} commission`
  );
}

// ── Order number generation ────────────────────────────────

export async function generateOrderNumber(merchantId: number): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");

  // Count today's orders for this merchant
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        sql`date(${orders.createdAt}) = current_date`
      )
    );

  const seq = (result?.count || 0) + 1;
  return `OO-${dateStr}-${String(seq).padStart(4, "0")}`;
}

// ── Notification logging ───────────────────────────────────

function logNotification(order: any, newStatus: string, actor: string) {
  const msgs: Record<string, string> = {
    accepted: `Your order #${order.orderNumber} has been accepted!`,
    preparing: `Your order #${order.orderNumber} is being prepared.`,
    ready: `Your order #${order.orderNumber} is ready!`,
    pickup_assigned: `A rider has been assigned to pick up your order.`,
    picked_up: `Your order has been picked up and is on its way!`,
    out_for_delivery: `Your order is out for delivery!`,
    at_gate: `Your rider is at the gate with your order.`,
    delivered: `Your order #${order.orderNumber} has been delivered. Enjoy!`,
  };

  const msg = msgs[newStatus];
  if (msg) {
    console.log(`[notify] → Consumer: ${msg} (actor: ${actor})`);
  }
}
