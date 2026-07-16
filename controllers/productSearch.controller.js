const productSearchService = require("../services/productSearch.service");

function normalizeQuery(value) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 50) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length <= 50 ? normalized : null;
}

async function autocomplete(req, res, next) {
  const query = normalizeQuery(req.query.q);
  if (query === null) {
    return res.status(400).json({ message: "q must be a string of at most 50 characters" });
  }
  if (query.length < 2) return res.status(200).json({ query, brands: [], products: [] });

  try {
    return res.json(await productSearchService.search(query));
  } catch (error) {
    console.error(JSON.stringify({ event: "autocomplete_search_failed", message: error.message }));
    return next(error);
  }
}

module.exports = { normalizeQuery, autocomplete };
