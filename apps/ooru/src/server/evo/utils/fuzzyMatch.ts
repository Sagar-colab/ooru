/**
 * Simple fuzzy match for menu items / merchants.
 * Returns the best matching item or null.
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[''`]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function fuzzyMatchItem<T extends { name: string }>(
  items: T[],
  search: string
): T | null {
  const s = normalize(search);
  if (!s) return null;

  // Exact match
  const exact = items.find((i) => normalize(i.name) === s);
  if (exact) return exact;

  // Search term contained in item name
  const contained = items.find((i) => normalize(i.name).includes(s));
  if (contained) return contained;

  // Item name contained in search term
  const reverse = items.find((i) => s.includes(normalize(i.name)));
  if (reverse) return reverse;

  // Word overlap scoring
  const searchWords = s.split(/\s+/);
  let bestScore = 0;
  let bestItem: T | null = null;

  for (const item of items) {
    const itemWords = normalize(item.name).split(/\s+/);
    let score = 0;
    for (const sw of searchWords) {
      for (const iw of itemWords) {
        if (iw.includes(sw) || sw.includes(iw)) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore > 0 ? bestItem : null;
}
