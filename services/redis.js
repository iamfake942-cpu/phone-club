const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || "127.0.0.1"}:${process.env.REDIS_PORT || 6379}`;

const client = createClient({
  url: redisUrl,
  password: process.env.REDIS_PASSWORD || undefined,
});

client.on("error", (error) => {
  console.error("Redis client error:", error);
});

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
  }
}

module.exports = {
  client,
  connectRedis,
};
