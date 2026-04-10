CREATE TABLE "consumers" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"whatsapp_id" text,
	"language" text DEFAULT 'en',
	"neighbourhood_slug" text,
	"hex_cell" text,
	"role" text DEFAULT 'consumer',
	"dietary" text DEFAULT 'both',
	"spice_level" text DEFAULT 'medium',
	"cuisine_preferences" text[],
	"price_sensitivity" text DEFAULT 'medium',
	"last_order_merchant_id" integer,
	"order_count" integer DEFAULT 0,
	"taste_profile" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "consumers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"role" text NOT NULL,
	"persona" text NOT NULL,
	"state" jsonb DEFAULT '{}',
	"last_message_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_pnl" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer,
	"date" date NOT NULL,
	"orders_count" integer DEFAULT 0,
	"gross_paise" integer DEFAULT 0,
	"commission_paise" integer DEFAULT 0,
	"net_paise" integer DEFAULT 0,
	"gst_paise" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"rider_id" integer,
	"role" text NOT NULL,
	"status" text DEFAULT 'assigned',
	"assigned_at" timestamp with time zone DEFAULT now(),
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "group_procurement_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer,
	"neighbourhood_slug" text NOT NULL,
	"participating_shop_ids" integer[],
	"consolidated_items" jsonb NOT NULL,
	"total_value_paise" integer,
	"status" text DEFAULT 'open',
	"closes_at" timestamp with time zone,
	"delivery_date" date,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "home_service_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"aadhaar_hash" text,
	"badge_level" text DEFAULT 'new',
	"rating_avg" real DEFAULT 5,
	"total_jobs" integer DEFAULT 0,
	"price_range_min_paise" integer,
	"price_range_max_paise" integer,
	"areas" text[],
	"listing_fee_paid_till" date,
	"is_active" boolean DEFAULT true,
	"neighbourhood_slug" text,
	"lat" real,
	"lng" real,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "home_service_providers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "home_service_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"consumer_id" integer,
	"category" text NOT NULL,
	"description" text,
	"matched_provider_id" integer,
	"status" text DEFAULT 'requested',
	"neighbourhood_slug" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"neighbourhood_slug" text,
	"address" text,
	"lat" real,
	"lng" real,
	"is_active" boolean DEFAULT true,
	"locker_count" integer DEFAULT 20,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer,
	"category_id" integer,
	"name" text NOT NULL,
	"description" text,
	"price_paise" integer NOT NULL,
	"is_veg" boolean DEFAULT true,
	"is_available" boolean DEFAULT true,
	"photo_url" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"cuisine" text[],
	"address" text,
	"lat" real,
	"lng" real,
	"hex_cell" text,
	"neighbourhood_slug" text,
	"fssai" text,
	"gstin" text,
	"is_active" boolean DEFAULT true,
	"is_open" boolean DEFAULT true,
	"delivery_radius_km" real DEFAULT 2,
	"commission_rate" real DEFAULT 0.15,
	"spatial_os_project_id" integer,
	"config" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"gupshup_msg_id" text,
	"phone_last4" text,
	"direction" text,
	"intent" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "message_log_gupshup_msg_id_unique" UNIQUE("gupshup_msg_id")
);
--> statement-breakpoint
CREATE TABLE "neighbourhood_bcfs" (
	"id" serial PRIMARY KEY NOT NULL,
	"neighbourhood_slug" text NOT NULL,
	"reporter_phone_hash" text,
	"category" text NOT NULL,
	"title" text,
	"description" text,
	"photo_urls" text[],
	"lat" real,
	"lng" real,
	"hex_cell" text,
	"status" text DEFAULT 'reported',
	"upvotes" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "neighbourhood_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"neighbourhood_slug" text NOT NULL,
	"hex_cell" text NOT NULL,
	"infrastructure_score" real,
	"environment_score" real,
	"safety_score" real,
	"governance_score" real,
	"green_cover_score" real,
	"heat_island_score" real,
	"flood_risk_score" real,
	"mobility_score" real,
	"commercial_vitality_score" real,
	"liveability_score" real,
	"composite_score" real,
	"calculated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "neighbourhoods" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" text DEFAULT 'Karnataka',
	"center_lat" real,
	"center_lng" real,
	"maturity_level" integer DEFAULT 0,
	"health_score" real DEFAULT 0,
	"delivery_active" boolean DEFAULT false,
	"shop_owner_active" boolean DEFAULT true,
	"satellite_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "neighbourhoods_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ondc_catalogue" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_business_id" integer,
	"neighbourhood_slug" text NOT NULL,
	"item_name" text NOT NULL,
	"description" text,
	"photo_url" text,
	"price_paise" integer NOT NULL,
	"unit" text DEFAULT 'unit',
	"category" text NOT NULL,
	"is_available" boolean DEFAULT true,
	"ondc_item_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"consumer_id" integer,
	"merchant_id" integer,
	"rider_id" integer,
	"neighbourhood_slug" text,
	"status" text DEFAULT 'placed',
	"order_type" text DEFAULT 'delivery',
	"items" jsonb DEFAULT '[]' NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"gst_paise" integer DEFAULT 0,
	"delivery_fee_paise" integer DEFAULT 0,
	"total_paise" integer NOT NULL,
	"payment_method" text DEFAULT 'upi',
	"payment_status" text DEFAULT 'pending',
	"razorpay_order_id" text,
	"delivery_address" text,
	"delivery_lat" real,
	"delivery_lng" real,
	"special_instructions" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "procurement_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_business_id" integer,
	"supplier_id" integer,
	"items" jsonb NOT NULL,
	"total_paise" integer,
	"status" text DEFAULT 'pending',
	"delivery_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"consumer_id" integer,
	"merchant_id" integer,
	"score" integer NOT NULL,
	"complaint_category" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rider_earnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer,
	"order_id" integer,
	"date" date NOT NULL,
	"amount_paise" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rider_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "riders" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'new',
	"zone" text,
	"neighbourhood_slug" text,
	"is_online" boolean DEFAULT false,
	"lat" real,
	"lng" real,
	"rating_avg" real DEFAULT 5,
	"total_deliveries" integer DEFAULT 0,
	"earnings_today_paise" integer DEFAULT 0,
	"config" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "riders_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "satellite_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"neighbourhood_slug" text NOT NULL,
	"hex_cell" text NOT NULL,
	"overlay_type" text NOT NULL,
	"value" real NOT NULL,
	"quality" real DEFAULT 1,
	"source" text DEFAULT 'mock',
	"recorded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shop_appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_business_id" integer,
	"customer_name" text NOT NULL,
	"customer_phone_hash" text,
	"service_type" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60,
	"status" text DEFAULT 'scheduled',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shop_businesses" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"owner_name" text,
	"business_name" text NOT NULL,
	"business_type" text NOT NULL,
	"address" text,
	"lat" real,
	"lng" real,
	"hex_cell" text,
	"neighbourhood_slug" text,
	"gst_number" text,
	"fssai_number" text,
	"is_active" boolean DEFAULT true,
	"ooru_delivery_enabled" boolean DEFAULT false,
	"ondc_listed" boolean DEFAULT false,
	"hardware_kit_tier" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shop_daily_pnl" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_business_id" integer,
	"date" date NOT NULL,
	"gross_revenue_paise" integer DEFAULT 0,
	"cash_sales_paise" integer DEFAULT 0,
	"upi_sales_paise" integer DEFAULT 0,
	"cost_of_goods_paise" integer DEFAULT 0,
	"udhar_given_paise" integer DEFAULT 0,
	"udhar_collected_paise" integer DEFAULT 0,
	"net_paise" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shop_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_business_id" integer,
	"item_name" text NOT NULL,
	"sku" text,
	"barcode" text,
	"category" text,
	"unit" text DEFAULT 'unit',
	"quantity_on_hand" integer DEFAULT 0,
	"reorder_level" integer DEFAULT 5,
	"cost_price_paise" integer DEFAULT 0,
	"selling_price_paise" integer DEFAULT 0,
	"expiry_date" date,
	"last_counted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shop_job_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_business_id" integer,
	"customer_name" text NOT NULL,
	"customer_phone_hash" text,
	"item_description" text NOT NULL,
	"issue_description" text,
	"status" text DEFAULT 'received',
	"estimated_cost_paise" integer,
	"final_cost_paise" integer,
	"received_at" timestamp with time zone DEFAULT now(),
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text,
	"phone" text NOT NULL,
	"categories" text[] NOT NULL,
	"service_area_slugs" text[],
	"price_list" jsonb DEFAULT '[]',
	"payment_terms" text DEFAULT 'cash_on_delivery',
	"is_active" boolean DEFAULT true,
	"neighbourhood_slugs" text[],
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "udhar_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_business_id" integer,
	"customer_name" text NOT NULL,
	"customer_phone_hash" text,
	"amount_paise" integer NOT NULL,
	"transaction_type" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "daily_pnl" ADD CONSTRAINT "daily_pnl_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_procurement_orders" ADD CONSTRAINT "group_procurement_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_service_requests" ADD CONSTRAINT "home_service_requests_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_service_requests" ADD CONSTRAINT "home_service_requests_matched_provider_id_home_service_providers_id_fk" FOREIGN KEY ("matched_provider_id") REFERENCES "public"."home_service_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ondc_catalogue" ADD CONSTRAINT "ondc_catalogue_shop_business_id_shop_businesses_id_fk" FOREIGN KEY ("shop_business_id") REFERENCES "public"."shop_businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_shop_business_id_shop_businesses_id_fk" FOREIGN KEY ("shop_business_id") REFERENCES "public"."shop_businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_consumer_id_consumers_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."consumers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_sessions" ADD CONSTRAINT "rider_sessions_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_appointments" ADD CONSTRAINT "shop_appointments_shop_business_id_shop_businesses_id_fk" FOREIGN KEY ("shop_business_id") REFERENCES "public"."shop_businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_daily_pnl" ADD CONSTRAINT "shop_daily_pnl_shop_business_id_shop_businesses_id_fk" FOREIGN KEY ("shop_business_id") REFERENCES "public"."shop_businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_inventory" ADD CONSTRAINT "shop_inventory_shop_business_id_shop_businesses_id_fk" FOREIGN KEY ("shop_business_id") REFERENCES "public"."shop_businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_job_cards" ADD CONSTRAINT "shop_job_cards_shop_business_id_shop_businesses_id_fk" FOREIGN KEY ("shop_business_id") REFERENCES "public"."shop_businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "udhar_ledger" ADD CONSTRAINT "udhar_ledger_shop_business_id_shop_businesses_id_fk" FOREIGN KEY ("shop_business_id") REFERENCES "public"."shop_businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumers_phone_idx" ON "consumers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "conversations_phone_idx" ON "conversations" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "daily_pnl_merchant_date_idx" ON "daily_pnl" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "delivery_assignments_order_idx" ON "delivery_assignments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_assignments_rider_idx" ON "delivery_assignments" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "group_procurement_slug_idx" ON "group_procurement_orders" USING btree ("neighbourhood_slug");--> statement-breakpoint
CREATE INDEX "home_service_providers_slug_cat_idx" ON "home_service_providers" USING btree ("neighbourhood_slug","category");--> statement-breakpoint
CREATE INDEX "home_service_requests_consumer_idx" ON "home_service_requests" USING btree ("consumer_id");--> statement-breakpoint
CREATE INDEX "merchants_neighbourhood_slug_idx" ON "merchants" USING btree ("neighbourhood_slug");--> statement-breakpoint
CREATE INDEX "neighbourhood_bcfs_neighbourhood_slug_idx" ON "neighbourhood_bcfs" USING btree ("neighbourhood_slug");--> statement-breakpoint
CREATE INDEX "neighbourhood_bcfs_status_idx" ON "neighbourhood_bcfs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "neighbourhood_scores_slug_hex_idx" ON "neighbourhood_scores" USING btree ("neighbourhood_slug","hex_cell");--> statement-breakpoint
CREATE INDEX "ondc_catalogue_slug_cat_idx" ON "ondc_catalogue" USING btree ("neighbourhood_slug","category","is_available");--> statement-breakpoint
CREATE INDEX "orders_consumer_id_idx" ON "orders" USING btree ("consumer_id");--> statement-breakpoint
CREATE INDEX "orders_merchant_id_idx" ON "orders" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "procurement_orders_shop_idx" ON "procurement_orders" USING btree ("shop_business_id");--> statement-breakpoint
CREATE INDEX "ratings_order_id_idx" ON "ratings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "rider_earnings_rider_date_idx" ON "rider_earnings" USING btree ("rider_id","date");--> statement-breakpoint
CREATE INDEX "rider_sessions_rider_idx" ON "rider_sessions" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "satellite_cache_slug_hex_type_idx" ON "satellite_cache" USING btree ("neighbourhood_slug","hex_cell","overlay_type");--> statement-breakpoint
CREATE INDEX "shop_appointments_shop_id_idx" ON "shop_appointments" USING btree ("shop_business_id");--> statement-breakpoint
CREATE INDEX "shop_businesses_neighbourhood_slug_idx" ON "shop_businesses" USING btree ("neighbourhood_slug");--> statement-breakpoint
CREATE INDEX "shop_businesses_business_type_idx" ON "shop_businesses" USING btree ("business_type");--> statement-breakpoint
CREATE INDEX "shop_businesses_phone_idx" ON "shop_businesses" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "shop_daily_pnl_shop_date_idx" ON "shop_daily_pnl" USING btree ("shop_business_id","date");--> statement-breakpoint
CREATE INDEX "shop_inventory_shop_business_id_idx" ON "shop_inventory" USING btree ("shop_business_id");--> statement-breakpoint
CREATE INDEX "shop_job_cards_shop_id_idx" ON "shop_job_cards" USING btree ("shop_business_id");--> statement-breakpoint
CREATE INDEX "udhar_ledger_shop_business_id_idx" ON "udhar_ledger" USING btree ("shop_business_id");