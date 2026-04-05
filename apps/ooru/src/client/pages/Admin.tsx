import { useEffect, useState } from "react";
import { io } from "socket.io-client";

interface Metrics {
  ordersToday: number;
  govTodayPaise: number;
  ridersOnline: number;
  activeBcfs: number;
  guaranteeBurnPaise: number;
}

interface OrderRow {
  id: number;
  orderNumber: string;
  status: string;
  totalPaise: number;
  merchantId: number;
  createdAt: string;
}

interface Alert {
  severity: string;
  message: string;
}

interface FleetData {
  totalRiders: number;
  online: number;
  zones: Record<string, number>;
  riders: { id: number; name: string; zone: string; lat: number; lng: number }[];
}

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const STATUS_COLORS: Record<string, string> = {
  placed: "bg-yellow-600",
  accepted: "bg-blue-600",
  preparing: "bg-purple-600",
  ready: "bg-emerald-600",
  delivered: "bg-gray-600",
  cancelled: "bg-red-600",
};

export default function Admin() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [fleet, setFleet] = useState<FleetData | null>(null);

  const refresh = () => {
    fetch("/api/admin/metrics").then((r) => r.json()).then(setMetrics).catch(() => {});
    fetch("/api/admin/orders/recent").then((r) => r.json()).then(setOrders).catch(() => {});
    fetch("/api/admin/alerts").then((r) => r.json()).then(setAlerts).catch(() => {});
    fetch("/api/admin/fleet").then((r) => r.json()).then(setFleet).catch(() => {});
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  // Socket.IO for live order updates
  useEffect(() => {
    const socket = io({ transports: ["websocket", "polling"] });
    socket.on("order:new", () => refresh());
    socket.on("order:status", () => refresh());
    return () => { socket.disconnect(); };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-6">Ooru Admin</h1>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <MetricCard label="Orders Today" value={String(metrics?.ordersToday || 0)} />
        <MetricCard label="GOV Today" value={fmtRs(metrics?.govTodayPaise || 0)} />
        <MetricCard label="Riders Online" value={String(fleet?.online || 0)} color={fleet?.online === 0 ? "text-red-400" : "text-emerald-400"} />
        <MetricCard label="Active BCFs" value={String(metrics?.activeBcfs || 0)} />
        <MetricCard label="Guarantee Burn" value={fmtRs(metrics?.guaranteeBurnPaise || 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order stream */}
        <div className="lg:col-span-1 bg-gray-900 rounded-xl border border-gray-800 p-4 max-h-[600px] overflow-auto">
          <h2 className="font-semibold text-lg mb-3">Order Stream</h2>
          {orders.length === 0 && <div className="text-gray-500">No orders</div>}
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                <div>
                  <span className="font-mono text-sm">{o.orderNumber}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${STATUS_COLORS[o.status] || "bg-gray-600"}`}>
                    {o.status}
                  </span>
                </div>
                <span className="text-sm text-gray-400">{fmtRs(o.totalPaise)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fleet + map placeholder */}
        <div className="lg:col-span-1 bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h2 className="font-semibold text-lg mb-3">Fleet</h2>
          <div className="text-3xl font-bold text-emerald-400 mb-2">{fleet?.online || 0} / {fleet?.totalRiders || 0}</div>
          <div className="text-gray-400 text-sm mb-4">online</div>
          {fleet?.zones && Object.entries(fleet.zones).map(([zone, count]) => (
            <div key={zone} className="flex justify-between text-sm mb-1">
              <span className="text-gray-300">{zone}</span>
              <span className="text-gray-500">{count} rider{count !== 1 ? "s" : ""}</span>
            </div>
          ))}
          {fleet?.riders && fleet.riders.length > 0 && (
            <div className="mt-4 space-y-1">
              {fleet.riders.map((r) => (
                <div key={r.id} className="text-xs text-gray-400">
                  🟢 {r.name} — {r.zone}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="lg:col-span-1 bg-gray-900 rounded-xl border border-gray-800 p-4 max-h-[600px] overflow-auto">
          <h2 className="font-semibold text-lg mb-3">Alerts</h2>
          {alerts.length === 0 && (
            <div className="text-emerald-400">✅ All systems normal</div>
          )}
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 text-sm ${
                  a.severity === "critical"
                    ? "bg-red-900/30 border border-red-800"
                    : "bg-yellow-900/30 border border-yellow-800"
                }`}
              >
                {a.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || "text-gray-100"}`}>{value}</div>
    </div>
  );
}
