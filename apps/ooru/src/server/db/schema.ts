import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  real,
  date,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ── consumers ──────────────────────────────────────────────
export const consumers = pgTable(
  "consumers",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").unique().notNull(),
    name: text("name"),
    whatsappId: text("whatsapp_id"),
    language: text("language").default("en"),
    neighbourhoodSlug: text("neighbourhood_slug"),
    hexCell: text("hex_cell"),
    role: text("role").default("consumer"),
    dietary: text("dietary").default("both"),
    spiceLevel: text("spice_level").default("medium"),
    cuisinePreferences: text("cuisine_preferences").array(),
    priceSensitivity: text("price_sensitivity").default("medium"),
    lastOrderMerchantId: integer("last_order_merchant_id"),
    orderCount: integer("order_count").default(0),
    tasteProfile: jsonb("taste_profile").default("{}"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("consumers_phone_idx").on(t.phone)]
);

// ── neighbourhoods ─────────────────────────────────────────
export const neighbourhoods = pgTable("neighbourhoods", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").default("Karnataka"),
  centerLat: real("center_lat"),
  centerLng: real("center_lng"),
  maturityLevel: integer("maturity_level").default(0),
  healthScore: real("health_score").default(0),
  deliveryActive: boolean("delivery_active").default(false),
  shopOwnerActive: boolean("shop_owner_active").default(true),
  satelliteActive: boolean("satellite_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── merchants ──────────────────────────────────────────────
export const merchants = pgTable(
  "merchants",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    cuisine: text("cuisine").array(),
    address: text("address"),
    lat: real("lat"),
    lng: real("lng"),
    hexCell: text("hex_cell"),
    neighbourhoodSlug: text("neighbourhood_slug"),
    fssai: text("fssai"),
    gstin: text("gstin"),
    isActive: boolean("is_active").default(true),
    isOpen: boolean("is_open").default(true),
    deliveryRadiusKm: real("delivery_radius_km").default(2),
    commissionRate: real("commission_rate").default(0.15),
    spatialOsProjectId: integer("spatial_os_project_id"),
    config: jsonb("config").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("merchants_neighbourhood_slug_idx").on(t.neighbourhoodSlug)]
);

// ── menu_categories ────────────────────────────────────────
export const menuCategories = pgTable("menu_categories", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
});

// ── menu_items ─────────────────────────────────────────────
export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  categoryId: integer("category_id").references(() => menuCategories.id),
  name: text("name").notNull(),
  description: text("description"),
  pricePaise: integer("price_paise").notNull(),
  isVeg: boolean("is_veg").default(true),
  isAvailable: boolean("is_available").default(true),
  photoUrl: text("photo_url"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── riders ─────────────────────────────────────────────────
export const riders = pgTable("riders", {
  id: serial("id").primaryKey(),
  phone: text("phone").unique().notNull(),
  name: text("name").notNull(),
  tier: text("tier").default("new"),
  zone: text("zone"),
  neighbourhoodSlug: text("neighbourhood_slug"),
  isOnline: boolean("is_online").default(false),
  lat: real("lat"),
  lng: real("lng"),
  ratingAvg: real("rating_avg").default(5.0),
  totalDeliveries: integer("total_deliveries").default(0),
  earningsTodayPaise: integer("earnings_today_paise").default(0),
  config: jsonb("config").default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── hubs ───────────────────────────────────────────────────
export const hubs = pgTable("hubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  neighbourhoodSlug: text("neighbourhood_slug"),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  isActive: boolean("is_active").default(true),
  lockerCount: integer("locker_count").default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── orders ─────────────────────────────────────────────────
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").unique().notNull(),
    consumerId: integer("consumer_id").references(() => consumers.id),
    merchantId: integer("merchant_id").references(() => merchants.id),
    riderId: integer("rider_id").references(() => riders.id),
    neighbourhoodSlug: text("neighbourhood_slug"),
    status: text("status").default("placed"),
    orderType: text("order_type").default("delivery"),
    items: jsonb("items").notNull().default("[]"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    gstPaise: integer("gst_paise").default(0),
    deliveryFeePaise: integer("delivery_fee_paise").default(0),
    totalPaise: integer("total_paise").notNull(),
    paymentMethod: text("payment_method").default("upi"),
    paymentStatus: text("payment_status").default("pending"),
    razorpayOrderId: text("razorpay_order_id"),
    deliveryAddress: text("delivery_address"),
    deliveryLat: real("delivery_lat"),
    deliveryLng: real("delivery_lng"),
    specialInstructions: text("special_instructions"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("orders_consumer_id_idx").on(t.consumerId),
    index("orders_merchant_id_idx").on(t.merchantId),
    index("orders_status_idx").on(t.status),
    index("orders_created_at_idx").on(t.createdAt),
  ]
);

// ── shop_businesses ────────────────────────────────────────
export const shopBusinesses = pgTable(
  "shop_businesses",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    ownerName: text("owner_name"),
    businessName: text("business_name").notNull(),
    businessType: text("business_type").notNull(),
    address: text("address"),
    lat: real("lat"),
    lng: real("lng"),
    hexCell: text("hex_cell"),
    neighbourhoodSlug: text("neighbourhood_slug"),
    gstNumber: text("gst_number"),
    fssaiNumber: text("fssai_number"),
    isActive: boolean("is_active").default(true),
    ooruDeliveryEnabled: boolean("ooru_delivery_enabled").default(false),
    ondcListed: boolean("ondc_listed").default(false),
    hardwareKitTier: integer("hardware_kit_tier").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("shop_businesses_neighbourhood_slug_idx").on(t.neighbourhoodSlug),
    index("shop_businesses_business_type_idx").on(t.businessType),
    index("shop_businesses_phone_idx").on(t.phone),
  ]
);

// ── udhar_ledger ───────────────────────────────────────────
export const udharLedger = pgTable(
  "udhar_ledger",
  {
    id: serial("id").primaryKey(),
    shopBusinessId: integer("shop_business_id").references(
      () => shopBusinesses.id
    ),
    customerName: text("customer_name").notNull(),
    customerPhoneHash: text("customer_phone_hash"),
    amountPaise: integer("amount_paise").notNull(),
    transactionType: text("transaction_type").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("udhar_ledger_shop_business_id_idx").on(t.shopBusinessId)]
);

// ── shop_inventory ─────────────────────────────────────────
export const shopInventory = pgTable(
  "shop_inventory",
  {
    id: serial("id").primaryKey(),
    shopBusinessId: integer("shop_business_id").references(
      () => shopBusinesses.id
    ),
    itemName: text("item_name").notNull(),
    sku: text("sku"),
    barcode: text("barcode"),
    category: text("category"),
    unit: text("unit").default("unit"),
    quantityOnHand: integer("quantity_on_hand").default(0),
    reorderLevel: integer("reorder_level").default(5),
    costPricePaise: integer("cost_price_paise").default(0),
    sellingPricePaise: integer("selling_price_paise").default(0),
    expiryDate: date("expiry_date"),
    lastCountedAt: timestamp("last_counted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("shop_inventory_shop_business_id_idx").on(t.shopBusinessId)]
);

// ── neighbourhood_bcfs ─────────────────────────────────────
export const neighbourhoodBcfs = pgTable(
  "neighbourhood_bcfs",
  {
    id: serial("id").primaryKey(),
    neighbourhoodSlug: text("neighbourhood_slug").notNull(),
    reporterPhoneHash: text("reporter_phone_hash"),
    category: text("category").notNull(),
    title: text("title"),
    description: text("description"),
    photoUrls: text("photo_urls").array(),
    lat: real("lat"),
    lng: real("lng"),
    hexCell: text("hex_cell"),
    status: text("status").default("reported"),
    upvotes: integer("upvotes").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("neighbourhood_bcfs_neighbourhood_slug_idx").on(t.neighbourhoodSlug),
    index("neighbourhood_bcfs_status_idx").on(t.status),
  ]
);

// ── conversations ──────────────────────────────────────────
export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    role: text("role").notNull(),
    persona: text("persona").notNull(),
    state: jsonb("state").default("{}"),
    lastMessageAt: timestamp("last_message_at", {
      withTimezone: true,
    }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("conversations_phone_idx").on(t.phone)]
);

// ── daily_pnl ─────────────────────────────────────────────
export const dailyPnl = pgTable(
  "daily_pnl",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").references(() => merchants.id),
    date: date("date").notNull(),
    ordersCount: integer("orders_count").default(0),
    grossPaise: integer("gross_paise").default(0),
    commissionPaise: integer("commission_paise").default(0),
    netPaise: integer("net_paise").default(0),
    gstPaise: integer("gst_paise").default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("daily_pnl_merchant_date_idx").on(t.merchantId, t.date),
  ]
);

// ── shop_daily_pnl ─────────────────────────────────────────
export const shopDailyPnl = pgTable(
  "shop_daily_pnl",
  {
    id: serial("id").primaryKey(),
    shopBusinessId: integer("shop_business_id").references(
      () => shopBusinesses.id
    ),
    date: date("date").notNull(),
    grossRevenuePaise: integer("gross_revenue_paise").default(0),
    cashSalesPaise: integer("cash_sales_paise").default(0),
    upiSalesPaise: integer("upi_sales_paise").default(0),
    costOfGoodsPaise: integer("cost_of_goods_paise").default(0),
    udharGivenPaise: integer("udhar_given_paise").default(0),
    udharCollectedPaise: integer("udhar_collected_paise").default(0),
    netPaise: integer("net_paise").default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("shop_daily_pnl_shop_date_idx").on(t.shopBusinessId, t.date),
  ]
);

// ── shop_appointments ──────────────────────────────────────
export const shopAppointments = pgTable(
  "shop_appointments",
  {
    id: serial("id").primaryKey(),
    shopBusinessId: integer("shop_business_id").references(
      () => shopBusinesses.id
    ),
    customerName: text("customer_name").notNull(),
    customerPhoneHash: text("customer_phone_hash"),
    serviceType: text("service_type"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").default(60),
    status: text("status").default("scheduled"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("shop_appointments_shop_id_idx").on(t.shopBusinessId)]
);

// ── shop_job_cards ─────────────────────────────────────────
export const shopJobCards = pgTable(
  "shop_job_cards",
  {
    id: serial("id").primaryKey(),
    shopBusinessId: integer("shop_business_id").references(
      () => shopBusinesses.id
    ),
    customerName: text("customer_name").notNull(),
    customerPhoneHash: text("customer_phone_hash"),
    itemDescription: text("item_description").notNull(),
    issueDescription: text("issue_description"),
    status: text("status").default("received"),
    estimatedCostPaise: integer("estimated_cost_paise"),
    finalCostPaise: integer("final_cost_paise"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [index("shop_job_cards_shop_id_idx").on(t.shopBusinessId)]
);

// ── rider_earnings ─────────────────────────────────────────
export const riderEarnings = pgTable(
  "rider_earnings",
  {
    id: serial("id").primaryKey(),
    riderId: integer("rider_id").references(() => riders.id),
    orderId: integer("order_id").references(() => orders.id),
    date: date("date").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("rider_earnings_rider_date_idx").on(t.riderId, t.date)]
);

// ── delivery_assignments ───────────────────────────────────
export const deliveryAssignments = pgTable(
  "delivery_assignments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").references(() => orders.id),
    riderId: integer("rider_id").references(() => riders.id),
    role: text("role").notNull(),
    status: text("status").default("assigned"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("delivery_assignments_order_idx").on(t.orderId),
    index("delivery_assignments_rider_idx").on(t.riderId),
  ]
);

// ── ratings ────────────────────────────────────────────────
export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").references(() => orders.id),
    consumerId: integer("consumer_id").references(() => consumers.id),
    merchantId: integer("merchant_id").references(() => merchants.id),
    score: integer("score").notNull(),
    complaintCategory: text("complaint_category"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("ratings_order_id_idx").on(t.orderId)]
);

// ── message_log ────────────────────────────────────────────
export const messageLog = pgTable("message_log", {
  id: serial("id").primaryKey(),
  gupshupMsgId: text("gupshup_msg_id").unique(),
  phoneLast4: text("phone_last4"),
  direction: text("direction"),
  intent: text("intent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
