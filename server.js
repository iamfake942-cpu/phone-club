require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const pool = require("./db");
const { client: redisClient, connectRedis } = require("./services/redis");

const app = express();

function validateEnvironment() {
  if (process.env.NODE_ENV !== "production") return;

  const required = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  if (!process.env.DATABASE_URL) {
    required.push("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME");
  }
  if (!process.env.REDIS_URL) required.push("REDIS_HOST");

  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ALLOWED_ORIGINS,
  process.env.NODE_ENV === "production" ? "" : "http://localhost:5173",
]
  .filter(Boolean)
  .join(",")
  .split(",")
  .map((origin) =>
    origin
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\/+$/, "")
  )
  .filter((origin, index, origins) => origin && origins.indexOf(origin) === index);

app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = origin?.replace(/\/+$/, "");
      if (!origin || allowedOrigins.includes(normalizedOrigin)) return callback(null, true);
      const error = new Error("Origin is not allowed by CORS");
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
  })
);
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/health/database", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({ status: "unavailable", timestamp: new Date().toISOString() });
  }
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/brands", require("./routes/brands"));
app.use("/api/products", require("./routes/products"));
app.use("/api/cart", require("./routes/cart.routes"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/orders", require("./routes/orders.routes"));
app.use("/api/payments", require("./routes/payments.routes"));

app.get("/", (req, res) => {
  res.json({
    status: "running",
  });
});

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found ..",
  });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "Something went wrong"
        : err.message || "Request failed",
  });
});

const PORT = Number(process.env.PORT) || 5000;
let server;
let shuttingDown = false;

async function start() {
  validateEnvironment();
  console.log(`Configured CORS origins: ${allowedOrigins.join(", ") || "none"}`);
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
  connectRedis().catch((error) => {
    console.error("Failed to connect to Redis:", error.message);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; shutting down`);

  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await pool.end();
    if (redisClient.isOpen) await redisClient.quit();
    process.exit(0);
  } catch (error) {
    console.error("Shutdown failed:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((error) => {
  console.error("Application startup failed:", error.message);
  process.exit(1);
});
