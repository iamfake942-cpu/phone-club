const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM brands
      ORDER BY name
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch brands",
    });
  }
});

router.get("/:slug/products", async (req, res) => {
  try {
    const { slug } = req.params;

    const [rows] = await db.query(
      `
      SELECT
          p.id,
          p.name,
          p.slug,
          p.color,
          p.ram,
          p.storage,
          p.selling_price,
          p.mrp,
          p.quantity,
          CASE WHEN p.quantity > 0 THEN TRUE ELSE FALSE END AS is_available,

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
          p.selling_price ASC
      `,
      [slug]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch brand products",
    });
  }
});

module.exports = router;
