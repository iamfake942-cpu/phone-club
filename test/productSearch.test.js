const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../controllers/productSearch.controller");
const service = require("../services/productSearch.service");
const repository = require("../repositories/productSearch.repository");

test("normalizes case and repeated surrounding spaces", () => {
  assert.equal(controller.normalizeQuery("  Sam   Sung  "), "sam sung");
  assert.equal(controller.normalizeQuery(["sam"]), null);
  assert.equal(controller.normalizeQuery("x".repeat(51)), null);
});

test("short query returns empty arrays without calling the service", async () => {
  const req = { query: { q: " s " } };
  const response = {};
  response.status = (status) => { response.statusCode = status; return response; };
  response.json = (body) => { response.body = body; return response; };
  await controller.autocomplete(req, response, assert.fail);
  assert.deepEqual(response.body, { query: "s", brands: [], products: [] });
});

function fakeRedis(values = {}) {
  return {
    values,
    async get(key) { return this.values[key] ?? null; },
    async set(key, value, options) { this.lastSet = { key, value, options }; this.values[key] = value; },
    async incr(key) { this.values[key] = String(Number(this.values[key] || 0) + 1); return Number(this.values[key]); },
  };
}

test("cache hit skips MySQL", async () => {
  const expected = { query: "sam", brands: [{ name: "Samsung" }], products: [] };
  const redis = fakeRedis({ [service.VERSION_KEY]: "4", "search:autocomplete:4:sam": JSON.stringify(expected) });
  const result = await service.search("sam", { redis, repository: { searchAutocomplete: assert.fail } });
  assert.deepEqual(result, expected);
});

test("cache miss queries repository and caches limits-compatible results", async () => {
  const redis = fakeRedis();
  const result = await service.search("sam", { redis, repository: { async searchAutocomplete() { return { brands: [{ name: "Samsung" }], products: [{ name: "Samsung Galaxy" }] }; } } });
  assert.equal(result.brands[0].name, "Samsung");
  assert.equal(redis.lastSet.options.EX, 600);
});

test("Redis failure falls back to MySQL", async () => {
  const redis = { async get() { throw new Error("offline"); } };
  const result = await service.search("sam", { redis, repository: { async searchAutocomplete() { return { brands: [], products: [{ name: "Samsung Galaxy" }] }; } } });
  assert.equal(result.products.length, 1);
});

test("reconnecting Redis is bypassed instead of hanging the request", async () => {
  let redisCommandCalled = false;
  const redis = {
    isReady: false,
    async get() { redisCommandCalled = true; return new Promise(() => {}); },
  };
  const result = await service.search("apple", {
    redis,
    repository: {
      async searchAutocomplete() {
        return { brands: [{ name: "Apple" }], products: [] };
      },
    },
  });
  assert.equal(redisCommandCalled, false);
  assert.equal(result.brands[0].name, "Apple");
});

test("database failures are propagated and not cached", async () => {
  const redis = fakeRedis();
  await assert.rejects(service.search("sam", { redis, repository: { async searchAutocomplete() { throw new Error("db failed"); } } }), /db failed/);
  assert.equal(redis.lastSet, undefined);
});

test("repository uses prefix parameters, fixed limits, and stock ranking", async () => {
  const calls = [];
  const database = { async query(sql, params) { calls.push({ sql, params }); return [[{ price: "74999.00", inStock: 1 }]]; } };
  await repository.searchBrands("sam", database);
  const products = await repository.searchProducts("sam'; DROP TABLE products; --", database);
  assert.deepEqual(calls[0].params, ["sam", "sam"]);
  assert.deepEqual(calls[1].params, ["+sam* +drop* +table* +products*", "sam'; DROP TABLE products; --", "+sam* +drop* +table* +products*"]);
  assert.match(calls[0].sql, /LIMIT 3/);
  assert.match(calls[1].sql, /LIMIT 8/);
  assert.match(calls[1].sql, /p\.quantity > 0/);
  assert.doesNotMatch(calls[1].sql, /DROP TABLE/);
  assert.equal(products[0].inStock, true);
});

test("product search uses indexed word prefixes for model names", async () => {
  assert.equal(repository.buildBooleanPrefixQuery("A06"), "+a06*");
  assert.equal(repository.buildBooleanPrefixQuery("  galaxy   a07 5g "), "+galaxy* +a07* +5g*");

  let call;
  const database = {
    async query(sql, params) {
      call = { sql, params };
      return [[]];
    },
  };
  await repository.searchProducts("a06", database);
  assert.match(call.sql, /MATCH\(p\.name\) AGAINST \(\? IN BOOLEAN MODE\)/);
  assert.deepEqual(call.params, ["+a06*", "a06", "+a06*"]);
});

test("cache invalidation increments version", async () => {
  const redis = fakeRedis({ [service.VERSION_KEY]: "7" });
  assert.equal(await service.invalidateAutocompleteCache(redis), 8);
});

test("first invalidation advances beyond the implicit default version", async () => {
  const redis = fakeRedis();
  assert.equal(await service.invalidateAutocompleteCache(redis), 2);
});
