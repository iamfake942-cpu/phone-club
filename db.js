const mysql = require("mysql2/promise");

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function databaseUrlConfig(value) {
  const url = new URL(value);
  if (!["mysql:", "mysql2:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use the mysql protocol");
  }

  return {
    host: url.hostname,
    port: parsePort(url.port, 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

const connection = process.env.DATABASE_URL
  ? databaseUrlConfig(process.env.DATABASE_URL)
  : {
      host: process.env.DB_HOST,
      port: parsePort(process.env.DB_PORT, 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

const ssl = process.env.DB_SSL === "true"
  ? { rejectUnauthorized: true }
  : undefined;

const pool = mysql.createPool({
  ...connection,
  ssl,

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
});

module.exports = pool;
