const db = require("../db");

const BRAND_LIMIT = 3;
const PRODUCT_LIMIT = 8;

function buildBooleanPrefixQuery(query) {
  const tokens = query.match(/[\p{L}\p{N}]+/gu) || [];
  return tokens.map((token) => `+${token.toLowerCase()}*`).join(" ");
}

async function searchBrands(query, database = db) {
  const [rows] = await database.query(
    `SELECT id, name, slug, logo_url AS logoUrl
     FROM brands
     WHERE name_search LIKE CONCAT(?, '%')
     ORDER BY CASE WHEN name_search = ? THEN 0 ELSE 1 END, name ASC
     LIMIT ${BRAND_LIMIT}`,
    [query, query]
  );
  return rows;
}

async function searchProducts(query, database = db) {
  const fullTextQuery = buildBooleanPrefixQuery(query);
  if (!fullTextQuery) return [];

  const [rows] = await database.query(
    `SELECT
       p.id,
       p.name,
       b.name AS brand,
       p.slug,
       (SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.sort_order
        LIMIT 1) AS imageUrl,
       p.selling_price AS price,
       CASE WHEN p.quantity > 0 THEN TRUE ELSE FALSE END AS inStock
     FROM products p
     INNER JOIN product_groups pg ON pg.id = p.product_group_id
     INNER JOIN brands b ON b.id = pg.brand_id
     WHERE MATCH(p.name) AGAINST (? IN BOOLEAN MODE)
     ORDER BY
       CASE WHEN p.name_search LIKE CONCAT(?, '%') THEN 0 ELSE 1 END,
       CASE WHEN p.quantity > 0 THEN 0 ELSE 1 END,
       MATCH(p.name) AGAINST (? IN BOOLEAN MODE) DESC,
       p.name_search ASC
     LIMIT ${PRODUCT_LIMIT}`,
    [fullTextQuery, query, fullTextQuery]
  );
  return rows.map((row) => ({
    ...row,
    price: Number(row.price),
    inStock: Boolean(row.inStock),
  }));
}

async function searchAutocomplete(query, database = db) {
  const [brands, products] = await Promise.all([
    searchBrands(query, database),
    searchProducts(query, database),
  ]);
  return { brands, products };
}

module.exports = {
  BRAND_LIMIT,
  PRODUCT_LIMIT,
  buildBooleanPrefixQuery,
  searchBrands,
  searchProducts,
  searchAutocomplete,
};
