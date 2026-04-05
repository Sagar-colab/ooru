import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env"), override: true });
import express from "express";
import { pool } from "./db/index.js";
import healthRouter from "./routes/health.js";
import consumersRouter from "./routes/consumers.js";
import merchantsRouter from "./routes/merchants.js";
import ordersRouter from "./routes/orders.js";
import neighbourhoodsRouter from "./routes/neighbourhoods.js";
import shopBusinessesRouter from "./routes/shopBusinesses.js";
import evoRouter from "./routes/evo.js";
import whatsappRouter from "./routes/whatsapp.js";
import demoRouter from "./routes/demo.js";
import kdsRouter from "./routes/kds.js";
import posRouter from "./routes/pos.js";
import dukaanRouter from "./routes/dukaan.js";
import bcfsRouter from "./routes/bcfs.js";
import satelliteRouter from "./routes/satellite.js";
import marketRouter from "./routes/market.js";
import { scheduleMorningBrief } from "./crons/morningBrief.js";
import { createServer } from "http";
import { setupSocket } from "./socket.js";

const app = express();
const httpServer = createServer(app);
setupSocket(httpServer);
const PORT = Number(process.env.PORT) || 3002;

// Middleware
app.use(
  express.json({ limit: "10mb" }),
  express.urlencoded({ extended: true })
);

// CORS
app.use((_req, res, next) => {
  const allowed = ["http://localhost:5173", "https://ooru.ai"];
  const origin = _req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Routes
app.use("/api/health", healthRouter);
app.use("/api/consumers", consumersRouter);
app.use("/api/merchants", merchantsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/neighbourhoods", neighbourhoodsRouter);
app.use("/api/shop-businesses", shopBusinessesRouter);
app.use("/api/evo", evoRouter);
app.use("/api/webhook", whatsappRouter);
app.use("/api/demo", demoRouter);
app.use("/api/kds", kdsRouter);
app.use("/api/pos", posRouter);
app.use("/dukaan", dukaanRouter);
app.use("/api/bcfs", bcfsRouter);
app.use("/api/satellite", satelliteRouter);
app.use("/api/market", marketRouter);

// Serve React dist in production
if (process.env.NODE_ENV === "production") {
  const { default: path } = await import("path");
  const distPath = path.resolve(import.meta.dirname, "../../dist/public");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[ERROR]", err.message, err.stack);
    res.status(500).json({ error: "Internal server error" });
  }
);

// Start
async function start() {
  try {
    const client = await pool.connect();
    client.release();
    console.log(`[ooru] DB connected`);
  } catch (e) {
    console.error("[ooru] DB connection failed:", e);
    process.exit(1);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[ooru] Server running on port ${PORT}`);
    if (process.env.NODE_ENV === "production") {
      scheduleMorningBrief();
    }
  });
}

start();
