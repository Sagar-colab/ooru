import { db } from "../../db/index.js";
import {
  merchants,
  menuItems,
  orders,
  consumers,
  conversations,
  ratings,
  neighbourhoodBcfs,
} from "../../db/schema.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { fuzzyMatchItem } from "../utils/fuzzyMatch.js";
import { generateOrderNumber, cancelOrder } from "../../orders/stateMachine.js";
import { emitToMerchant } from "../../socket.js";
import { sendWhatsApp } from "../gupshup.js";

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
  [/^(👍|👎)$/i, "rate"],
  [/(rate|review|feedback|stars?)\s/i, "rate"],
  [/(what.*(eat|order|food|open|hungry)|hungry|recommend|suggest|near\s*me|discover|restaurants?)/i, "discover"],
  [/(i\s*want|order|get\s*me|can\s*i\s*have|add|gimme)\s+/i, "order"],
  [/(same\s*as\s*last|usual\s*order|reorder|order\s*again|last\s*order)/i, "reorder"],
  [/(where|track|status|eta|how\s*long|my\s*order)/i, "track"],
  [/(cancel|don.?t\s*want|stop\s*order)/i, "cancel"],
  [/(confirm|yes\s*order|place\s*it|go\s*ahead)/i, "confirm_order"],
  [/(pothole|broken|garbage|water\s*leak|street\s*light|flooding|sewage|report|complaint|issue)/i, "report_issue"],
];

export function matchConsumerIntent(message: string): string | null {
  const text = message.toLowerCase().trim();
  for (const [pattern, intent] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

// ── dispatch ───────────────────────────────────────────────

export async function handleConsumerIntent(
  intent: string,
  phone: string,
  message: string
): Promise<HandlerResult> {
  switch (intent) {
    case "discover":
      return discover(phone);
    case "order":
      return startOrder(phone, message);
    case "reorder":
      return reorder(phone);
    case "track":
      return track(phone);
    case "cancel":
      return cancelConsumerOrder(phone);
    case "rate":
      return rate(phone, message);
    case "confirm_order":
      return confirmOrder(phone);
    case "report_issue":
      return reportIssue(phone, message);
    default:
      return NOT_HANDLED;
  }
}

// ── discover ───────────────────────────────────────────────

async function discover(phone: string): Promise<HandlerResult> {
  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);

  const slug = consumer?.neighbourhoodSlug || "indiranagar";
  const allMerchants = await db
    .select()
    .from(merchants)
    .where(eq(merchants.neighbourhoodSlug, slug));

  const openMerchants = allMerchants.filter((m) => m.isOpen);
  if (openMerchants.length === 0) {
    return {
      reply: "No restaurants are open right now. Check back in a bit!",
      intent: "discover",
      handled: true,
    };
  }

  // Get menu items for price range
  const items = await db.select().from(menuItems).limit(50);

  const top3 = openMerchants.slice(0, 3);
  const lines = top3.map((m) => {
    const mItems = items.filter((i) => i.merchantId === m.id && i.isAvailable);
    const prices = mItems.map((i) => i.pricePaise);
    const minP = prices.length ? Math.min(...prices) : 0;
    const maxP = prices.length ? Math.max(...prices) : 0;
    const cuisine = (m.cuisine || []).join(", ");
    return `🍽️ *${m.name}* [${cuisine}]\n   ${fmtRs(minP)}–${fmtRs(maxP)} · ${mItems.length} items`;
  });

  const reply = `Here's what's open near you:\n\n${lines.join("\n\n")}\n\nReply with a restaurant name to see the menu!`;
  return { reply, intent: "discover", handled: true };
}

// ── order ──────────────────────────────────────────────────

async function startOrder(phone: string, message: string): Promise<HandlerResult> {
  // Parse: "I want masala dosa from Brahmin's" or "order biryani"
  const fromMatch = message.match(/from\s+(.+?)$/i);
  const merchantName = fromMatch?.[1]?.trim();

  // Find merchant
  let merchant: any;
  if (merchantName) {
    const allMerchants = await db.select().from(merchants);
    const match = fuzzyMatchItem(
      allMerchants.map((m) => ({ ...m, name: m.name })),
      merchantName
    );
    merchant = match;
  }

  if (!merchant) {
    // Try to find from the item name
    const allMerchants = await db.select().from(merchants).limit(10);
    if (allMerchants.length === 1) {
      merchant = allMerchants[0];
    } else {
      return {
        reply: "Which restaurant? Reply with the name, e.g.: \"order from Meghana Foods\"",
        intent: "order",
        handled: true,
      };
    }
  }

  // Extract item keywords (remove "I want", "order", "from X")
  let itemQuery = message
    .replace(/^(i\s*want|order|get\s*me|can\s*i\s*have|add|gimme)\s+/i, "")
    .replace(/\s+from\s+.+$/i, "")
    .trim();

  // Parse quantity: "2 chicken biryani" → qty=2, item="chicken biryani"
  let qty = 1;
  const qtyMatch = itemQuery.match(/^(\d+)\s+(.+)$/);
  if (qtyMatch) {
    qty = parseInt(qtyMatch[1]);
    itemQuery = qtyMatch[2];
  }

  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.merchantId, merchant.id));

  const availableItems = items.filter((i) => i.isAvailable);
  const matched = itemQuery
    ? fuzzyMatchItem(availableItems, itemQuery)
    : null;

  // Store pending order in conversation state
  const pendingItems = matched
    ? [{ id: matched.id, name: matched.name, qty, pricePaise: matched.pricePaise }]
    : [];

  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.phone, phone))
    .limit(1);

  const pendingOrder = {
    merchantId: merchant.id,
    merchantName: merchant.name,
    items: pendingItems,
    step: "pending_confirmation",
  };

  if (convo) {
    await db
      .update(conversations)
      .set({ state: { ...((convo.state as any) || {}), pendingOrder } })
      .where(eq(conversations.id, convo.id));
  }

  if (matched) {
    const total = matched.pricePaise * qty;
    return {
      reply: `From *${merchant.name}*:\n• ${matched.name} × ${qty} — ${fmtRs(total)}\n\nTotal: ${fmtRs(total)}\n\nReply *confirm* to place this order, or add more items.`,
      intent: "order",
      handled: true,
    };
  }

  // Show menu highlights
  const top5 = availableItems.slice(0, 5);
  const menuList = top5
    .map((i) => `• ${i.name} — ${fmtRs(i.pricePaise)}`)
    .join("\n");

  return {
    reply: `Here's what's available at *${merchant.name}*:\n\n${menuList}\n\nTell me what you'd like!`,
    intent: "order",
    handled: true,
  };
}

// ── confirm order ──────────────────────────────────────────

async function confirmOrder(phone: string): Promise<HandlerResult> {
  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.phone, phone))
    .limit(1);

  const pending = (convo?.state as any)?.pendingOrder;
  if (!pending || !pending.items?.length) {
    return {
      reply: "No pending order to confirm. Tell me what you'd like to order!",
      intent: "confirm_order",
      handled: true,
    };
  }

  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);

  const subtotal = pending.items.reduce(
    (s: number, i: any) => s + i.pricePaise * i.qty,
    0
  );
  const gst = Math.round(subtotal * 0.05);
  const deliveryFee = 2500; // ₹25 flat
  const total = subtotal + gst + deliveryFee;

  const orderNumber = await generateOrderNumber(pending.merchantId);

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber,
      consumerId: consumer?.id || null,
      merchantId: pending.merchantId,
      status: "placed",
      orderType: "delivery",
      items: pending.items,
      subtotalPaise: subtotal,
      gstPaise: gst,
      deliveryFeePaise: deliveryFee,
      totalPaise: total,
      paymentMethod: "upi",
      paymentStatus: "paid", // Mock Razorpay — instant payment
      neighbourhoodSlug: consumer?.neighbourhoodSlug || "indiranagar",
    })
    .returning();

  // Update consumer order count
  if (consumer) {
    await db
      .update(consumers)
      .set({
        orderCount: (consumer.orderCount || 0) + 1,
        lastOrderMerchantId: pending.merchantId,
        updatedAt: new Date(),
      })
      .where(eq(consumers.id, consumer.id));
  }

  // Emit to KDS
  emitToMerchant(pending.merchantId, "order:new", order);

  // Notify merchant via WhatsApp
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, pending.merchantId))
    .limit(1);

  if (merchant) {
    const itemList = pending.items.map((i: any) => `${i.name} × ${i.qty}`).join(", ");
    sendWhatsApp(
      merchant.phone,
      `New order #${orderNumber}! ${itemList}. Total: ${fmtRs(total)}. Reply ACCEPT or open KDS.`
    );
  }

  // Clear pending order from conversation
  if (convo) {
    const newState = { ...((convo.state as any) || {}) };
    delete newState.pendingOrder;
    await db
      .update(conversations)
      .set({ state: newState })
      .where(eq(conversations.id, convo.id));
  }

  // Build receipt
  const itemLines = pending.items
    .map((i: any) => `• ${i.name} × ${i.qty} — ${fmtRs(i.pricePaise * i.qty)}`)
    .join("\n");

  const receipt = `Receipt #${orderNumber}
${itemLines}
Subtotal: ${fmtRs(subtotal)}
GST (5%): ${fmtRs(gst)}
Delivery: ${fmtRs(deliveryFee)}
*Total: ${fmtRs(total)}*
Payment: UPI ✓`;

  return {
    reply: `Order placed! 🎉\n\n${receipt}\n\n${pending.merchantName} will confirm shortly. I'll keep you updated!`,
    intent: "confirm_order",
    handled: true,
  };
}

// ── reorder ────────────────────────────────────────────────

async function reorder(phone: string): Promise<HandlerResult> {
  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);

  if (!consumer) {
    return {
      reply: "I don't have a previous order for you. What would you like?",
      intent: "reorder",
      handled: true,
    };
  }

  const [lastOrder] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.consumerId, consumer.id),
        eq(orders.status, "delivered")
      )
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!lastOrder) {
    return {
      reply: "I don't have a previous order for you. What would you like?",
      intent: "reorder",
      handled: true,
    };
  }

  const items = (lastOrder.items as any[]) || [];
  const [merchant] = lastOrder.merchantId
    ? await db.select().from(merchants).where(eq(merchants.id, lastOrder.merchantId)).limit(1)
    : [null];

  // Store as pending
  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.phone, phone))
    .limit(1);

  if (convo) {
    await db
      .update(conversations)
      .set({
        state: {
          ...((convo.state as any) || {}),
          pendingOrder: {
            merchantId: lastOrder.merchantId,
            merchantName: merchant?.name || "Restaurant",
            items,
            step: "pending_confirmation",
          },
        },
      })
      .where(eq(conversations.id, convo.id));
  }

  const itemList = items.map((i: any) => `• ${i.name} × ${i.qty || 1}`).join("\n");
  const total = lastOrder.totalPaise;

  return {
    reply: `Your last order from *${merchant?.name || "Restaurant"}*:\n${itemList}\n\nTotal was ${fmtRs(total)}.\nReply *confirm* to reorder!`,
    intent: "reorder",
    handled: true,
  };
}

// ── track ──────────────────────────────────────────────────

async function track(phone: string): Promise<HandlerResult> {
  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);

  if (!consumer) {
    return { reply: "No active orders found.", intent: "track", handled: true };
  }

  const activeStatuses = ["placed", "accepted", "preparing", "ready", "pickup_assigned", "picked_up", "at_hub", "lastmile_assigned", "out_for_delivery", "at_gate"];

  const [activeOrder] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.consumerId, consumer.id),
        inArray(orders.status, activeStatuses)
      )
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!activeOrder) {
    return { reply: "No active orders right now.", intent: "track", handled: true };
  }

  const [merchant] = activeOrder.merchantId
    ? await db.select().from(merchants).where(eq(merchants.id, activeOrder.merchantId)).limit(1)
    : [null];

  const statusMessages: Record<string, string> = {
    placed: `Your order *${activeOrder.orderNumber}* is placed. Waiting for ${merchant?.name || "restaurant"} to accept.`,
    accepted: `${merchant?.name || "Restaurant"} has accepted your order! They're getting it ready.`,
    preparing: `Your food is being prepared at ${merchant?.name || "restaurant"}. ETA ~15 minutes.`,
    ready: `Your order is ready for pickup! A rider will be assigned soon.`,
    pickup_assigned: `A rider has been assigned. They're heading to ${merchant?.name || "restaurant"}.`,
    picked_up: `Your order has been picked up and is on the way!`,
    at_hub: `Your order is at the local hub. Almost there!`,
    lastmile_assigned: `A delivery rider is heading to you now.`,
    out_for_delivery: `Your order is out for delivery! ETA ~5 minutes. 🏍️`,
    at_gate: `Your rider is at the gate! 📦`,
  };

  const msg = statusMessages[activeOrder.status || ""] || `Status: ${activeOrder.status}`;
  return { reply: msg, intent: "track", handled: true };
}

// ── cancel ─────────────────────────────────────────────────

async function cancelConsumerOrder(phone: string): Promise<HandlerResult> {
  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);

  if (!consumer) {
    return { reply: "No active orders to cancel.", intent: "cancel", handled: true };
  }

  const cancelableStatuses = ["placed", "accepted"];
  const [activeOrder] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.consumerId, consumer.id),
        inArray(orders.status, cancelableStatuses)
      )
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!activeOrder) {
    return {
      reply: "Your order is already being prepared. If there's an issue, reply 'complaint'.",
      intent: "cancel",
      handled: true,
    };
  }

  const result = await cancelOrder(activeOrder.id, "consumer");
  if (!result.success) {
    return { reply: result.error || "Unable to cancel.", intent: "cancel", handled: true };
  }

  const refundMsg = result.refundType === "full_refund"
    ? `Refund of ${fmtRs(activeOrder.totalPaise)} will be processed.`
    : "Please contact support for refund.";

  return {
    reply: `Order *${activeOrder.orderNumber}* cancelled. ${refundMsg}`,
    intent: "cancel",
    handled: true,
  };
}

// ── rate ───────────────────────────────────────────────────

async function rate(phone: string, message: string): Promise<HandlerResult> {
  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);

  if (!consumer) {
    return { reply: "Thanks for the feedback!", intent: "rate", handled: true };
  }

  // Check conversation state for awaitingRating
  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.phone, phone))
    .limit(1);

  const state = (convo?.state as any) || {};
  const awaitingOrderId = state.awaitingRating;
  const awaitingMerchantId = state.awaitingRatingMerchantId;

  // Handle complaint category selection (after 👎)
  if (state.awaitingComplaintCategory && awaitingOrderId) {
    const categories: Record<string, string> = {
      "1": "wrong_items",
      "2": "cold_food",
      "3": "late_delivery",
      "4": "other",
    };
    const category = categories[message.trim()] || "other";

    await db.insert(ratings).values({
      orderId: awaitingOrderId,
      consumerId: consumer.id,
      merchantId: awaitingMerchantId,
      score: 1,
      complaintCategory: category,
    });

    // Clear rating state
    const newState = { ...state };
    delete newState.awaitingRating;
    delete newState.awaitingRatingMerchantId;
    delete newState.awaitingComplaintCategory;
    if (convo) {
      await db.update(conversations).set({ state: newState }).where(eq(conversations.id, convo.id));
    }

    return {
      reply: "Thanks for telling us. We'll look into it and make sure it doesn't happen again. 🙏",
      intent: "rate",
      handled: true,
    };
  }

  // Find the order to rate
  let orderId = awaitingOrderId;
  let merchantId = awaitingMerchantId;

  if (!orderId) {
    const [lastDelivered] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.consumerId, consumer.id), eq(orders.status, "delivered")))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    if (!lastDelivered) {
      return { reply: "No recent order to rate.", intent: "rate", handled: true };
    }
    orderId = lastDelivered.id;
    merchantId = lastDelivered.merchantId;
  }

  const isPositive = /👍|good|great|awesome|loved|nice|perfect|5/i.test(message);
  const isNegative = /👎|bad|terrible|worst|cold|late|wrong/i.test(message);

  if (isPositive) {
    // Insert 5-star rating
    await db.insert(ratings).values({
      orderId,
      consumerId: consumer.id,
      merchantId,
      score: 5,
    });

    // Update taste profile
    if (merchantId) {
      const [merchant] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);

      const profile = (consumer.tasteProfile as any) || {};
      const cuisines = merchant?.cuisine || [];
      for (const c of cuisines) {
        profile[c] = (profile[c] || 0) + 1;
      }
      await db
        .update(consumers)
        .set({ tasteProfile: profile, updatedAt: new Date() })
        .where(eq(consumers.id, consumer.id));
    }

    // Clear rating state
    if (convo) {
      const newState = { ...state };
      delete newState.awaitingRating;
      delete newState.awaitingRatingMerchantId;
      await db.update(conversations).set({ state: newState }).where(eq(conversations.id, convo.id));
    }

    return {
      reply: "Glad you liked it! 😊 We'll remember your preferences.",
      intent: "rate",
      handled: true,
    };
  }

  if (isNegative) {
    // Set complaint flow
    if (convo) {
      await db
        .update(conversations)
        .set({
          state: { ...state, awaitingComplaintCategory: true },
        })
        .where(eq(conversations.id, convo.id));
    }

    return {
      reply: "Sorry about that! What went wrong?\n1️⃣ Wrong items\n2️⃣ Cold food\n3️⃣ Late delivery\n4️⃣ Other",
      intent: "rate",
      handled: true,
    };
  }

  return {
    reply: "How was your last order? Reply 👍 or 👎",
    intent: "rate",
    handled: true,
  };
}

// ── report_issue ───────────────────────────────────────────

async function reportIssue(phone: string, message: string): Promise<HandlerResult> {
  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);

  const slug = consumer?.neighbourhoodSlug || "indiranagar";

  // Detect category from keywords
  const categories: [RegExp, string][] = [
    [/(pothole|road|crack|bump)/i, "road"],
    [/(water|leak|pipe|flood|sewage|drain)/i, "water"],
    [/(light|lamp|dark|street\s*light)/i, "light"],
    [/(garbage|waste|trash|dump|litter)/i, "waste"],
    [/(noise|loud|construction)/i, "noise"],
  ];

  let category = "general";
  for (const [pattern, cat] of categories) {
    if (pattern.test(message)) { category = cat; break; }
  }

  const title = message
    .replace(/(report|complaint|issue|there\s*is\s*(a|an)?)/gi, "")
    .trim()
    .slice(0, 100);

  const phoneHash = phone.slice(-4);

  const [bcf] = await db
    .insert(neighbourhoodBcfs)
    .values({
      neighbourhoodSlug: slug,
      reporterPhoneHash: phoneHash,
      category,
      title: title || "Issue reported",
      description: message,
    })
    .returning();

  return {
    reply: `Reported! BCF #BCF-${bcf.id} created for "${title || "Issue"}". Your report is on the map. 📍`,
    intent: "report_issue",
    handled: true,
  };
}
