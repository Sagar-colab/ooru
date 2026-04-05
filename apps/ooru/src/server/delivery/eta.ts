/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate travel time in minutes given distance.
 */
export function estimateETA(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  speedKmh: number = 20
): number {
  const km = haversineKm(fromLat, fromLng, toLat, toLng);
  return Math.round((km / speedKmh) * 60);
}

/**
 * Compound ETA for a delivery order.
 * remaining prep + rider→restaurant + restaurant→consumer
 */
export function compoundETA(params: {
  orderAcceptedAt?: Date;
  avgPrepMinutes?: number;
  riderLat?: number;
  riderLng?: number;
  merchantLat?: number;
  merchantLng?: number;
  consumerLat?: number;
  consumerLng?: number;
}): number {
  const {
    orderAcceptedAt,
    avgPrepMinutes = 15,
    riderLat = 0,
    riderLng = 0,
    merchantLat = 0,
    merchantLng = 0,
    consumerLat = 0,
    consumerLng = 0,
  } = params;

  // Remaining prep time
  let remainingPrep = avgPrepMinutes;
  if (orderAcceptedAt) {
    const elapsed = (Date.now() - orderAcceptedAt.getTime()) / 60000;
    remainingPrep = Math.max(0, avgPrepMinutes - elapsed);
  }

  const riderToMerchant =
    riderLat && merchantLat
      ? estimateETA(riderLat, riderLng, merchantLat, merchantLng)
      : 5;

  const merchantToConsumer =
    merchantLat && consumerLat
      ? estimateETA(merchantLat, merchantLng, consumerLat, consumerLng)
      : 10;

  return Math.round(remainingPrep + riderToMerchant + merchantToConsumer);
}
