import { db } from "../../db/index.js";
import {
  riders,
  orders,
  merchants,
  riderEarnings,
  deliveryAssignments,
} from "../../db/schema.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { advanceOrder, type OrderStatus } from "../../orders/stateMachine.js";

export interface HandlerResult {
  reply: string;
  intent: string;
  handled: boolean;
}

const NOT_HANDLED: HandlerResult = { reply: "", intent: "", handled: false };

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// ── intent matchers ────────────────────────────────────────

const INTENT_PATTERNS: [RegExp, string][] = [
  [/^(go\s*online|online|start\s*shift|ready)/i, "go_online"],
  [/^(go\s*offline|offline|end\s*shift|stop)/i, "go_offline"],
  [/(earning|kamaya|kitna\s*mila|how\s*much.*made)/i, "check_earnings"],
  [/(guarantee|minimum|floor)/i, "check_guarantee"],
  [/(accept|accept\s*order|take\s*it|lelo)/i, "accept_order"],
  [/(picked\s*up|collected|got\s*it|utha\s*liya)/i, "mark_pickup"],
  [/(delivered|done|handed|de\s*diya)/i, "mark_delivered"],
  [/(direction|navigate|map|rasta|kaise\s*jau)/i, "navigate"],
  [/(issue|problem|can.?t\s*find|not\s*responding|customer\s*not)/i, "report_issue"],
  [/(training|start|module|quiz)/i, "training"],
  [/(hello|hi|good\s*morning|gm)/i, "status_brief"],
];

export function matchRiderIntent(message: string): string | null {
  const text = message.toLowerCase().trim();
  for (const [pattern, intent] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

// ── helpers ────────────────────────────────────────────────

async function getRider(phone: string) {
  const [r] = await db
    .select()
    .from(riders)
    .where(eq(riders.phone, phone))
    .limit(1);
  return r;
}

async function getTodayEarnings(riderId: number) {
  const today = new Date().toISOString().split("T")[0];
  const rows = await db
    .select()
    .from(riderEarnings)
    .where(and(eq(riderEarnings.riderId, riderId), eq(riderEarnings.date, today)));
  const total = rows.reduce((s, r) => s + r.amountPaise, 0);
  const deliveryCount = rows.filter((r) => r.type === "delivery").length;
  return { total, deliveryCount, rows };
}

async function getActiveAssignment(riderId: number) {
  const [a] = await db
    .select()
    .from(deliveryAssignments)
    .where(
      and(
        eq(deliveryAssignments.riderId, riderId),
        inArray(deliveryAssignments.status, ["assigned", "accepted"])
      )
    )
    .orderBy(desc(deliveryAssignments.assignedAt))
    .limit(1);
  return a;
}

// ── dispatch ───────────────────────────────────────────────

export async function handleRiderIntent(
  intent: string,
  phone: string,
  message: string
): Promise<HandlerResult> {
  const rider = await getRider(phone);
  if (!rider) {
    return {
      reply: "I couldn't find your rider profile. Please register first.",
      intent,
      handled: true,
    };
  }

  switch (intent) {
    case "go_online":
      return goOnline(rider);
    case "go_offline":
      return goOffline(rider);
    case "check_earnings":
      return checkEarnings(rider);
    case "check_guarantee":
      return checkGuarantee(rider);
    case "accept_order":
      return acceptOrder(rider);
    case "mark_pickup":
      return markPickup(rider);
    case "mark_delivered":
      return markDelivered(rider);
    case "navigate":
      return navigate(rider);
    case "report_issue":
      return reportIssue(rider, message);
    case "training":
      return training(rider);
    case "status_brief":
      return statusBrief(rider);
    default:
      return NOT_HANDLED;
  }
}

// ── go_online ──────────────────────────────────────────────

async function goOnline(rider: any): Promise<HandlerResult> {
  // Check training completion
  const config = (rider.config as any) || {};
  if (!config.trainingComplete && rider.tier === "new") {
    return {
      reply: "You need to complete training before going online. Type START to begin training.",
      intent: "go_online",
      handled: true,
    };
  }

  await db
    .update(riders)
    .set({
      isOnline: true,
      config: { ...config, lastOnlineAt: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .where(eq(riders.id, rider.id));

  const zone = rider.zone || rider.neighbourhoodSlug || "Indiranagar";
  return {
    reply: `You're online in ${zone}. 🟢 Waiting for orders.`,
    intent: "go_online",
    handled: true,
  };
}

// ── go_offline ─────────────────────────────────────────────

async function goOffline(rider: any): Promise<HandlerResult> {
  await db
    .update(riders)
    .set({ isOnline: false, updatedAt: new Date() })
    .where(eq(riders.id, rider.id));

  const { total, deliveryCount } = await getTodayEarnings(rider.id);

  return {
    reply: `You're offline. 🔴\nToday: ${deliveryCount} deliveries, ${fmtRs(total)}.`,
    intent: "go_offline",
    handled: true,
  };
}

// ── check_earnings ─────────────────────────────────────────

async function checkEarnings(rider: any): Promise<HandlerResult> {
  const { total, deliveryCount, rows } = await getTodayEarnings(rider.id);

  const tips = rows.filter((r) => r.type === "tip").reduce((s, r) => s + r.amountPaise, 0);
  const bonus = rows.filter((r) => r.type === "bonus").reduce((s, r) => s + r.amountPaise, 0);

  let reply = `Today: ${fmtRs(total)} from ${deliveryCount} deliveries.`;
  if (tips > 0) reply += `\nTips: ${fmtRs(tips)}`;
  if (bonus > 0) reply += `\nBonus: ${fmtRs(bonus)}`;
  reply += `\nRating: ${rider.ratingAvg || 5.0}/5`;

  return { reply, intent: "check_earnings", handled: true };
}

// ── check_guarantee ────────────────────────────────────────

async function checkGuarantee(rider: any): Promise<HandlerResult> {
  const config = (rider.config as any) || {};
  const lastOnline = config.lastOnlineAt ? new Date(config.lastOnlineAt) : null;

  // Estimate hours online today (simplified — count from lastOnlineAt to now if online)
  let hoursOnline = 0;
  if (rider.isOnline && lastOnline) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const onlineSince = lastOnline > todayStart ? lastOnline : todayStart;
    hoursOnline = (now.getTime() - onlineSince.getTime()) / 3600000;
  }

  const guaranteeRatePaise = 12000; // ₹120/hr
  const guaranteed = Math.round(hoursOnline * guaranteeRatePaise);
  const { total: earned } = await getTodayEarnings(rider.id);
  const gap = Math.max(0, guaranteed - earned);

  const hrs = hoursOnline.toFixed(1);
  let reply = `Online: ${hrs}hr today.\nGuarantee: ${fmtRs(guaranteed)} (₹120/hr × ${hrs}hr)\nEarned: ${fmtRs(earned)}`;

  if (gap > 0) {
    reply += `\nOoru will top up ${fmtRs(gap)} at 11 PM.`;
  } else {
    reply += `\nYou're above guarantee. Great work! 💪`;
  }

  return { reply, intent: "check_guarantee", handled: true };
}

// ── accept_order ───────────────────────────────────────────

async function acceptOrder(rider: any): Promise<HandlerResult> {
  const assignment = await getActiveAssignment(rider.id);
  if (!assignment) {
    return {
      reply: "No pending order assignment. Stay online and you'll get one soon!",
      intent: "accept_order",
      handled: true,
    };
  }

  await db
    .update(deliveryAssignments)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(deliveryAssignments.id, assignment.id));

  // Get order + merchant details
  const [order] = assignment.orderId
    ? await db.select().from(orders).where(eq(orders.id, assignment.orderId)).limit(1)
    : [null];
  const [merchant] = order?.merchantId
    ? await db.select().from(merchants).where(eq(merchants.id, order.merchantId)).limit(1)
    : [null];

  const address = merchant?.address || "Restaurant address";
  const lat = merchant?.lat || 12.9784;
  const lng = merchant?.lng || 77.6408;
  const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return {
    reply: `Order #${order?.orderNumber || "?"} accepted! 🏍️\nPick up from *${merchant?.name || "Restaurant"}*, ${address}.\n\nNavigate → ${mapsLink}`,
    intent: "accept_order",
    handled: true,
  };
}

// ── mark_pickup ────────────────────────────────────────────

async function markPickup(rider: any): Promise<HandlerResult> {
  const assignment = await getActiveAssignment(rider.id);
  if (!assignment || !assignment.orderId) {
    return { reply: "No active delivery to mark as picked up.", intent: "mark_pickup", handled: true };
  }

  // Advance order status
  await advanceOrder(assignment.orderId, "picked_up" as OrderStatus, "rider");

  const hubLat = 12.9784;
  const hubLng = 77.6408;
  const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${hubLat},${hubLng}`;

  return {
    reply: `Picked up! 📦 Take to Hub A at 100 Feet Road.\n\nNavigate → ${mapsLink}`,
    intent: "mark_pickup",
    handled: true,
  };
}

// ── mark_delivered ─────────────────────────────────────────

async function markDelivered(rider: any): Promise<HandlerResult> {
  const assignment = await getActiveAssignment(rider.id);
  if (!assignment || !assignment.orderId) {
    return { reply: "No active delivery to mark as delivered.", intent: "mark_delivered", handled: true };
  }

  // Advance order to delivered
  await advanceOrder(assignment.orderId, "delivered" as OrderStatus, "rider");

  // Complete assignment
  await db
    .update(deliveryAssignments)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(deliveryAssignments.id, assignment.id));

  // Record earnings
  const deliveryFee = 3000; // ₹30 per delivery
  const today = new Date().toISOString().split("T")[0];
  await db.insert(riderEarnings).values({
    riderId: rider.id,
    orderId: assignment.orderId,
    date: today,
    amountPaise: deliveryFee,
    type: "delivery",
  });

  // Update rider stats
  await db
    .update(riders)
    .set({
      totalDeliveries: (rider.totalDeliveries || 0) + 1,
      earningsTodayPaise: (rider.earningsTodayPaise || 0) + deliveryFee,
      updatedAt: new Date(),
    })
    .where(eq(riders.id, rider.id));

  return {
    reply: `Delivered! ✅ ${fmtRs(deliveryFee)} added to today's earnings.`,
    intent: "mark_delivered",
    handled: true,
  };
}

// ── navigate ───────────────────────────────────────────────

async function navigate(rider: any): Promise<HandlerResult> {
  const assignment = await getActiveAssignment(rider.id);
  if (!assignment || !assignment.orderId) {
    return { reply: "No active delivery. Go online to get orders.", intent: "navigate", handled: true };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, assignment.orderId)).limit(1);
  if (!order) return { reply: "Order not found.", intent: "navigate", handled: true };

  // Determine destination based on order status
  let lat: number, lng: number, label: string;
  if (order.status === "pickup_assigned" || order.status === "accepted") {
    const [m] = order.merchantId
      ? await db.select().from(merchants).where(eq(merchants.id, order.merchantId)).limit(1)
      : [null];
    lat = m?.lat || 12.9784;
    lng = m?.lng || 77.6408;
    label = m?.name || "Restaurant";
  } else if (order.deliveryLat && order.deliveryLng) {
    lat = order.deliveryLat;
    lng = order.deliveryLng;
    label = "Customer";
  } else {
    lat = 12.9784;
    lng = 77.6408;
    label = "Hub A";
  }

  const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return {
    reply: `Navigate to ${label} → ${mapsLink}`,
    intent: "navigate",
    handled: true,
  };
}

// ── report_issue ───────────────────────────────────────────

async function reportIssue(rider: any, message: string): Promise<HandlerResult> {
  console.log(`[rider-issue] Rider ${rider.name} (${rider.phone}): ${message}`);
  return {
    reply: "Logged. Continue to next step and we'll follow up. If it's urgent, call support.",
    intent: "report_issue",
    handled: true,
  };
}

// ── training ───────────────────────────────────────────────

async function training(rider: any): Promise<HandlerResult> {
  const config = (rider.config as any) || {};

  if (config.trainingComplete) {
    return {
      reply: "You've completed all training modules! You're cleared to go online.",
      intent: "training",
      handled: true,
    };
  }

  const modules = ["Platform Basics", "Hub Operations", "Delivery Excellence", "Safety", "Neighbourhood Sensing"];
  const completed = config.trainingModules || 0;

  if (completed >= modules.length) {
    await db
      .update(riders)
      .set({
        config: { ...config, trainingComplete: true, trainingModules: modules.length },
        tier: "active",
        updatedAt: new Date(),
      })
      .where(eq(riders.id, rider.id));

    return {
      reply: "🎓 Training complete! You're now an *active* rider.\nType 'go online' to start accepting deliveries.",
      intent: "training",
      handled: true,
    };
  }

  // Auto-pass module for demo (real quiz in P9)
  const nextModule = modules[completed];
  await db
    .update(riders)
    .set({
      config: { ...config, trainingModules: completed + 1 },
      updatedAt: new Date(),
    })
    .where(eq(riders.id, rider.id));

  const remaining = modules.length - completed - 1;

  return {
    reply: `✅ Module ${completed + 1}: *${nextModule}* — passed!\n${remaining > 0 ? `${remaining} modules remaining. Type START for next.` : "All modules done! Type START to finalize."}`,
    intent: "training",
    handled: true,
  };
}

// ── status_brief ───────────────────────────────────────────

async function statusBrief(rider: any): Promise<HandlerResult> {
  const { total, deliveryCount } = await getTodayEarnings(rider.id);
  const status = rider.isOnline ? "🟢 Online" : "🔴 Offline";

  return {
    reply: `Hey ${rider.name}! ${status}\nToday: ${deliveryCount} deliveries, ${fmtRs(total)}\nRating: ${rider.ratingAvg || 5.0}/5 | Tier: ${rider.tier}`,
    intent: "status_brief",
    handled: true,
  };
}
