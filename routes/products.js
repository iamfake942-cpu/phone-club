const express = require("express");
const router = express.Router();
const db = require("../db");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPriceOrder(req) {
  const sortValue = String(
    req.query.price_sort || req.query.price || req.query.sort || ""
  ).toLowerCase();

  const lowToHighValues = new Set([
    "asc",
    "low",
    "lowest",
    "low-to-high",
    "lowest-to-highest",
    "price_asc",
  ]);
  const highToLowValues = new Set([
    "desc",
    "high",
    "highest",
    "high-to-low",
    "highest-to-lowest",
    "price_desc",
  ]);

  if (lowToHighValues.has(sortValue)) {
    return "p.selling_price ASC";
  }

  if (highToLowValues.has(sortValue)) {
    return "p.selling_price DESC";
  }

  return "p.created_at DESC";
}

/*
GET ALL PRODUCTS
*/
router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, DEFAULT_PAGE);
    const requestedLimit = parsePositiveInteger(req.query.limit, DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const orderBy = getPriceOrder(req);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM products p
      WHERE p.quantity > 0
    `);

    const [rows] = await db.query(
      `
      SELECT
          p.id,
          p.name,
          p.slug,
          p.color,
          p.ram,
          p.storage,
          p.processor,
          p.battery_capacity,
          p.selling_price,
          p.mrp,
          p.quantity,
          CASE WHEN p.quantity > 0 THEN TRUE ELSE FALSE END AS is_available,

          pg.name AS product_group_name,
          pg.series,

          b.name AS brand_name,
          b.slug AS brand_slug,

          (
            SELECT image_url
            FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.sort_order
            LIMIT 1
          ) AS image_url

      FROM products p

      INNER JOIN product_groups pg
          ON pg.id = p.product_group_id

      INNER JOIN brands b
          ON b.id = pg.brand_id

      WHERE p.quantity > 0

      ORDER BY ${orderBy}
      LIMIT ?
      OFFSET ?
    `,
      [limit, offset]
    );

    res.json({
      page,
      limit,
      count: rows.length,
      total,
      total_pages: Math.ceil(total / limit),
      products: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch products",
    });
  }
});

/*
GET PRODUCTS BY BRAND
Example: /api/products/brand/samsung
*/
router.get("/brand/:brandSlug", async (req, res) => {
  try {
    const { brandSlug } = req.params;

    const [rows] = await db.query(
      `
      SELECT
          p.id,
          p.name,
          p.slug,
          p.color,
          p.ram,
          p.storage,
          p.processor,
          p.battery_capacity,
          p.selling_price,
          p.mrp,
          p.quantity,
          CASE WHEN p.quantity > 0 THEN TRUE ELSE FALSE END AS is_available,

          pg.name AS product_group_name,
          pg.series,

          b.name AS brand_name,
          b.slug AS brand_slug,

          (
            SELECT image_url
            FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.sort_order
            LIMIT 1
          ) AS image_url

      FROM products p

      INNER JOIN product_groups pg
          ON pg.id = p.product_group_id

      INNER JOIN brands b
          ON b.id = pg.brand_id

      WHERE b.slug = ?

      ORDER BY
          CASE WHEN p.quantity > 0 THEN 0 ELSE 1 END,
          p.created_at DESC
      `,
      [brandSlug]
    );

    res.json({
      brand: brandSlug,
      count: rows.length,
      products: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch products by brand",
    });
  }
});

/*
PRODUCT DETAIL PAGE
*/
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const [[product]] = await db.query(
      `
      SELECT
          p.*,

          pg.id AS group_id,
          pg.name AS group_name,
          pg.series,
          pg.slug AS group_slug,

          b.id AS brand_id,
          b.name AS brand_name,
          b.slug AS brand_slug

      FROM products p

      INNER JOIN product_groups pg
          ON pg.id = p.product_group_id

      INNER JOIN brands b
          ON b.id = pg.brand_id

      WHERE p.slug = ?
      `,
      [slug]
    );

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const [images] = await db.query(
      `
      SELECT
          image_url,
          sort_order
      FROM product_images
      WHERE product_id = ?
      ORDER BY sort_order
      `,
      [product.id]
    );

    const [specifications] = await db.query(
      `
      SELECT
          spec_key,
          spec_value
      FROM product_specifications
      WHERE product_group_id = ?
      ORDER BY spec_key
      `,
      [product.group_id]
    );

    const [variants] = await db.query(
      `
      SELECT
          id,
          slug,
          color,
          ram,
          storage,
          selling_price,
          mrp,

          (
            SELECT image_url
            FROM product_images pi
            WHERE pi.product_id = products.id
            ORDER BY pi.sort_order
            LIMIT 1
          ) AS image_url

      FROM products

      WHERE product_group_id = ?
      ORDER BY selling_price ASC
      `,
      [product.product_group_id]
    );

    res.json({
      product,
      images,
      specifications,
      variants,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch product details",
    });
  }
});

/*
SEARCH
*/
router.get("/search/query", async (req, res) => {
  try {
    const q = req.query.q || "";

    const [rows] = await db.query(
      `
      SELECT
          id,
          name,
          slug,
          selling_price,
          mrp

      FROM products

      WHERE name LIKE ?

      LIMIT 20
      `,
      [`%${q}%`]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Search failed",
    });
  }
});

module.exports = router;
