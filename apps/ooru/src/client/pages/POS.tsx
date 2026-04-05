import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "wouter";

type Mode = "quick" | "item" | "whatsapp";

interface MenuItem {
  id: number;
  name: string;
  pricePaise: number;
  isVeg: boolean;
  isAvailable: boolean;
  categoryId: number;
}

interface CartItem {
  id: number;
  name: string;
  pricePaise: number;
  qty: number;
}

interface OrderRow {
  id: number;
  orderNumber: string;
  status: string;
  orderType: string;
  totalPaise: number;
  paymentMethod: string;
  createdAt: string;
}

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function POS() {
  const params = useParams<{ merchantId: string }>();
  const merchantId = Number(params.merchantId);
  const [mode, setMode] = useState<Mode>("quick");
  const [merchantName, setMerchantName] = useState("POS");

  useEffect(() => {
    fetch(`/api/merchants/${merchantId}`)
      .then((r) => r.json())
      .then((d) => d.name && setMerchantName(d.name))
      .catch(() => {});
  }, [merchantId]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="font-semibold text-lg">{merchantName} — POS</span>
        <div className="flex items-center gap-2">
          {(["quick", "item", "whatsapp"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                mode === m
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
              style={{ minHeight: 36 }}
            >
              {m === "quick" ? "Quick Sale" : m === "item" ? "Item Sale" : "WhatsApp Orders"}
            </button>
          ))}
          <Link
            href={`/kds/${merchantId}`}
            className="px-3 py-1 text-sm rounded-full bg-gray-800 text-emerald-400 hover:bg-gray-700"
          >
            KDS →
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {mode === "quick" && <QuickSale merchantId={merchantId} />}
        {mode === "item" && <ItemSale merchantId={merchantId} />}
        {mode === "whatsapp" && <WhatsAppOrders merchantId={merchantId} />}
      </div>
    </div>
  );
}

// ── Quick Sale ─────────────────────────────────────────────

function QuickSale({ merchantId }: { merchantId: number }) {
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState("");

  const press = (key: string) => {
    if (key === "C") return setAmount("0");
    if (key === "⌫") return setAmount((a) => (a.length <= 1 ? "0" : a.slice(0, -1)));
    setAmount((a) => (a === "0" ? key : a + key));
  };

  const paise = parseInt(amount) * 100;

  const recordSale = async (method: "cash" | "upi") => {
    if (paise <= 0) return;
    setStatus("Processing...");
    try {
      const res = await fetch(`/api/pos/${merchantId}/sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ name: "Quick Sale", qty: 1, pricePaise: paise }],
          totalPaise: paise,
          paymentMethod: method,
        }),
      });
      const data = await res.json();
      setStatus(`✓ ${data.orderNumber} — ${method.toUpperCase()}`);
      setAmount("0");
      setTimeout(() => setStatus(""), 3000);
    } catch {
      setStatus("Error — try again");
    }
  };

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

  return (
    <div className="flex flex-col items-center justify-center p-6 gap-6 max-w-md mx-auto">
      {/* Amount display */}
      <div className="text-6xl font-mono font-bold text-center py-4">
        {fmtRs(paise)}
      </div>

      {status && (
        <div className="text-center text-emerald-400 font-medium text-lg">{status}</div>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white rounded-xl font-bold text-2xl transition-colors"
            style={{ height: 72, minHeight: 56, fontSize: 24 }}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 w-full">
        <button
          onClick={() => recordSale("upi")}
          disabled={paise <= 0}
          className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold transition-colors"
          style={{ minHeight: 56, fontSize: 18 }}
        >
          Show QR — {fmtRs(paise)}
        </button>
        <button
          onClick={() => recordSale("cash")}
          disabled={paise <= 0}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold transition-colors"
          style={{ minHeight: 56, fontSize: 18 }}
        >
          Record Cash {fmtRs(paise)}
        </button>
      </div>
    </div>
  );
}

// ── Item Sale ──────────────────────────────────────────────

function ItemSale({ merchantId }: { merchantId: number }) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/kds/${merchantId}/menu`)
      .then((r) => r.json())
      .then((d) => setMenuItems(d.items || []))
      .catch(() => {});
  }, [merchantId]);

  const addToCart = (item: MenuItem) => {
    setCart((c) => {
      const existing = c.find((ci) => ci.id === item.id);
      if (existing) {
        return c.map((ci) =>
          ci.id === item.id ? { ...ci, qty: ci.qty + 1 } : ci
        );
      }
      return [...c, { id: item.id, name: item.name, pricePaise: item.pricePaise, qty: 1 }];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart((c) =>
      c
        .map((ci) => (ci.id === id ? { ...ci, qty: ci.qty + delta } : ci))
        .filter((ci) => ci.qty > 0)
    );
  };

  const subtotal = cart.reduce((s, i) => s + i.pricePaise * i.qty, 0);
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + gst;

  const filtered = menuItems.filter(
    (i) =>
      i.isAvailable &&
      (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  );

  const checkout = async (method: "cash" | "upi") => {
    if (cart.length === 0) return;
    setStatus("Processing...");
    try {
      const res = await fetch(`/api/pos/${merchantId}/sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((i) => ({ name: i.name, qty: i.qty, pricePaise: i.pricePaise })),
          totalPaise: total,
          gstPaise: gst,
          paymentMethod: method,
        }),
      });
      const data = await res.json();
      setStatus(`✓ ${data.orderNumber}`);
      setCart([]);
      setTimeout(() => setStatus(""), 3000);
    } catch {
      setStatus("Error");
    }
  };

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Left: Menu items */}
      <div className="flex-1 flex flex-col border-r border-gray-800">
        <div className="p-3">
          <input
            type="text"
            placeholder="Search menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-3 text-lg outline-none"
            style={{ minHeight: 56 }}
          />
        </div>
        <div className="flex-1 overflow-auto p-3 grid grid-cols-2 md:grid-cols-3 gap-2 auto-rows-min">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg p-3 text-left transition-colors"
              style={{ minHeight: 56 }}
            >
              <div className="font-medium text-lg flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    item.isVeg ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                {item.name}
              </div>
              <div className="text-gray-400">{fmtRs(item.pricePaise)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 lg:w-96 flex flex-col bg-gray-900">
        <div className="p-3 border-b border-gray-800 font-semibold text-lg">
          Current Order
          {status && <span className="text-emerald-400 ml-2 text-sm">{status}</span>}
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {cart.length === 0 && (
            <div className="text-gray-500 text-center mt-8">Tap items to add</div>
          )}
          {cart.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-gray-400 text-sm">{fmtRs(item.pricePaise)} each</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQty(item.id, -1)}
                  className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-xl font-bold"
                >
                  −
                </button>
                <span className="w-8 text-center font-mono text-lg">{item.qty}</span>
                <button
                  onClick={() => updateQty(item.id, 1)}
                  className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-xl font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer totals */}
        <div className="p-3 border-t border-gray-800 space-y-2">
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span>
            <span>{fmtRs(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>GST (5%)</span>
            <span>{fmtRs(gst)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>{fmtRs(total)}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => checkout("upi")}
              disabled={cart.length === 0}
              className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold transition-colors"
              style={{ minHeight: 56, fontSize: 18 }}
            >
              UPI QR
            </button>
            <button
              onClick={() => checkout("cash")}
              disabled={cart.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold transition-colors"
              style={{ minHeight: 56, fontSize: 18 }}
            >
              Cash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── WhatsApp Orders ────────────────────────────────────────

function WhatsAppOrders({ merchantId }: { merchantId: number }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    fetch(`/api/pos/${merchantId}/whatsapp-orders`)
      .then((r) => r.json())
      .then(setOrders)
      .catch(() => {});
  }, [merchantId]);

  const statusColor: Record<string, string> = {
    placed: "bg-yellow-600",
    accepted: "bg-blue-600",
    preparing: "bg-purple-600",
    ready: "bg-emerald-600",
    delivered: "bg-gray-600",
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      {orders.length === 0 && (
        <div className="text-gray-500 text-center mt-12 text-lg">
          No recent orders
        </div>
      )}
      {orders.map((o) => (
        <div key={o.id} className="bg-gray-900 rounded-lg p-4 flex items-center justify-between border border-gray-800">
          <div>
            <div className="font-mono font-bold text-lg">{o.orderNumber}</div>
            <div className="text-gray-400 text-sm">
              {o.orderType} · {o.paymentMethod} · {new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-medium">{fmtRs(o.totalPaise)}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${statusColor[o.status] || "bg-gray-600"}`}>
              {o.status}
            </span>
            <Link
              href={`/kds/${merchantId}`}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              KDS →
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
