import { create } from "zustand";

export interface KDSOrder {
  id: number;
  orderNumber: string;
  status: string;
  orderType: string;
  items: { name: string; qty: number; pricePaise: number; notes?: string }[];
  subtotalPaise: number;
  totalPaise: number;
  specialInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KDSState {
  orders: KDSOrder[];
  soundEnabled: boolean;
  activeStation: string;
  offline: boolean;

  setOrders: (orders: KDSOrder[]) => void;
  addOrder: (order: KDSOrder) => void;
  updateOrderStatus: (orderId: number, status: string) => void;
  removeOrder: (orderId: number) => void;
  toggleSound: () => void;
  setStation: (station: string) => void;
  setOffline: (offline: boolean) => void;
}

export const useKDSStore = create<KDSState>((set) => ({
  orders: [],
  soundEnabled: true,
  activeStation: "All",
  offline: false,

  setOrders: (orders) => set({ orders }),

  addOrder: (order) =>
    set((s) => ({
      orders: [...s.orders, order].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    })),

  updateOrderStatus: (orderId, status) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o
      ),
    })),

  removeOrder: (orderId) =>
    set((s) => ({ orders: s.orders.filter((o) => o.id !== orderId) })),

  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  setStation: (station) => set({ activeStation: station }),
  setOffline: (offline) => set({ offline }),
}));
