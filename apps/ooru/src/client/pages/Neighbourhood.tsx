import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MerchantData {
  id: number; name: string; cuisine: string[]; lat: number; lng: number;
  isOpen: boolean; address: string; phone: string;
}

interface BCFData {
  id: number; category: string; title: string; description: string;
  status: string; upvotes: number; lat: number | null; lng: number | null;
  createdAt: string;
}

interface NeighbourhoodData {
  slug: string; name: string; centerLat: number; centerLng: number;
}

const PILLS = [
  { id: "today", emoji: "🏠", label: "Today" },
  { id: "issues", emoji: "📍", label: "Issues" },
  { id: "explore", emoji: "🔍", label: "Explore" },
  { id: "events", emoji: "🎪", label: "Events" },
  { id: "community", emoji: "👥", label: "Community" },
  { id: "here", emoji: "🍛", label: "Here" },
];

const BCF_COLORS: Record<string, string> = {
  reported: "#EAB308", verified: "#8B5CF6", filed: "#3B82F6",
  in_progress: "#F97316", resolved: "#22C55E",
};

const GLASS = {
  background: "rgba(10,10,15,0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(136,136,187,0.2)",
  borderRadius: "20px",
} as React.CSSProperties;

function violetIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;background:#8B5CF6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function bcfIcon(status: string) {
  const color = BCF_COLORS[status] || "#6B7280";
  return L.divIcon({
    className: "",
    html: `<div style="width:20px;height:20px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export default function Neighbourhood() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "indiranagar";
  const [activePill, setActivePill] = useState("today");
  const [neighbourhood, setNeighbourhood] = useState<NeighbourhoodData | null>(null);
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [bcfs, setBcfs] = useState<BCFData[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantData | null>(null);
  const [selectedBcf, setSelectedBcf] = useState<BCFData | null>(null);
  const [evoExpanded, setEvoExpanded] = useState(false);
  const [hexPolygons, setHexPolygons] = useState<{ coords: [number, number][]; score: number }[]>([]);

  useEffect(() => {
    fetch(`/api/neighbourhoods/${slug}`).then(r => r.json()).then(setNeighbourhood).catch(() => {});
    fetch(`/api/merchants?neighbourhood_slug=${slug}`).then(r => r.json()).then(setMerchants).catch(() => {});
    fetch(`/api/bcfs/${slug}`).then(r => r.json()).then(setBcfs).catch(() => {});
  }, [slug]);

  // Generate H3 hex grid
  useEffect(() => {
    if (!neighbourhood) return;
    generateHexGrid(neighbourhood.centerLat, neighbourhood.centerLng).then(setHexPolygons);
  }, [neighbourhood]);

  const center: [number, number] = neighbourhood
    ? [neighbourhood.centerLat, neighbourhood.centerLng]
    : [12.9784, 77.6408];

  const upvoteBcf = async (id: number) => {
    await fetch(`/api/bcfs/${id}/upvote`, { method: "PATCH" });
    setBcfs(prev => prev.map(b => b.id === id ? { ...b, upvotes: (b.upvotes || 0) + 1 } : b));
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#0b141a" }}>
      <MapContainer
        center={center}
        zoom={15}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
        />

        {/* H3 hex grid */}
        {activePill === "today" && hexPolygons.map((hex, i) => (
          <Polygon
            key={i}
            positions={hex.coords}
            pathOptions={{
              fillColor: scoreColor(hex.score),
              fillOpacity: 0.2,
              color: scoreColor(hex.score),
              weight: 1,
              opacity: 0.4,
            }}
          >
            <Popup>{`Health: ${hex.score}/100`}</Popup>
          </Polygon>
        ))}

        {/* Restaurant markers */}
        {(activePill === "here" || activePill === "today") && merchants.map(m => (
          m.lat && m.lng ? (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              icon={violetIcon()}
              eventHandlers={{ click: () => { setSelectedMerchant(m); setSelectedBcf(null); } }}
            >
              <Popup>{m.name}</Popup>
            </Marker>
          ) : null
        ))}

        {/* BCF markers */}
        {activePill === "issues" && bcfs.map(b => (
          b.lat && b.lng ? (
            <Marker
              key={b.id}
              position={[b.lat, b.lng]}
              icon={bcfIcon(b.status)}
              eventHandlers={{ click: () => { setSelectedBcf(b); setSelectedMerchant(null); } }}
            />
          ) : null
        ))}
      </MapContainer>

      {/* Pills */}
      <div style={{ position: "absolute", top: 16, left: 16, right: 16, zIndex: 1000 }}>
        <div style={{
          display: "flex", gap: 8, overflowX: "auto", padding: "8px 4px",
          scrollbarWidth: "none",
        }}>
          {PILLS.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePill(p.id)}
              style={{
                ...GLASS,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: activePill === p.id ? 700 : 400,
                color: activePill === p.id ? "#fff" : "#aaa",
                cursor: "pointer",
                whiteSpace: "nowrap",
                borderColor: activePill === p.id ? "#8B5CF6" : "rgba(136,136,187,0.2)",
                background: activePill === p.id ? "rgba(139,92,246,0.3)" : GLASS.background,
              }}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom sheet — merchant */}
      {selectedMerchant && (
        <div style={{ ...GLASS, position: "absolute", bottom: 80, left: 16, right: 16, zIndex: 1000, padding: 20 }}>
          <button onClick={() => setSelectedMerchant(null)} style={{ position: "absolute", top: 8, right: 12, background: "none", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}>×</button>
          <h3 style={{ color: "#fff", fontSize: 20, margin: 0 }}>{selectedMerchant.name}</h3>
          <div style={{ color: "#aaa", fontSize: 14, marginTop: 4 }}>
            {selectedMerchant.cuisine?.join(", ")} · {selectedMerchant.address}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
              background: selectedMerchant.isOpen ? "#22C55E" : "#EF4444", color: "#fff",
            }}>
              {selectedMerchant.isOpen ? "Open" : "Closed"}
            </span>
          </div>
          <a
            href={`https://wa.me/91${selectedMerchant.phone}?text=I+want+to+order+from+${encodeURIComponent(selectedMerchant.name)}`}
            target="_blank"
            style={{
              display: "block", marginTop: 12, textAlign: "center", padding: "12px 0",
              background: "#25D366", color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 16, textDecoration: "none",
            }}
          >
            Order via WhatsApp
          </a>
        </div>
      )}

      {/* Bottom sheet — BCF */}
      {selectedBcf && (
        <div style={{ ...GLASS, position: "absolute", bottom: 80, left: 16, right: 16, zIndex: 1000, padding: 20 }}>
          <button onClick={() => setSelectedBcf(null)} style={{ position: "absolute", top: 8, right: 12, background: "none", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}>×</button>
          <h3 style={{ color: "#fff", fontSize: 18, margin: 0 }}>BCF #{selectedBcf.id}: {selectedBcf.title}</h3>
          <div style={{ color: "#aaa", fontSize: 14, marginTop: 4 }}>{selectedBcf.description}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
              background: BCF_COLORS[selectedBcf.status] || "#6B7280", color: "#fff",
            }}>
              {selectedBcf.status}
            </span>
            <span style={{ color: "#aaa", fontSize: 13 }}>{selectedBcf.category}</span>
          </div>
          <button
            onClick={() => upvoteBcf(selectedBcf.id)}
            style={{
              marginTop: 12, width: "100%", padding: "10px 0", background: "rgba(139,92,246,0.3)",
              border: "1px solid #8B5CF6", borderRadius: 12, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}
          >
            👍 Upvote ({selectedBcf.upvotes || 0})
          </button>
        </div>
      )}

      {/* Evo Box */}
      <div
        onClick={() => setEvoExpanded(!evoExpanded)}
        style={{
          ...GLASS,
          position: "absolute",
          bottom: 80,
          left: selectedMerchant || selectedBcf ? -9999 : 16,
          right: 16,
          zIndex: 999,
          padding: "12px 16px",
          height: evoExpanded ? 120 : 48,
          transition: "height 0.2s",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <div style={{ color: "#8B5CF6", fontSize: 13, fontWeight: 600 }}>Ooru — your neighbourhood AI</div>
        {evoExpanded && (
          <div style={{ marginTop: 8, color: "#aaa", fontSize: 13 }}>
            Ask about restaurants, report issues, or explore your neighbourhood.
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 64, zIndex: 1000,
        display: "flex", justifyContent: "space-around", alignItems: "center",
        background: "rgba(10,10,15,0.9)", borderTop: "1px solid rgba(136,136,187,0.15)",
      }}>
        {[
          { icon: "🗺️", label: "Map", href: `/neighbourhood/${slug}` },
          { icon: "📍", label: "Issues", href: "#" },
          { icon: "🍛", label: "Here", href: "#" },
          { icon: "👤", label: "Profile", href: "#" },
        ].map(tab => (
          <Link key={tab.label} href={tab.href} style={{ textDecoration: "none", textAlign: "center", color: "#8696a0", fontSize: 11 }}>
            <div style={{ fontSize: 22 }}>{tab.icon}</div>
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── H3 hex grid generation ─────────────────────────────────

async function generateHexGrid(
  centerLat: number,
  centerLng: number
): Promise<{ coords: [number, number][]; score: number }[]> {
  try {
    const h3 = await import("h3-js");
    // Get hexes in a ~1km radius
    const centerHex = h3.latLngToCell(centerLat, centerLng, 9);
    const hexes = h3.gridDisk(centerHex, 8);

    return hexes.map(hex => {
      const boundary = h3.cellToBoundary(hex);
      const coords: [number, number][] = boundary.map(([lat, lng]) => [lat, lng]);
      const score = 40 + Math.floor(Math.random() * 50); // mock 40-90
      return { coords, score };
    });
  } catch {
    return [];
  }
}

function scoreColor(score: number): string {
  if (score >= 75) return "#22C55E";
  if (score >= 55) return "#EAB308";
  return "#EF4444";
}
