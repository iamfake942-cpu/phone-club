const db = require("../db");

const CART_PRODUCT_SELECT = `
  SELECT
    ci.id AS cart_item_id,
    ci.quantity,
    ci.created_at,
    ci.updated_at,

    p.id AS product_id,
    p.name,
    p.slug,
    p.color,
    p.ram,
    p.storage,
    p.selling_price,
    p.mrp,

    b.name AS brand_name,
    b.slug AS brand_slug,

    (
      SELECT image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order
      LIMIT 1
    ) AS image_url

  FROM cart_items ci
  INNER JOIN products p
    ON p.id = ci.product_id
  INNER JOIN product_groups pg
    ON pg.id = p.product_group_id
  INNER JOIN brands b
    ON b.id = pg.brand_id
`;

async function findProductById(productId) {
  const [[product]] = await db.query(
    "SELECT id FROM products WHERE id = ? LIMIT 1",
    [productId]
  );

  return product;
}

async function getCart(userId) {
  const [items] = await db.query(
    `${CART_PRODUCT_SELECT}
     WHERE ci.user_id = ?
     ORDER BY ci.updated_at DESC`,
    [userId]
  );

  const summary = items.reduce(
    (totals, item) => {
      const price = Number(item.selling_price || 0);
      const mrp = Number(item.mrp || 0);
      const quantity = Number(item.quantity || 0);

      totals.total_items += quantity;
      totals.subtotal += price * quantity;
      totals.mrp_total += mrp * quantity;

      return totals;
    },
    {
      total_items: 0,
      subtotal: 0,
      mrp_total: 0,
    }
  );

  summary.discount = Math.max(summary.mrp_total - summary.subtotal, 0);

  return {
    items,
    summary,
  };
}

async function getCartItem(userId, productId) {
  const [[item]] = await db.query(
    `${CART_PRODUCT_SELECT}
     WHERE ci.user_id = ? AND ci.product_id = ?
     LIMIT 1`,
    [userId, productId]
  );

  return item;
}

async function addItem(userId, productId, quantity = 1) {
  const product = await findProductById(productId);

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  await db.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       quantity = LEAST(quantity + VALUES(quantity), 10),
       updated_at = CURRENT_TIMESTAMP`,
    [userId, productId, quantity]
  );

  return getCartItem(userId, productId);
}

async function updateItem(userId, productId, quantity) {
  const [result] = await db.query(
    `UPDATE cart_items
     SET quantity = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND product_id = ?`,
    [quantity, userId, productId]
  );

  if (result.affectedRows === 0) {
    const error = new Error("Cart item not found");
    error.statusCode = 404;
    throw error;
  }

  return getCartItem(userId, productId);
}

async function removeItem(userId, productId) {
  const [result] = await db.query(
    "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?",
    [userId, productId]
  );

  if (result.affectedRows === 0) {
    const error = new Error("Cart item not found");
    error.statusCode = 404;
    throw error;
  }
}

async function clearCart(userId) {
  await db.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);
}

module.exports = {
  addItem,
  clearCart,
  getCart,
  removeItem,
  updateItem,
};
