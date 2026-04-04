import { db } from "../../db/index.js";
import {
  shopBusinesses,
  udharLedger,
  shopInventory,
  orders,
} from "../../db/schema.js";
import { eq, and, lt, sql } from "drizzle-orm";

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
  [/^(good\s*morning|gm|subah|suprabhat)/i, "morning_brief"],
  [/(revenue|sales|earn|income|kamai|kitna\s*(hua|kamaya))/i, "check_revenue"],
  [/(udhar|udhaar|credit|loan|baki).*(check|how\s*much|kitna|total|list|show)/i, "udhar_check"],
  [/(add|likh|log|record).*(udhar|udhaar|credit|baki)/i, "udhar_add"],
  [/(udhar|udhaar|credit|baki).*(add|likh|log|record)/i, "udhar_add"],
  [/(stock|inventory|maal|saman)/i, "stock_check"],
  [/(gst|gstin|gstr|tax)/i, "gst_query"],
  [/(pnl|profit|loss|p&l|daily\s*report|weekly|last\s*\d+\s*days)/i, "check_daily_pnl"],
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
    case "check_revenue":
      return checkRevenue(shop);
    case "udhar_check":
      return udharCheck(shop, message);
    case "udhar_add":
      return udharAdd(shop, message);
    case "stock_check":
      return stockCheck(shop);
    case "gst_query":
      return gstQuery(shop);
    case "check_daily_pnl":
      return checkDailyPnl(shop);
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

// ── format ─────────────────────────────────────────────────

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
