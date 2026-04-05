import { db } from "../db/index.js";
import { shopBusinesses, udharLedger, shopInventory, shopAppointments } from "../db/schema.js";
import { eq, and, gte } from "drizzle-orm";
import { sendWhatsApp } from "../evo/gupshup.js";

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export async function runMorningBrief() {
  console.log("[cron] Running morning brief...");

  const shops = await db
    .select()
    .from(shopBusinesses)
    .where(eq(shopBusinesses.isActive, true));

  for (const shop of shops) {
    try {
      // Udhar summary
      const ledger = await db
        .select()
        .from(udharLedger)
        .where(eq(udharLedger.shopBusinessId, shop.id));

      const byCustomer = new Map<string, number>();
      for (const e of ledger) {
        const current = byCustomer.get(e.customerName) || 0;
        if (e.transactionType === "credit") {
          byCustomer.set(e.customerName, current + e.amountPaise);
        } else {
          byCustomer.set(e.customerName, current - e.amountPaise);
        }
      }

      let udharTotal = 0;
      let udharCount = 0;
      for (const [, v] of byCustomer) {
        if (v > 0) { udharTotal += v; udharCount++; }
      }

      // Low stock
      const lowStock = await db
        .select()
        .from(shopInventory)
        .where(eq(shopInventory.shopBusinessId, shop.id));
      const lowItems = lowStock.filter(
        (i) => (i.quantityOnHand || 0) <= (i.reorderLevel || 5)
      );

      // Today's appointments
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const appts = await db
        .select()
        .from(shopAppointments)
        .where(
          and(
            eq(shopAppointments.shopBusinessId, shop.id),
            gte(shopAppointments.scheduledAt, todayStart)
          )
        );
      const todayAppts = appts.filter(
        (a) => new Date(a.scheduledAt) < todayEnd
      );

      // Build message
      let msg = `Good morning! ${shop.businessName} daily brief:\n`;
      msg += udharCount > 0
        ? `Outstanding udhar: ${fmtRs(udharTotal)} across ${udharCount} customers.\n`
        : `No udhar outstanding.\n`;
      if (lowItems.length > 0) {
        msg += `Low stock: ${lowItems.slice(0, 3).map((i) => i.itemName).join(", ")}.\n`;
      }
      if (todayAppts.length > 0) {
        msg += `${todayAppts.length} appointment${todayAppts.length > 1 ? "s" : ""} today.\n`;
      }
      msg += `Have a great day!`;

      console.log(`[cron] Morning brief for ${shop.businessName}: ${msg}`);
      sendWhatsApp(shop.phone, msg);
    } catch (e: any) {
      console.error(`[cron] Brief failed for shop ${shop.id}:`, e.message);
    }
  }

  console.log(`[cron] Morning brief complete for ${shops.length} shops`);
}

export function scheduleMorningBrief() {
  // Run at 7 AM daily — simple setInterval for now
  // In production, use node-cron: cron.schedule('0 7 * * *', runMorningBrief)
  const now = new Date();
  const next7am = new Date(now);
  next7am.setHours(7, 0, 0, 0);
  if (next7am <= now) next7am.setDate(next7am.getDate() + 1);

  const msUntil = next7am.getTime() - now.getTime();
  console.log(`[cron] Morning brief scheduled in ${Math.round(msUntil / 60000)} minutes`);

  setTimeout(() => {
    runMorningBrief();
    // Then every 24h
    setInterval(runMorningBrief, 24 * 60 * 60 * 1000);
  }, msUntil);
}
