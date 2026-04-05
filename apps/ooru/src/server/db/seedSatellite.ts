import "dotenv/config";
import { db, pool } from "./index.js";
import { satelliteCache, neighbourhoodScores } from "./schema.js";
import { latLngToCell, gridDisk, cellToLatLng } from "h3-js";

const SLUG = "indiranagar";
const CENTER_LAT = 12.9784;
const CENTER_LNG = 77.6408;
const RES = 9;
const RING = 8;

const OVERLAYS = [
  { type: "ndvi", min: 0.3, max: 0.7 },
  { type: "heat", min: 28, max: 38 },
  { type: "flood", min: 0.1, max: 0.4 },
  { type: "safety", min: 0.5, max: 0.9 },
  { type: "water", min: 0.6, max: 0.9 },
  { type: "health", min: 0.5, max: 0.95 },
];

function rand(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

async function seed() {
  console.log("[seed-satellite] Generating H3 cells...");
  const centerHex = latLngToCell(CENTER_LAT, CENTER_LNG, RES);
  const hexes = gridDisk(centerHex, RING);
  console.log(`[seed-satellite] ${hexes.length} cells at res ${RES}`);

  // Seed satellite cache
  console.log("[seed-satellite] Inserting overlay data...");
  const values = [];
  for (const hex of hexes) {
    for (const overlay of OVERLAYS) {
      values.push({
        neighbourhoodSlug: SLUG,
        hexCell: hex,
        overlayType: overlay.type,
        value: rand(overlay.min, overlay.max),
        source: "mock",
      });
    }
  }

  // Batch insert
  const batchSize = 500;
  for (let i = 0; i < values.length; i += batchSize) {
    await db.insert(satelliteCache).values(values.slice(i, i + batchSize));
  }
  console.log(`[seed-satellite] ${values.length} overlay records inserted`);

  // Calculate neighbourhood scores
  console.log("[seed-satellite] Calculating scores...");
  const scoreValues = [];
  for (const hex of hexes) {
    const infra = rand(0.5, 0.9);
    const env = rand(0.4, 0.85);
    const safety = rand(0.5, 0.9);
    const gov = rand(0.3, 0.8);
    const green = rand(0.3, 0.7);
    const heat = rand(0.4, 0.8);
    const flood = rand(0.6, 0.95);
    const mobility = rand(0.4, 0.85);
    const commercial = rand(0.3, 0.9);
    const live = rand(0.5, 0.9);

    const composite =
      infra * 0.15 +
      env * 0.12 +
      safety * 0.12 +
      gov * 0.10 +
      green * 0.10 +
      heat * 0.08 +
      flood * 0.08 +
      mobility * 0.10 +
      commercial * 0.08 +
      live * 0.07;

    scoreValues.push({
      neighbourhoodSlug: SLUG,
      hexCell: hex,
      infrastructureScore: infra,
      environmentScore: env,
      safetyScore: safety,
      governanceScore: gov,
      greenCoverScore: green,
      heatIslandScore: heat,
      floodRiskScore: flood,
      mobilityScore: mobility,
      commercialVitalityScore: commercial,
      liveabilityScore: live,
      compositeScore: Math.round(composite * 100) / 100,
    });
  }

  for (let i = 0; i < scoreValues.length; i += batchSize) {
    await db.insert(neighbourhoodScores).values(scoreValues.slice(i, i + batchSize));
  }
  console.log(`[seed-satellite] ${scoreValues.length} score records inserted`);

  console.log("[seed-satellite] Done!");
  await pool.end();
}

seed().catch((e) => {
  console.error("[seed-satellite] Failed:", e);
  process.exit(1);
});
