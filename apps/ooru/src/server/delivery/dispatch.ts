import { db } from "../db/index.js";
import {
  orders,
  merchants,
  riders,
  deliveryAssignments,
} from "../db/schema.js";
import { eq, and, ne, inArray } from "drizzle-orm";
import { haversineKm } from "./eta.js";
import { sendWhatsApp } from "../evo/gupshup.js";
import { emitToMerchant } from "../socket.js";

export interface DispatchResult {
  riderId: number | null;
  message: string;
}

export async function assignRider(
  orderId: number,
  role: string = "lastmile"
): Promise<DispatchResult> {
  // 1. Get order + merchant
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return { riderId: null, message: "Order not found" };

  let merchantLat = 12.9784;
  let merchantLng = 77.6408;
  let merchantName = "Restaurant";
  const slug = order.neighbourhoodSlug || "indiranagar";

  if (order.merchantId) {
    const [m] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, order.merchantId))
      .limit(1);
    if (m) {
      merchantLat = m.lat || merchantLat;
      merchantLng = m.lng || merchantLng;
      merchantName = m.name;
    }
  }

  // 2. Find online riders in same neighbourhood
  const onlineRiders = await db
    .select()
    .from(riders)
    .where(
      and(
        eq(riders.isOnline, true),
        eq(riders.neighbourhoodSlug, slug)
      )
    );

  if (onlineRiders.length === 0) {
    console.log(`[dispatch] No online riders in ${slug} for order ${orderId}`);
    return { riderId: null, message: "No riders available" };
  }

  // 3. Filter out riders with active assignments
  const activeAssignments = await db
    .select()
    .from(deliveryAssignments)
    .where(inArray(deliveryAssignments.status, ["assigned", "accepted"]));

  const busyRiderIds = new Set(activeAssignments.map((a) => a.riderId));
  const availableRiders = onlineRiders.filter((r) => !busyRiderIds.has(r.id));

  if (availableRiders.length === 0) {
    console.log(`[dispatch] All riders busy in ${slug} for order ${orderId}`);
    return { riderId: null, message: "All riders busy" };
  }

  // 4. Sort by distance to merchant
  const sorted = availableRiders
    .map((r) => ({
      rider: r,
      distance: haversineKm(
        r.lat || merchantLat,
        r.lng || merchantLng,
        merchantLat,
        merchantLng
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  const nearest = sorted[0].rider;

  // 5. Create assignment
  const [assignment] = await db
    .insert(deliveryAssignments)
    .values({
      orderId,
      riderId: nearest.id,
      role,
      status: "assigned",
    })
    .returning();

  // 6. Update order with rider
  await db
    .update(orders)
    .set({ riderId: nearest.id, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  // 7. Notify rider
  const itemsSummary = ((order.items as any[]) || [])
    .map((i: any) => `${i.name} × ${i.qty || 1}`)
    .join(", ");
  const deliveryFee = "₹30";

  sendWhatsApp(
    nearest.phone,
    `🆕 New delivery!\n${merchantName}: ${itemsSummary}\nFee: ${deliveryFee}\nReply ACCEPT to take it.`
  );

  // 8. Emit to KDS
  if (order.merchantId) {
    emitToMerchant(order.merchantId, "order:status", {
      ...order,
      status: order.status,
      riderId: nearest.id,
    });
  }

  console.log(
    `[dispatch] Assigned rider ${nearest.name} (${nearest.phone}) to order ${orderId}`
  );

  return {
    riderId: nearest.id,
    message: `Assigned to ${nearest.name}`,
  };
}
