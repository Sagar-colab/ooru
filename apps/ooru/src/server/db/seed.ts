import "dotenv/config";
import { db, pool } from "./index.js";
import {
  neighbourhoods,
  merchants,
  menuCategories,
  menuItems,
  hubs,
  shopBusinesses,
} from "./schema.js";

async function seed() {
  console.log("[seed] Starting...");

  // 1. Neighbourhood
  const [indiranagar] = await db
    .insert(neighbourhoods)
    .values({
      slug: "indiranagar",
      name: "Indiranagar",
      city: "Bengaluru",
      state: "Karnataka",
      centerLat: 12.9784,
      centerLng: 77.6408,
      maturityLevel: 1,
      deliveryActive: false,
      shopOwnerActive: true,
    })
    .returning();
  console.log(`[seed] Neighbourhood: ${indiranagar.name}`);

  // 2. Merchants + Menus
  // ── Meghana Foods ──
  const [meghana] = await db
    .insert(merchants)
    .values({
      name: "Meghana Foods",
      phone: "9900001001",
      cuisine: ["Andhra"],
      address: "12th Main, Indiranagar",
      lat: 12.9784,
      lng: 77.6408,
      neighbourhoodSlug: "indiranagar",
    })
    .returning();

  const [megStarters] = await db
    .insert(menuCategories)
    .values({ merchantId: meghana.id, name: "Starters", sortOrder: 0 })
    .returning();
  const [megBiryani] = await db
    .insert(menuCategories)
    .values({ merchantId: meghana.id, name: "Biryani", sortOrder: 1 })
    .returning();
  const [megCurries] = await db
    .insert(menuCategories)
    .values({ merchantId: meghana.id, name: "Curries", sortOrder: 2 })
    .returning();
  const [megBreads] = await db
    .insert(menuCategories)
    .values({ merchantId: meghana.id, name: "Breads", sortOrder: 3 })
    .returning();
  const [megBev] = await db
    .insert(menuCategories)
    .values({ merchantId: meghana.id, name: "Beverages", sortOrder: 4 })
    .returning();

  await db.insert(menuItems).values([
    { merchantId: meghana.id, categoryId: megBiryani.id, name: "Chicken Biryani", pricePaise: 28000, isVeg: false, sortOrder: 0 },
    { merchantId: meghana.id, categoryId: megBiryani.id, name: "Mutton Biryani", pricePaise: 36000, isVeg: false, sortOrder: 1 },
    { merchantId: meghana.id, categoryId: megCurries.id, name: "Butter Chicken", pricePaise: 24000, isVeg: false, sortOrder: 0 },
    { merchantId: meghana.id, categoryId: megCurries.id, name: "Dal Makhani", pricePaise: 18000, isVeg: true, sortOrder: 1 },
    { merchantId: meghana.id, categoryId: megBreads.id, name: "Naan", pricePaise: 4000, isVeg: true, sortOrder: 0 },
    { merchantId: meghana.id, categoryId: megBev.id, name: "Lassi", pricePaise: 8000, isVeg: true, sortOrder: 0 },
    { merchantId: meghana.id, categoryId: megStarters.id, name: "Chicken 65", pricePaise: 22000, isVeg: false, sortOrder: 0 },
    { merchantId: meghana.id, categoryId: megStarters.id, name: "Paneer Tikka", pricePaise: 20000, isVeg: true, sortOrder: 1 },
    { merchantId: meghana.id, categoryId: megBev.id, name: "Raita", pricePaise: 6000, isVeg: true, sortOrder: 1 },
    { merchantId: meghana.id, categoryId: megCurries.id, name: "Gulab Jamun", pricePaise: 8000, isVeg: true, sortOrder: 2 },
  ]);
  console.log(`[seed] Merchant: ${meghana.name} + 10 items`);

  // ── Brahmin's Coffee Bar ──
  const [brahmins] = await db
    .insert(merchants)
    .values({
      name: "Brahmin's Coffee Bar",
      phone: "9900001002",
      cuisine: ["South Indian"],
      address: "Ranga Rao Road, Basavanagudi",
      lat: 12.9500,
      lng: 77.5700,
      neighbourhoodSlug: "indiranagar",
    })
    .returning();

  const [brCat] = await db
    .insert(menuCategories)
    .values({ merchantId: brahmins.id, name: "Menu", sortOrder: 0 })
    .returning();

  await db.insert(menuItems).values([
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Filter Coffee", pricePaise: 3000, isVeg: true, sortOrder: 0 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Masala Dosa", pricePaise: 8000, isVeg: true, sortOrder: 1 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Idli", pricePaise: 5000, isVeg: true, sortOrder: 2 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Vada", pricePaise: 5000, isVeg: true, sortOrder: 3 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Poha", pricePaise: 6000, isVeg: true, sortOrder: 4 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Upma", pricePaise: 6000, isVeg: true, sortOrder: 5 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Pongal", pricePaise: 7000, isVeg: true, sortOrder: 6 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Benne Dosa", pricePaise: 9000, isVeg: true, sortOrder: 7 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Set Dosa", pricePaise: 8000, isVeg: true, sortOrder: 8 },
    { merchantId: brahmins.id, categoryId: brCat.id, name: "Plain Dosa", pricePaise: 7000, isVeg: true, sortOrder: 9 },
  ]);
  console.log(`[seed] Merchant: ${brahmins.name} + 10 items`);

  // ── Subbaiah Mess ──
  const [subbaiah] = await db
    .insert(merchants)
    .values({
      name: "Subbaiah Mess",
      phone: "9900001003",
      cuisine: ["Karnataka"],
      address: "VV Puram, Bengaluru",
      lat: 12.9450,
      lng: 77.5730,
      neighbourhoodSlug: "indiranagar",
    })
    .returning();

  const [subCat] = await db
    .insert(menuCategories)
    .values({ merchantId: subbaiah.id, name: "Menu", sortOrder: 0 })
    .returning();

  await db.insert(menuItems).values([
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Veg Meals", pricePaise: 12000, isVeg: true, sortOrder: 0 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Non-Veg Meals", pricePaise: 18000, isVeg: false, sortOrder: 1 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Ragi Mudde", pricePaise: 8000, isVeg: true, sortOrder: 2 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Saaru", pricePaise: 4000, isVeg: true, sortOrder: 3 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Palya", pricePaise: 6000, isVeg: true, sortOrder: 4 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Curd Rice", pricePaise: 7000, isVeg: true, sortOrder: 5 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Chitranna", pricePaise: 8000, isVeg: true, sortOrder: 6 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Akki Rotti", pricePaise: 7000, isVeg: true, sortOrder: 7 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Bisibelebath", pricePaise: 10000, isVeg: true, sortOrder: 8 },
    { merchantId: subbaiah.id, categoryId: subCat.id, name: "Jolada Rotti", pricePaise: 6000, isVeg: true, sortOrder: 9 },
  ]);
  console.log(`[seed] Merchant: ${subbaiah.name} + 10 items`);

  // 3. Hub
  await db.insert(hubs).values({
    name: "Hub A — 100 Feet Road",
    neighbourhoodSlug: "indiranagar",
    address: "100 Feet Road junction, Indiranagar",
    lat: 12.9784,
    lng: 77.6408,
  });
  console.log("[seed] Hub: Hub A — 100 Feet Road");

  // 4. Shop Businesses
  await db.insert(shopBusinesses).values([
    {
      phone: "9900002001",
      ownerName: "Ramesh",
      businessName: "Ramesh Kirana",
      businessType: "kirana",
      address: "12th Main, Indiranagar",
      neighbourhoodSlug: "indiranagar",
      lat: 12.9780,
      lng: 77.6400,
    },
    {
      phone: "9900002002",
      ownerName: "Sunita",
      businessName: "Sunita Beauty Parlour",
      businessType: "salon",
      neighbourhoodSlug: "indiranagar",
    },
    {
      phone: "9900002003",
      ownerName: "City Pharmacy",
      businessName: "City Pharmacy",
      businessType: "pharmacy",
      neighbourhoodSlug: "indiranagar",
    },
    {
      phone: "9900002004",
      ownerName: "Quick Fix",
      businessName: "Quick Fix Mobile Repair",
      businessType: "mobile_repair",
      neighbourhoodSlug: "indiranagar",
    },
  ]);
  console.log("[seed] 4 shop businesses created");

  console.log("[seed] Done!");
  await pool.end();
}

seed().catch((e) => {
  console.error("[seed] Failed:", e);
  process.exit(1);
});
