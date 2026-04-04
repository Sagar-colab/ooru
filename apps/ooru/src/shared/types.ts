import type {
  consumers,
  neighbourhoods,
  merchants,
  menuCategories,
  menuItems,
  riders,
  hubs,
  orders,
  shopBusinesses,
  udharLedger,
  shopInventory,
  neighbourhoodBcfs,
  conversations,
  messageLog,
} from "../server/db/schema.js";

export type Consumer = typeof consumers.$inferSelect;
export type NewConsumer = typeof consumers.$inferInsert;

export type Neighbourhood = typeof neighbourhoods.$inferSelect;
export type NewNeighbourhood = typeof neighbourhoods.$inferInsert;

export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;

export type MenuCategory = typeof menuCategories.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;

export type Rider = typeof riders.$inferSelect;
export type Hub = typeof hubs.$inferSelect;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type ShopBusiness = typeof shopBusinesses.$inferSelect;
export type NewShopBusiness = typeof shopBusinesses.$inferInsert;

export type UdharEntry = typeof udharLedger.$inferSelect;
export type NewUdharEntry = typeof udharLedger.$inferInsert;

export type ShopInventoryItem = typeof shopInventory.$inferSelect;

export type NeighbourhoodBcf = typeof neighbourhoodBcfs.$inferSelect;

export type Conversation = typeof conversations.$inferSelect;
export type MessageLogEntry = typeof messageLog.$inferSelect;

// ── Gupshup WhatsApp types ─────────────────────────────────

export interface GupshupMessage {
  app: string;
  timestamp: string;
  version: number;
  type: "message" | "user-event";
  payload: {
    id: string;
    source: string;
    type: "text" | "image" | "audio" | "location" | "document";
    payload: {
      text?: string;
      url?: string;
      caption?: string;
    };
    sender: {
      phone: string;
      name?: string;
    };
  };
}
