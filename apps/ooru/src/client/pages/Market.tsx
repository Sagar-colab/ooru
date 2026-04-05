import { useEffect, useState } from "react";
import { useParams } from "wouter";

interface MarketItem {
  id: number;
  itemName: string;
  description: string | null;
  photoUrl: string | null;
  pricePaise: number;
  unit: string;
  category: string;
  shopName: string;
  shopType: string;
  shopPhone: string;
}

interface Category {
  name: string;
  count: number;
}

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const CATEGORY_EMOJI: Record<string, string> = {
  grocery: "🛒",
  salon: "💇",
  pharmacy: "💊",
  mobile_repair: "📱",
  kirana: "🏪",
  restaurant: "🍽️",
  general: "📦",
};

export default function Market() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "indiranagar";
  const [items, setItems] = useState<MarketItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    const url = activeCategory
      ? `/api/market/${slug}?category=${activeCategory}`
      : `/api/market/${slug}`;
    fetch(url).then((r) => r.json()).then(setItems).catch(() => {});
  }, [slug, activeCategory]);

  useEffect(() => {
    fetch(`/api/market/${slug}/categories`).then((r) => r.json()).then(setCategories).catch(() => {});
  }, [slug]);

  const displayName = slug.charAt(0).toUpperCase() + slug.slice(1);

  // Group by category
  const grouped = new Map<string, MarketItem[]>();
  for (const item of items) {
    const list = grouped.get(item.category) || [];
    list.push(item);
    grouped.set(item.category, list);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
        <h1 className="text-2xl font-bold">{displayName} Market</h1>
        <p className="text-gray-400 text-sm mt-1">
          Products from {new Set(items.map((i) => i.shopName)).size} local shops
        </p>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 px-6 py-3 overflow-x-auto border-b border-gray-800" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
            !activeCategory
              ? "bg-purple-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          All ({items.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
            className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.name
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {CATEGORY_EMOJI[cat.name] || "📦"} {cat.name} ({cat.count})
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="p-6">
        {Array.from(grouped.entries()).map(([category, catItems]) => (
          <div key={category} className="mb-8">
            <h2 className="text-lg font-semibold mb-3 text-gray-300">
              {CATEGORY_EMOJI[category] || "📦"} {category.charAt(0).toUpperCase() + category.slice(1)}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {catItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden flex flex-col"
                >
                  {/* Photo placeholder */}
                  <div className="h-24 bg-gray-800 flex items-center justify-center text-3xl">
                    {CATEGORY_EMOJI[item.category] || "📦"}
                  </div>

                  <div className="p-3 flex-1 flex flex-col">
                    <div className="font-medium text-sm">{item.itemName}</div>
                    <div className="text-gray-500 text-xs mt-1">{item.shopName}</div>
                    <div className="flex items-center justify-between mt-auto pt-3">
                      <span className="text-lg font-bold text-purple-400">
                        {fmtRs(item.pricePaise)}
                      </span>
                      <a
                        href={`https://wa.me/91${item.shopPhone}?text=I+want+to+order+${encodeURIComponent(item.itemName)}+from+${encodeURIComponent(displayName)}+Market`}
                        target="_blank"
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg"
                      >
                        Order
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center text-gray-500 mt-16 text-lg">
            No products listed yet
          </div>
        )}
      </div>
    </div>
  );
}
