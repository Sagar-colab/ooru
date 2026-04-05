import { runMorningBrief } from "./morningBrief.js";
import { runRiderSettlement, runRestaurantSettlement } from "../finance/settlement.js";

interface CronJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
}

const CRONS: CronJob[] = [
  // Daily
  { name: "morning-brief", schedule: "0 7 * * *", handler: runMorningBrief },
  { name: "rider-settlement", schedule: "0 23 * * *", handler: async () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    await runRiderSettlement(yesterday);
  }},
  { name: "restaurant-settlement", schedule: "0 6 * * *", handler: async () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    await runRestaurantSettlement(yesterday);
  }},
  { name: "daily-pnl-rollup", schedule: "0 0 * * *", handler: async () => {
    console.log("[cron] Daily P&L rollup — handled per transaction");
  }},
  { name: "guarantee-calc", schedule: "30 23 * * *", handler: async () => {
    console.log("[cron] Guarantee calculation — part of rider settlement");
  }},

  // Every 30 minutes
  { name: "kra-check", schedule: "*/30 * * * *", handler: async () => {
    console.log("[cron] KRA threshold check — stub");
  }},
  { name: "score-recalc", schedule: "*/30 * * * *", handler: async () => {
    console.log("[cron] Neighbourhood score recalculation — stub");
  }},

  // Hourly
  { name: "satellite-check", schedule: "0 * * * *", handler: async () => {
    console.log("[cron] Satellite cache freshness check — stub");
  }},
  { name: "stock-alerts", schedule: "0 * * * *", handler: async () => {
    console.log("[cron] Stock reorder alerts — stub");
  }},

  // Weekly
  { name: "weekly-summary", schedule: "0 8 * * 1", handler: async () => {
    console.log("[cron] Weekly summary for all shops — stub");
  }},
  { name: "neighbourhood-recap", schedule: "0 8 * * 0", handler: async () => {
    console.log("[cron] Neighbourhood recap — stub");
  }},
  { name: "health-card", schedule: "0 20 * * 5", handler: async () => {
    console.log("[cron] Neighbourhood health card to admin — stub");
  }},

  // Monthly
  { name: "monthly-pnl", schedule: "0 9 1 * *", handler: async () => {
    console.log("[cron] Monthly P&L for all shops — stub");
  }},
  { name: "gst-reminder", schedule: "0 9 11 * *", handler: async () => {
    console.log("[cron] GST reminder to registered shops — stub");
  }},
  { name: "settlement-report", schedule: "0 9 1 * *", handler: async () => {
    console.log("[cron] Monthly settlement report — stub");
  }},
];

// Simple cron scheduler using setTimeout/setInterval
function parseCronToMs(schedule: string): { initial: number; interval: number } | null {
  const parts = schedule.split(" ");
  if (parts.length !== 5) return null;

  const [min, hour, dom, mon, dow] = parts;

  // Every N minutes
  if (min.startsWith("*/")) {
    const interval = parseInt(min.slice(2)) * 60000;
    return { initial: interval, interval };
  }

  // Specific time — calculate next occurrence
  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);

  if (hour !== "*" && min !== "*") {
    target.setHours(parseInt(hour), parseInt(min));
    if (target <= now) target.setDate(target.getDate() + 1);
    return { initial: target.getTime() - now.getTime(), interval: 24 * 60 * 60000 };
  }

  if (hour === "*" && min !== "*") {
    target.setMinutes(parseInt(min));
    if (target <= now) target.setHours(target.getHours() + 1);
    return { initial: target.getTime() - now.getTime(), interval: 60 * 60000 };
  }

  return { initial: 60000, interval: 60 * 60000 };
}

export function registerAllCrons() {
  console.log(`[cron] Registering ${CRONS.length} cron jobs...`);

  for (const cron of CRONS) {
    const timing = parseCronToMs(cron.schedule);
    if (!timing) {
      console.log(`[cron] Skipping ${cron.name} — cannot parse schedule`);
      continue;
    }

    setTimeout(() => {
      const run = async () => {
        try {
          console.log(`[cron] Running ${cron.name}`);
          await cron.handler();
        } catch (e: any) {
          console.error(`[cron] ${cron.name} failed:`, e.message);
        }
      };

      run();
      if (timing.interval > 0) {
        setInterval(run, timing.interval);
      }
    }, timing.initial);

    console.log(`[cron] ${cron.name} (${cron.schedule}) — first run in ${Math.round(timing.initial / 60000)}m`);
  }
}
