import { useEffect, useRef, useCallback, useState } from "react";
import { useParams } from "wouter";
import { io, Socket } from "socket.io-client";
import { get, set as idbSet } from "idb-keyval";
import { useKDSStore, type KDSOrder } from "../stores/kdsStore";

const STATIONS = ["All", "Hot", "Cold", "Tandoor"];

const STATUS_ADVANCE: Record<string, string> = {
  placed: "ACCEPT",
  accepted: "PREPARING",
  preparing: "READY",
};

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: "#25D366",
  walkin: "#3B82F6",
  "walk-in": "#3B82F6",
  "dine-in": "#8B5CF6",
  dinein: "#8B5CF6",
  delivery: "#F59E0B",
};

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

function ageMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function ageBorderColor(mins: number): string {
  if (mins < 5) return "#22C55E";
  if (mins < 15) return "#F59E0B";
  return "#EF4444";
}

function formatTimer(createdAt: string): string {
  const mins = ageMinutes(createdAt);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function KDS() {
  const params = useParams<{ merchantId: string }>();
  const merchantId = Number(params.merchantId);
  const socketRef = useRef<Socket | null>(null);
  const [merchantName, setMerchantName] = useState("Kitchen");
  const [, setTick] = useState(0); // Force re-render for timers

  const {
    orders,
    setOrders,
    addOrder,
    updateOrderStatus,
    removeOrder,
    soundEnabled,
    toggleSound,
    activeStation,
    setStation,
    offline,
    setOffline,
  } = useKDSStore();

  // Timer tick every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch merchant name
  useEffect(() => {
    fetch(`/api/merchants/${merchantId}`)
      .then((r) => r.json())
      .then((d) => d.name && setMerchantName(d.name))
      .catch(() => {});
  }, [merchantId]);

  // Load orders
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/kds/${merchantId}/orders`);
      const data = await res.json();
      setOrders(data);
      setOffline(false);
      await idbSet(`kds-orders-${merchantId}`, data);
    } catch {
      // Offline — load from cache
      const cached = await get(`kds-orders-${merchantId}`);
      if (cached) setOrders(cached as KDSOrder[]);
      setOffline(true);
    }
  }, [merchantId, setOrders, setOffline]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Socket.IO
  useEffect(() => {
    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join", { merchantId });
      setOffline(false);
    });

    socket.on("disconnect", () => setOffline(true));

    socket.on("order:new", (order: KDSOrder) => {
      addOrder(order);
      if (soundEnabled) playChime();
    });

    socket.on("order:status", (order: KDSOrder) => {
      if (order.status === "completed" || order.status === "cancelled") {
        removeOrder(order.id);
      } else {
        updateOrderStatus(order.id, order.status);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [merchantId, soundEnabled, addOrder, updateOrderStatus, removeOrder, setOffline]);

  // Advance order
  const advanceOrder = async (orderId: number) => {
    try {
      const res = await fetch(`/api/kds/${merchantId}/orders/${orderId}/advance`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await res.json();
        updateOrderStatus(updated.id, updated.status);
      }
    } catch {
      console.error("[kds] Failed to advance order");
    }
  };

  // Filter by station
  const filteredOrders =
    activeStation === "All"
      ? orders
      : orders.filter((o) =>
          o.items?.some((i: any) => {
            const name = (i.name || "").toLowerCase();
            const station = activeStation.toLowerCase();
            if (station === "hot") return !name.includes("cold") && !name.includes("ice") && !name.includes("lassi") && !name.includes("raita");
            if (station === "cold") return name.includes("cold") || name.includes("ice") || name.includes("lassi") || name.includes("raita") || name.includes("curd");
            if (station === "tandoor") return name.includes("tandoor") || name.includes("naan") || name.includes("roti") || name.includes("tikka");
            return true;
          })
        );

  // Adaptive density
  const count = filteredOrders.length;
  const density = count <= 2 ? "large" : count <= 8 ? "balanced" : "focus";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Offline bar */}
      {offline && (
        <div className="bg-amber-600 text-center text-sm py-1 font-medium">
          Offline — showing cached data
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">{merchantName}</span>
          <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full font-mono">
            {filteredOrders.length} orders
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Station tabs */}
          <div className="flex gap-1">
            {STATIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStation(s)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  activeStation === s
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            className={`px-3 py-1 text-xs rounded-full ${
              soundEnabled ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400"
            }`}
          >
            {soundEnabled ? "🔔" : "🔇"}
          </button>
        </div>
      </div>

      {/* Orders grid */}
      <div className="flex-1 overflow-auto p-4">
        {filteredOrders.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xl">
            No active orders — kitchen is clear
          </div>
        ) : (
          <div
            className={`grid gap-4 ${
              density === "large"
                ? "grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto"
                : density === "balanced"
                ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            }`}
          >
            {filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                density={density}
                onAdvance={advanceOrder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  density,
  onAdvance,
}: {
  order: KDSOrder;
  density: string;
  onAdvance: (id: number) => void;
}) {
  const mins = ageMinutes(order.createdAt);
  const borderColor = ageBorderColor(mins);
  const btnLabel = STATUS_ADVANCE[order.status];
  const sourceColor = SOURCE_COLORS[order.orderType?.toLowerCase() || ""] || "#6B7280";

  const padding = density === "large" ? "p-5" : density === "balanced" ? "p-4" : "p-3";
  const textSize = density === "large" ? "text-base" : density === "balanced" ? "text-sm" : "text-xs";

  return (
    <div
      className={`bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex flex-col ${padding}`}
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-gray-100">{order.orderNumber}</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
            style={{ backgroundColor: sourceColor }}
          >
            {order.orderType}
          </span>
        </div>
        <span className="text-gray-400 font-mono text-xs">{formatTimer(order.createdAt)}</span>
      </div>

      {/* Items */}
      <div className={`flex-1 space-y-1 mb-3 ${textSize}`}>
        {(order.items || []).map((item: any, i: number) => (
          <div key={i} className="flex justify-between">
            <span>
              <span className="text-gray-200 font-medium">{item.name}</span>
              <span className="text-gray-500"> × {item.qty || 1}</span>
            </span>
            {item.notes && (
              <span className="text-amber-400 text-xs ml-2 italic">{item.notes}</span>
            )}
          </div>
        ))}
        {order.specialInstructions && (
          <div className="text-amber-400 text-xs mt-1 italic">
            📝 {order.specialInstructions}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500 text-xs">{fmtRs(order.totalPaise)}</span>
        {btnLabel && (
          <button
            onClick={() => onAdvance(order.id)}
            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${
              order.status === "placed"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : order.status === "accepted"
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            {btnLabel}
          </button>
        )}
        {order.status === "ready" && (
          <span className="text-emerald-400 font-bold text-sm flex-1 text-center">
            ✓ READY
          </span>
        )}
      </div>
    </div>
  );
}
