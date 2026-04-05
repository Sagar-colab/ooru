/**
 * Simple fuzzy match for menu items.
 * Returns the best matching item or null.
 */
export function fuzzyMatchItem<T extends { name: string }>(
  items: T[],
  search: string
): T | null {
  const s = search.toLowerCase().trim();
  if (!s) return null;

  // Exact match
  const exact = items.find((i) => i.name.toLowerCase() === s);
  if (exact) return exact;

  // Search term contained in item name
  const contained = items.find((i) => i.name.toLowerCase().includes(s));
  if (contained) return contained;

  // Item name contained in search term
  const reverse = items.find((i) => s.includes(i.name.toLowerCase()));
  if (reverse) return reverse;

  // Word overlap scoring
  const searchWords = s.split(/\s+/);
  let bestScore = 0;
  let bestItem: T | null = null;

  for (const item of items) {
    const itemWords = item.name.toLowerCase().split(/\s+/);
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
