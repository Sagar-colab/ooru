import { db } from "../../db/index.js";
import {
  shopBusinesses,
  udharLedger,
  shopInventory,
  shopAppointments,
  shopJobCards,
  orders,
} from "../../db/schema.js";
import { eq, and, lt, sql, desc } from "drizzle-orm";

// ── handler result ─────────────────────────────────────────

export interface HandlerResult {
  reply: string;
  intent: string;
  handled: boolean;
}

const NOT_HANDLED: HandlerResult = { reply: "", intent: "", handled: false };

// ── helpers ────────────────────────────────────────────────

async function getShop(phone: string) {
  const [shop] = await db
    .select()
    .from(shopBusinesses)
    .where(eq(shopBusinesses.phone, phone))
    .limit(1);
  return shop;
}

async function getUdharSummary(shopId: number) {
  const ledger = await db
    .select()
    .from(udharLedger)
    .where(eq(udharLedger.shopBusinessId, shopId));

  const byCustomer = new Map<string, { total: number; oldest: Date | null }>();
  for (const entry of ledger) {
    const name = entry.customerName;
    const current = byCustomer.get(name) || { total: 0, oldest: null };
    if (entry.transactionType === "credit") {
      current.total += entry.amountPaise;
    } else {
      current.total -= entry.amountPaise;
    }
    const ts = entry.createdAt ? new Date(entry.createdAt) : null;
    if (ts && (!current.oldest || ts < current.oldest)) {
      current.oldest = ts;
    }
    byCustomer.set(name, current);
  }

  return { ledger, byCustomer };
}

// ── intent matchers ────────────────────────────────────────

const INTENT_PATTERNS: [RegExp, string][] = [
  [/^(good\s*morning|gm|subah|suprabhat|hello|hi)/i, "morning_brief"],
  [/(sold|sale|becha|bikri)\s/i, "record_sale"],
  [/(remind|yaad\s*dila)\s/i, "udhar_remind"],
  [/(paid|payment|bhugtan|chukaya)\s/i, "udhar_payment"],
  [/(got|received|supplier|stock\s*update|restock)\s.*(\d+)/i, "stock_update"],
  [/(appointment|booking|appt)\s/i, "book_appointment"],
  [/(received|accepted).*('s|s)\s.*(for|repair|fix|service)/i, "job_card_create"],
  [/('s|s)\s.*(ready|done|complete|tayyar)/i, "job_card_update"],
  [/(job\s*card|jc)/i, "job_card_create"],
  [/(revenue|sales|earn|income|kamai|kitna\s*(hua|kamaya))/i, "check_revenue"],
  [/(udhar|udhaar|credit|loan|baki).*(check|how\s*much|kitna|total|list|show)/i, "udhar_check"],
  [/(add|likh|log|record).*(udhar|udhaar|credit|baki)/i, "udhar_add"],
  [/(udhar|udhaar|credit|baki).*(add|likh|log|record)/i, "udhar_add"],
  [/(stock|inventory|maal|saman)/i, "stock_check"],
  [/(gst|gstin|gstr|tax)/i, "gst_query"],
  [/(pnl|profit|loss|p&l|daily\s*report|weekly|last\s*\d+\s*days|week\s*summary)/i, "check_daily_pnl"],
  [/(how\s*much).*(owe|baki|udhar)/i, "udhar_check"],
  [/(owe|baki).*(how\s*much)/i, "udhar_check"],
];

export function matchShopOwnerIntent(message: string): string | null {
  const text = message.toLowerCase().trim();
  for (const [pattern, intent] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

// ── handlers ───────────────────────────────────────────────

export async function handleShopOwnerIntent(
  intent: string,
  phone: string,
  message: string
): Promise<HandlerResult> {
  const shop = await getShop(phone);
  if (!shop) return { reply: "I couldn't find your shop. Please register first.", intent, handled: true };

  switch (intent) {
    case "morning_brief":
      return morningBrief(shop);
    case "record_sale":
      return recordSale(shop, message);
    case "check_revenue":
      return checkRevenue(shop);
    case "udhar_check":
      return udharCheck(shop, message);
    case "udhar_add":
      return udharAdd(shop, message);
    case "udhar_payment":
      return udharPayment(shop, message);
    case "udhar_remind":
      return udharRemind(shop, message);
    case "stock_check":
      return stockCheck(shop);
    case "stock_update":
      return stockUpdate(shop, message);
    case "gst_query":
      return gstQuery(shop);
    case "check_daily_pnl":
      return checkDailyPnl(shop);
    case "book_appointment":
      return bookAppointment(shop, message);
    case "job_card_create":
      return jobCardCreate(shop, message);
    case "job_card_update":
      return jobCardUpdate(shop, message);
    default:
      return NOT_HANDLED;
  }
}

// ── morning_brief ──────────────────────────────────────────

async function morningBrief(shop: any): Promise<HandlerResult> {
  const { byCustomer } = await getUdharSummary(shop.id);

  let udharTotal = 0;
  let udharCount = 0;
  for (const [_, v] of byCustomer) {
    if (v.total > 0) {
      udharTotal += v.total;
      udharCount++;
    }
  }

  // Count recent orders (today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const reply = `Good morning! ${shop.businessName} update:
${udharCount > 0 ? `${udharCount} udhar entries outstanding (${fmtRs(udharTotal)}).` : "No udhar outstanding."}
Have a great day!`;

  return { reply, intent: "morning_brief", handled: true };
}

// ── check_revenue ──────────────────────────────────────────

async function checkRevenue(shop: any): Promise<HandlerResult> {
  // For shops (not merchants), we don't have order data directly
  // Check if there's a linked merchant or just report udhar activity
  const { ledger } = await getUdharSummary(shop.id);

  const today = new Date().toDateString();
  const todayEntries = ledger.filter(
    (e) => e.createdAt && new Date(e.createdAt).toDateString() === today
  );
  const todayCredits = todayEntries
    .filter((e) => e.transactionType === "credit")
    .reduce((s, e) => s + e.amountPaise, 0);

  const reply = `Today so far: ${fmtRs(todayCredits)} from ${todayEntries.length} transactions.`;
  return { reply, intent: "check_revenue", handled: true };
}

// ── udhar_check ────────────────────────────────────────────

async function udharCheck(shop: any, message: string): Promise<HandlerResult> {
  const { byCustomer } = await getUdharSummary(shop.id);

  // Check if asking about a specific customer
  const STOP_WORDS = new Set(["does", "how", "much", "what", "the", "is", "owe", "owes", "total", "check", "udhar", "udhaar", "credit", "baki"]);
  // Look for proper nouns — capitalized words that aren't stop words
  const words = message.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  const candidateName = words.find((w) => !STOP_WORDS.has(w.toLowerCase()));
  if (candidateName) {
    const searchName = candidateName.toLowerCase();
    for (const [name, data] of byCustomer) {
      if (name.toLowerCase().includes(searchName)) {
        if (data.total > 0) {
          return {
            reply: `${name} owes ${fmtRs(data.total)}.`,
            intent: "udhar_check",
            handled: true,
          };
        } else {
          return {
            reply: `${name} has no outstanding udhar.`,
            intent: "udhar_check",
            handled: true,
          };
        }
      }
    }
    return {
      reply: `No udhar records found for "${candidateName}".`,
      intent: "udhar_check",
      handled: true,
    };
  }

  // General check
  let total = 0;
  let count = 0;
  let oldestName = "";
  let oldestDays = 0;

  for (const [name, data] of byCustomer) {
    if (data.total > 0) {
      total += data.total;
      count++;
      if (data.oldest) {
        const days = Math.floor((Date.now() - data.oldest.getTime()) / 86400000);
        if (days > oldestDays) {
          oldestDays = days;
          oldestName = name;
        }
      }
    }
  }

  if (count === 0) {
    return { reply: "No outstanding udhar. All clear!", intent: "udhar_check", handled: true };
  }

  let reply = `Outstanding udhar: ${fmtRs(total)} across ${count} customer${count > 1 ? "s" : ""}.`;
  if (oldestName) {
    reply += `\nOldest: ${oldestName}, ${oldestDays} day${oldestDays !== 1 ? "s" : ""}.`;
  }

  return { reply, intent: "udhar_check", handled: true };
}

// ── udhar_add ──────────────────────────────────────────────

async function udharAdd(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "add udhar for Suresh 500 rupees" or "log 200 udhar for Meena"
  const nameAmountMatch = message.match(
    /(?:for|of)\s+([A-Za-z]+)\s+(?:rs\.?|₹|rupees?)?\s*(\d+)/i
  );
  const amountNameMatch = message.match(
    /(\d+)\s*(?:rs\.?|₹|rupees?)?\s+(?:for|of|udhar|udhaar)?\s*(?:for)?\s*([A-Za-z]+)/i
  );

  let customerName: string | null = null;
  let amount: number | null = null;

  if (nameAmountMatch) {
    customerName = nameAmountMatch[1];
    amount = parseInt(nameAmountMatch[2]);
  } else if (amountNameMatch) {
    amount = parseInt(amountNameMatch[1]);
    customerName = amountNameMatch[2];
    // Filter out common keywords
    if (["udhar", "udhaar", "credit", "rupees", "rs"].includes(customerName.toLowerCase())) {
      customerName = null;
    }
  }

  if (!customerName || !amount || isNaN(amount)) {
    return {
      reply: "Please specify the customer name and amount. E.g.: \"add udhar for Suresh 500\"",
      intent: "udhar_add",
      handled: true,
    };
  }

  const amountPaise = amount * 100;

  await db.insert(udharLedger).values({
    shopBusinessId: shop.id,
    customerName,
    amountPaise,
    transactionType: "credit",
    note: `Added via WhatsApp: "${message}"`,
  });

  // Get new total for this customer
  const { byCustomer } = await getUdharSummary(shop.id);
  const customerData = byCustomer.get(customerName);
  const total = customerData?.total || amountPaise;

  return {
    reply: `Added ${fmtRs(amountPaise)} for ${customerName}. Total they owe: ${fmtRs(total)}.`,
    intent: "udhar_add",
    handled: true,
  };
}

// ── stock_check ────────────────────────────────────────────

async function stockCheck(shop: any): Promise<HandlerResult> {
  const items = await db
    .select()
    .from(shopInventory)
    .where(eq(shopInventory.shopBusinessId, shop.id));

  if (items.length === 0) {
    return {
      reply: "No inventory tracked yet. Want me to help you set up stock tracking?",
      intent: "stock_check",
      handled: true,
    };
  }

  const lowStock = items.filter(
    (i) => (i.quantityOnHand || 0) <= (i.reorderLevel || 5)
  );

  if (lowStock.length === 0) {
    return {
      reply: `All ${items.length} items are well stocked. Everything looks fine!`,
      intent: "stock_check",
      handled: true,
    };
  }

  const list = lowStock
    .slice(0, 5)
    .map((i) => `${i.itemName} (${i.quantityOnHand} left)`)
    .join(", ");

  return {
    reply: `Low stock: ${list}.${lowStock.length > 5 ? ` +${lowStock.length - 5} more.` : ""} Everything else looks fine.`,
    intent: "stock_check",
    handled: true,
  };
}

// ── gst_query ──────────────────────────────────────────────

async function gstQuery(shop: any): Promise<HandlerResult> {
  if (shop.gstNumber) {
    return {
      reply: `You're registered under GST (${shop.gstNumber}). GSTR-1 is due on the 11th of next month. Want me to help you prepare?`,
      intent: "gst_query",
      handled: true,
    };
  }

  return {
    reply: `Your turnover will determine if you need to register. Threshold is ₹20L for services, ₹40L for goods. What's your approximate monthly revenue?`,
    intent: "gst_query",
    handled: true,
  };
}

// ── check_daily_pnl ────────────────────────────────────────

async function checkDailyPnl(shop: any): Promise<HandlerResult> {
  const { ledger } = await getUdharSummary(shop.id);

  // Group by day for last 7 days
  const days = new Map<string, { credits: number; debits: number }>();
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.set(d.toDateString(), { credits: 0, debits: 0 });
  }

  for (const entry of ledger) {
    const day = entry.createdAt ? new Date(entry.createdAt).toDateString() : null;
    if (day && days.has(day)) {
      const d = days.get(day)!;
      if (entry.transactionType === "credit") d.credits += entry.amountPaise;
      else d.debits += entry.amountPaise;
    }
  }

  let table = "Last 7 days:\n";
  for (const [day, data] of days) {
    const date = new Date(day);
    const label = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
    table += `${label}: +${fmtRs(data.credits)} / -${fmtRs(data.debits)}\n`;
  }

  return { reply: table.trim(), intent: "check_daily_pnl", handled: true };
}

// ── record_sale ────────────────────────────────────────────

async function recordSale(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "sold 2 biryani for 560" or "sale 420" or "sold biryani 280"
  const amountMatch = message.match(/(\d+)\s*(?:rs\.?|₹|rupees?)?/i);
  if (!amountMatch) {
    return {
      reply: 'Tell me the amount. E.g.: "sold biryani for 280" or "sale 420"',
      intent: "record_sale",
      handled: true,
    };
  }

  const amount = parseInt(amountMatch[1]);
  if (amount > 10000) {
    // Likely a quantity, not price — "sold 2 biryani for 560"
    const priceMatch = message.match(/(?:for|at|₹|rs)\s*(\d+)/i);
    if (priceMatch) {
      const paise = parseInt(priceMatch[1]) * 100;
      return doRecordSale(shop, paise);
    }
  }
  return doRecordSale(shop, amount * 100);
}

async function doRecordSale(shop: any, amountPaise: number): Promise<HandlerResult> {
  // Get today's running total
  const { ledger } = await getUdharSummary(shop.id);
  const today = new Date().toDateString();
  const todaySales = ledger
    .filter((e) => e.createdAt && new Date(e.createdAt).toDateString() === today && e.transactionType === "credit")
    .reduce((s, e) => s + e.amountPaise, 0);

  // Record as a credit entry (sale = money in)
  await db.insert(udharLedger).values({
    shopBusinessId: shop.id,
    customerName: "Walk-in Sale",
    amountPaise,
    transactionType: "debit", // debit = money received
    note: "POS walk-in sale",
  });

  return {
    reply: `Recorded ${fmtRs(amountPaise)}. Today's total: ${fmtRs(todaySales + amountPaise)}.`,
    intent: "record_sale",
    handled: true,
  };
}

// ── udhar_payment ──────────────────────────────────────────

async function udharPayment(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "Kavitha paid 200" or "received 300 from Suresh"
  const match1 = message.match(/([A-Z][a-z]+)\s+paid\s+(\d+)/i);
  const match2 = message.match(/received\s+(\d+)\s+from\s+([A-Z][a-z]+)/i);

  let customerName: string | null = null;
  let amount: number | null = null;

  if (match1) {
    customerName = match1[1];
    amount = parseInt(match1[2]);
  } else if (match2) {
    amount = parseInt(match2[1]);
    customerName = match2[2];
  }

  if (!customerName || !amount) {
    return {
      reply: 'Format: "Kavitha paid 200" or "received 300 from Suresh"',
      intent: "udhar_payment",
      handled: true,
    };
  }

  const amountPaise = amount * 100;

  await db.insert(udharLedger).values({
    shopBusinessId: shop.id,
    customerName,
    amountPaise,
    transactionType: "debit",
    note: `Payment received via WhatsApp`,
  });

  const { byCustomer } = await getUdharSummary(shop.id);
  const remaining = byCustomer.get(customerName)?.total || 0;

  return {
    reply: `Updated. ${customerName} now owes ${remaining > 0 ? fmtRs(remaining) : "₹0 — all clear!"}.`,
    intent: "udhar_payment",
    handled: true,
  };
}

// ── udhar_remind ───────────────────────────────────────────

async function udharRemind(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "remind Kavitha" or "remind Suresh about udhar"
  const nameMatch = message.match(/remind\s+([A-Z][a-z]+)/i);
  if (!nameMatch) {
    return { reply: 'Who should I remind? E.g.: "remind Kavitha"', intent: "udhar_remind", handled: true };
  }

  const name = nameMatch[1];
  const { byCustomer } = await getUdharSummary(shop.id);

  let found: { total: number } | null = null;
  let actualName = name;
  for (const [n, data] of byCustomer) {
    if (n.toLowerCase().includes(name.toLowerCase())) {
      found = data;
      actualName = n;
      break;
    }
  }

  if (!found || found.total <= 0) {
    return { reply: `${name} has no outstanding udhar.`, intent: "udhar_remind", handled: true };
  }

  const reminderText = `Hi ${actualName}, just a reminder that ${fmtRs(found.total)} is outstanding at ${shop.businessName}. Whenever you get a chance, no rush! 🙏`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(reminderText)}`;

  return {
    reply: `Reminder ready for ${actualName} (${fmtRs(found.total)}):\n\n"${reminderText}"\n\nForward link: ${waUrl}`,
    intent: "udhar_remind",
    handled: true,
  };
}

// ── stock_update ───────────────────────────────────────────

async function stockUpdate(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "got 50 packets of Maggi" or "received 100 rice bags"
  const match = message.match(/(\d+)\s+(?:packets?\s+(?:of\s+)?|bags?\s+(?:of\s+)?|units?\s+(?:of\s+)?)?(.+?)(?:\s+from\s+.*)?$/i);
  if (!match) {
    return { reply: 'Format: "got 50 Maggi" or "received 100 rice bags"', intent: "stock_update", handled: true };
  }

  const qty = parseInt(match[1]);
  const itemName = match[2].replace(/\s+(from|supplier).*$/i, "").trim();

  // Upsert: find existing or create
  const existing = await db
    .select()
    .from(shopInventory)
    .where(
      and(
        eq(shopInventory.shopBusinessId, shop.id),
        sql`lower(${shopInventory.itemName}) = ${itemName.toLowerCase()}`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(shopInventory)
      .set({
        quantityOnHand: (existing[0].quantityOnHand || 0) + qty,
        updatedAt: new Date(),
      })
      .where(eq(shopInventory.id, existing[0].id));
    return {
      reply: `Updated ${itemName} to ${(existing[0].quantityOnHand || 0) + qty} units.`,
      intent: "stock_update",
      handled: true,
    };
  }

  await db.insert(shopInventory).values({
    shopBusinessId: shop.id,
    itemName,
    quantityOnHand: qty,
  });

  return {
    reply: `Added ${itemName}: ${qty} units.`,
    intent: "stock_update",
    handled: true,
  };
}

// ── book_appointment ───────────────────────────────────────

async function bookAppointment(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "appointment for Priya Friday 3pm haircut"
  const match = message.match(
    /(?:appointment|booking)\s+(?:for\s+)?([A-Z][a-z]+)\s+(.+?)(?:\s+(haircut|trim|shave|facial|massage|service|repair|fix|checkup))?$/i
  );

  if (!match) {
    return {
      reply: 'Format: "appointment for Priya Friday 3pm haircut"',
      intent: "book_appointment",
      handled: true,
    };
  }

  const customerName = match[1];
  const dateTimeStr = match[2].replace(/\s*(haircut|trim|shave|facial|massage|service|repair|fix|checkup)\s*$/i, "").trim();
  const serviceType = match[3] || "general";

  // Simple date parsing — use next occurrence of day name or relative
  const scheduledAt = parseSimpleDate(dateTimeStr);

  const [appt] = await db.insert(shopAppointments).values({
    shopBusinessId: shop.id,
    customerName,
    serviceType,
    scheduledAt,
  }).returning();

  const dateLabel = scheduledAt.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    reply: `Booked ${customerName} for ${serviceType} on ${dateLabel}. I'll remind them the day before.`,
    intent: "book_appointment",
    handled: true,
  };
}

// ── job_card_create ────────────────────────────────────────

async function jobCardCreate(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "received Rahul's phone for screen repair" or "received Arun's laptop for charging port repair"
  const match = message.match(
    /(?:received|accepted)\s+([A-Z][a-z]+)(?:'s|s)\s+(.+?)(?:\s+for\s+(.+))?$/i
  );

  if (!match) {
    return {
      reply: 'Format: "received Rahul\'s phone for screen repair"',
      intent: "job_card_create",
      handled: true,
    };
  }

  const customerName = match[1];
  const itemDescription = match[2].trim();
  const issueDescription = match[3]?.trim() || "";

  const [card] = await db.insert(shopJobCards).values({
    shopBusinessId: shop.id,
    customerName,
    itemDescription,
    issueDescription,
  }).returning();

  return {
    reply: `Job card created for ${customerName}'s ${itemDescription}. #JC-${card.id}\nI'll notify them when it's ready.`,
    intent: "job_card_create",
    handled: true,
  };
}

// ── job_card_update ────────────────────────────────────────

async function jobCardUpdate(shop: any, message: string): Promise<HandlerResult> {
  // Parse: "Rahul's phone is ready" or "Arun's laptop is done"
  const match = message.match(/([A-Z][a-z]+)(?:'s|s)\s+(.+?)\s+(?:is\s+)?(ready|done|complete|tayyar)/i);

  if (!match) {
    return {
      reply: 'Format: "Rahul\'s phone is ready"',
      intent: "job_card_update",
      handled: true,
    };
  }

  const customerName = match[1];

  // Find open job card
  const openCards = await db
    .select()
    .from(shopJobCards)
    .where(
      and(
        eq(shopJobCards.shopBusinessId, shop.id),
        sql`lower(${shopJobCards.customerName}) = ${customerName.toLowerCase()}`,
        sql`${shopJobCards.status} != 'delivered'`
      )
    )
    .orderBy(desc(shopJobCards.receivedAt))
    .limit(1);

  if (openCards.length === 0) {
    return {
      reply: `No open job card found for ${customerName}.`,
      intent: "job_card_update",
      handled: true,
    };
  }

  const card = openCards[0];
  await db
    .update(shopJobCards)
    .set({ status: "ready", readyAt: new Date() })
    .where(eq(shopJobCards.id, card.id));

  const notifyText = `Hi ${customerName}! Your ${card.itemDescription} is ready at ${shop.businessName}. Come collect when you can. 🙂`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(notifyText)}`;

  return {
    reply: `Updated #JC-${card.id}! ${customerName}'s ${card.itemDescription} marked ready.\n\nWant to notify them? Forward: ${waUrl}`,
    intent: "job_card_update",
    handled: true,
  };
}

// ── helpers ────────────────────────────────────────────────

function parseSimpleDate(str: string): Date {
  const now = new Date();
  const lower = str.toLowerCase();

  // "tomorrow 3pm"
  if (lower.includes("tomorrow")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const timeMatch = lower.match(/(\d{1,2})\s*(am|pm)/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      if (timeMatch[2].toLowerCase() === "pm" && h < 12) h += 12;
      d.setHours(h, 0, 0, 0);
    }
    return d;
  }

  // Day names: "friday 3pm"
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const d = new Date(now);
      const diff = (i - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      const timeMatch = lower.match(/(\d{1,2})\s*(am|pm)/i);
      if (timeMatch) {
        let h = parseInt(timeMatch[1]);
        if (timeMatch[2].toLowerCase() === "pm" && h < 12) h += 12;
        d.setHours(h, 0, 0, 0);
      }
      return d;
    }
  }

  // Fallback: try native parse
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date(now.getTime() + 86400000) : parsed;
}

// ── format ─────────────────────────────────────────────────

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
