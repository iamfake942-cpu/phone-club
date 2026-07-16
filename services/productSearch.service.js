const repository = require("../repositories/productSearch.repository");
const { client: redisClient } = require("./redis");

const VERSION_KEY = "search:autocomplete:version";
const DEFAULT_VERSION = "1";

function cacheTtl() {
  const value = Number.parseInt(process.env.SEARCH_CACHE_TTL_SECONDS, 10);
  return Number.isInteger(value) && value > 0 ? value : 600;
}

function log(event, details = {}) {
  console.log(JSON.stringify({ event, ...details }));
}

function assertRedisReady(redis) {
  // The real node-redis client queues commands while it is reconnecting. That
  // would leave an HTTP search request waiting indefinitely instead of falling
  // back to MySQL. Test doubles do not expose isReady and remain supported.
  if (typeof redis.isReady === "boolean" && !redis.isReady) {
    throw new Error("Redis is not ready");
  }
}

async function getVersion(redis) {
  assertRedisReady(redis);
  const version = await redis.get(VERSION_KEY);
  return version || DEFAULT_VERSION;
}

async function search(query, dependencies = {}) {
  const redis = dependencies.redis || redisClient;
  const searchRepository = dependencies.repository || repository;
  const startedAt = Date.now();
  let cacheKey;

  try {
    const version = await getVersion(redis);
    cacheKey = `search:autocomplete:${version}:${query}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      log("autocomplete_search", { cache: "hit", durationMs: Date.now() - startedAt });
      return JSON.parse(cached);
    }
    log("autocomplete_cache", { cache: "miss" });
  } catch (error) {
    console.error(JSON.stringify({ event: "autocomplete_redis_fallback", message: error.message }));
    cacheKey = undefined;
  }

  const matches = await searchRepository.searchAutocomplete(query);
  const result = { query, ...matches };

  if (cacheKey) {
    try {
      assertRedisReady(redis);
      await redis.set(cacheKey, JSON.stringify(result), { EX: cacheTtl() });
    } catch (error) {
      console.error(JSON.stringify({ event: "autocomplete_cache_write_failed", message: error.message }));
    }
  }

  log("autocomplete_search", { cache: "miss", durationMs: Date.now() - startedAt });
  return result;
}

async function invalidateAutocompleteCache(redis = redisClient) {
  try {
    assertRedisReady(redis);
    if (!(await redis.get(VERSION_KEY))) {
      await redis.set(VERSION_KEY, DEFAULT_VERSION, { NX: true });
    }
    return await redis.incr(VERSION_KEY);
  } catch (error) {
    console.error(JSON.stringify({ event: "autocomplete_cache_invalidation_failed", message: error.message }));
    return null;
  }
}

module.exports = { VERSION_KEY, cacheTtl, search, invalidateAutocompleteCache };
