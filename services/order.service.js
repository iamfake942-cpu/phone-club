const crypto = require("crypto");
const db = require("../db");
const httpError = require("../utils/httpError");
const pinelabsService = require("./pinelabs.service");

const ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PLACED: "PLACED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
};

const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
};

const SUPPORTED_PAYMENT_METHODS = new Set(["UPI", "CARD", "COD"]);
const ONLINE_PAYMENT_METHODS = new Set(["UPI", "CARD"]);
const SUCCESS_STATUSES = new Set(["PAID", "SUCCESS", "SUCCEEDED", "CAPTURED"]);
const FAILURE_STATUSES = new Set([
  "FAILED",
  "FAILURE",
  "DECLINED",
  "CANCELLED",
  "CANCELED",
  "EXPIRED",
]);

function normalizeProviderPaymentStatus(status) {
  const normalized = String(status || "").toUpperCase();

  if (SUCCESS_STATUSES.has(normalized)) {
    return PAYMENT_STATUS.PAID;
  }

  if (FAILURE_STATUSES.has(normalized)) {
    return PAYMENT_STATUS.FAILED;
  }

  return PAYMENT_STATUS.PENDING;
}

function normalizePaymentMethod(paymentMethod) {
  return String(paymentMethod || "").trim().toUpperCase();
}

function isOnlinePaymentMethod(paymentMethod) {
  return ONLINE_PAYMENT_METHODS.has(paymentMethod);
}

function uniqueReference(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function providerAmountMatches(providerAmount, localAmount) {
  const providerValue = Number(providerAmount || 0);
  const localValue = toMoney(localAmount);

  return (
    toMoney(providerValue) === localValue ||
    toMoney(providerValue / 100) === localValue
  );
}

async function getAddressForOrder(connection, userId, body) {
  const addressId =
    body.shipping_address_id ||
    (body.shipping_address && body.shipping_address.id);

  if (addressId) {
    const [[address]] = await connection.query(
      `SELECT id, label, address_line1, address_line2, city, state,
              postal_code, country, latitude, longitude
       FROM user_addresses
       WHERE user_id = ? AND id = ?
       LIMIT 1`,
      [userId, addressId]
    );

    if (!address) {
      throw httpError("Shipping address not found", 404);
    }

    return address;
  }

  const address = body.shipping_address || {};
  const requiredFields = [
    "address_line1",
    "city",
    "state",
    "postal_code",
    "country",
  ];
  const missing = requiredFields.filter((field) => !address[field]);

  if (missing.length > 0) {
    throw httpError(`Shipping address missing: ${missing.join(", ")}`, 400);
  }

  return {
    id: null,
    label: address.label || "shipping",
    address_line1: address.address_line1,
    address_line2: address.address_line2 || null,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country,
    latitude: address.latitude == null ? null : address.latitude,
    longitude: address.longitude == null ? null : address.longitude,
  };
}

async function validateCartItems(connection, cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw httpError("Cart items are required", 400);
  }

  const productIds = new Set();
  const normalizedItems = cartItems.map((item) => {
    const productId = item.product_id || item.productId;
    const quantity = Number(item.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw httpError("Each cart item needs product_id and quantity between 1 and 10", 400);
    }

    if (productIds.has(productId)) {
      throw httpError("Duplicate products are not allowed in one order", 400);
    }

    productIds.add(productId);

    return {
      product_id: productId,
      quantity,
    };
  });

  const placeholders = normalizedItems.map(() => "?").join(", ");
  const [products] = await connection.query(
    `SELECT id, name, selling_price, mrp, quantity
     FROM products
     WHERE id IN (${placeholders})
     FOR UPDATE`,
    normalizedItems.map((item) => item.product_id)
  );

  if (products.length !== normalizedItems.length) {
    throw httpError("One or more products were not found", 404);
  }

  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const orderItems = normalizedItems.map((item) => {
    const product = productsById.get(String(item.product_id));
    const stockQuantity = Number(product.quantity || 0);

    if (stockQuantity < item.quantity) {
      throw httpError(`${product.name} is out of stock`, 409);
    }

    const unitPrice = toMoney(product.selling_price);
    const mrp = toMoney(product.mrp);
    const lineTotal = toMoney(unitPrice * item.quantity);

    return {
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      mrp,
      line_total: lineTotal,
    };
  });

  const subtotal = toMoney(
    orderItems.reduce((total, item) => total + item.line_total, 0)
  );
  const mrpTotal = toMoney(
    orderItems.reduce((total, item) => total + item.mrp * item.quantity, 0)
  );

  return {
    items: orderItems,
    summary: {
      subtotal,
      mrp_total: mrpTotal,
      discount: toMoney(Math.max(mrpTotal - subtotal, 0)),
      delivery_charge: 0,
      final_amount: subtotal,
      currency: process.env.ORDER_CURRENCY || "INR",
    },
  };
}

async function insertOrder(connection, userId, address, paymentMethod, cart) {
  const orderStatus =
    isOnlinePaymentMethod(paymentMethod)
      ? ORDER_STATUS.PENDING_PAYMENT
      : ORDER_STATUS.PLACED;
  const paymentStatus = PAYMENT_STATUS.PENDING;
  const merchantOrderReference = uniqueReference("ORDER");
  const merchantPaymentReference =
    isOnlinePaymentMethod(paymentMethod) ? uniqueReference("PAY") : null;

  const [orderResult] = await connection.query(
    `INSERT INTO orders
       (user_id, merchant_order_reference, payment_method, order_status,
        payment_status, subtotal_amount, discount_amount, delivery_charge,
        final_amount, currency, shipping_address_id, shipping_address_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      merchantOrderReference,
      paymentMethod,
      orderStatus,
      paymentStatus,
      cart.summary.subtotal,
      cart.summary.discount,
      cart.summary.delivery_charge,
      cart.summary.final_amount,
      cart.summary.currency,
      address.id,
      JSON.stringify(address),
    ]
  );

  const orderId = orderResult.insertId;

  for (const item of cart.items) {
    await connection.query(
      `INSERT INTO order_items
         (order_id, product_id, product_name, quantity, unit_price, mrp, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        item.product_id,
        item.product_name,
        item.quantity,
        item.unit_price,
        item.mrp,
        item.line_total,
      ]
    );

    const [stockUpdate] = await connection.query(
      `UPDATE products
       SET quantity = quantity - ?
       WHERE id = ? AND quantity >= ?`,
      [item.quantity, item.product_id, item.quantity]
    );

    if (stockUpdate.affectedRows !== 1) {
      throw httpError(`${item.product_name} is out of stock`, 409);
    }
  }

  const [paymentResult] = await connection.query(
    `INSERT INTO payments
       (order_id, provider, payment_method, merchant_payment_reference,
        amount, currency, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      isOnlinePaymentMethod(paymentMethod) ? "PINELABS" : "COD",
      paymentMethod,
      merchantPaymentReference,
      cart.summary.final_amount,
      cart.summary.currency,
      paymentStatus,
    ]
  );

  return {
    id: orderId,
    merchant_order_reference: merchantOrderReference,
    payment_id: paymentResult.insertId,
    merchant_payment_reference: merchantPaymentReference,
    order_status: orderStatus,
    payment_status: paymentStatus,
    final_amount: cart.summary.final_amount,
    currency: cart.summary.currency,
  };
}

async function getOrderForUser(userId, orderId) {
  const [[order]] = await db.query(
    `SELECT
       o.id,
       o.merchant_order_reference,
       o.payment_method,
       o.order_status,
       o.payment_status,
       o.final_amount,
       o.currency,
       o.pinelabs_order_id,
       o.pinelabs_redirect_url,
       o.created_at,
       o.updated_at,
       p.provider,
       p.provider_payment_id AS payment_id,
       p.merchant_payment_reference,
       p.status AS provider_payment_status
     FROM orders o
     LEFT JOIN payments p
       ON p.order_id = o.id
     WHERE o.user_id = ? AND o.id = ?
     LIMIT 1`,
    [userId, orderId]
  );

  if (!order) {
    throw httpError("Order not found", 404);
  }

  return order;
}

async function createOrder(userId, body) {
  const paymentMethod = normalizePaymentMethod(body.payment_method);

  if (!SUPPORTED_PAYMENT_METHODS.has(paymentMethod)) {
    throw httpError("Unsupported payment_method", 400);
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[user]] = await connection.query(
      "SELECT id, name, email FROM users WHERE id = ? AND is_active = TRUE LIMIT 1",
      [userId]
    );

    if (!user) {
      throw httpError("User not found", 404);
    }

    const address = await getAddressForOrder(connection, userId, body);
    const cart = await validateCartItems(connection, body.items);
    const order = await insertOrder(connection, userId, address, paymentMethod, cart);

    if (paymentMethod === "COD") {
      await connection.commit();

      return {
        order_id: order.id,
        order_status: order.order_status,
        payment_status: order.payment_status,
        payment_method: paymentMethod,
        amount: order.final_amount,
        currency: order.currency,
      };
    }

    const pineOrder = await pinelabsService.createCheckoutOrder({
      merchantOrderReference: order.merchant_order_reference,
      amount: order.final_amount,
      currency: order.currency,
      orderId: order.id,
      paymentMethod,
      user,
      address,
      items: cart.items,
    });

    await connection.query(
      `UPDATE orders
       SET pinelabs_order_id = ?,
           pinelabs_redirect_token = ?,
           pinelabs_redirect_url = ?,
           provider_order_response = ?
       WHERE id = ?`,
      [
        pineOrder.pinelabs_order_id,
        pineOrder.token,
        pineOrder.redirect_url,
        JSON.stringify(pineOrder.raw),
        order.id,
      ]
    );

    await connection.query(
      `UPDATE payments
       SET provider_payment_id = ?, provider_payment_response = ?, status = ?
       WHERE order_id = ?`,
      [
        pineOrder.pinelabs_order_id,
        JSON.stringify(pineOrder.raw),
        PAYMENT_STATUS.PENDING,
        order.id,
      ]
    );

    await connection.commit();

    return {
      order_id: order.id,
      order_status: order.order_status,
      payment_status: PAYMENT_STATUS.PENDING,
      payment_method: paymentMethod,
      amount: order.final_amount,
      currency: order.currency,
      pinelabs_order_id: pineOrder.pinelabs_order_id,
      merchant_payment_reference: order.merchant_payment_reference,
      redirect_url: pineOrder.redirect_url,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Order transaction rollback failed", rollbackError);
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function findOrderByPinelabsOrderId(connection, pinelabsOrderId) {
  const [[order]] = await connection.query(
    `SELECT *
     FROM orders
     WHERE pinelabs_order_id = ?
     LIMIT 1
     FOR UPDATE`,
    [pinelabsOrderId]
  );

  return order || null;
}

function getPinelabsOrderIdFromCallback(body) {
  return (
    body.pinelabs_order_id ||
    body.order_id ||
    (body.data && (body.data.pinelabs_order_id || body.data.order_id))
  );
}

async function handlePinelabsCallback(body, rawBody, signatureHeader) {
  if (!pinelabsService.verifyCallbackSignature(rawBody, signatureHeader)) {
    throw httpError("Invalid Pine Labs callback signature", 401);
  }

  const pinelabsOrderId = getPinelabsOrderIdFromCallback(body);

  if (!pinelabsOrderId) {
    throw httpError("Pine Labs order id missing in callback", 400);
  }

  const providerStatus = await pinelabsService.getOrderStatus(pinelabsOrderId);
  const parsedStatus = pinelabsService.parseStatus(providerStatus);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const order = await findOrderByPinelabsOrderId(connection, pinelabsOrderId);

    if (!order) {
      throw httpError("Order not found for Pine Labs callback", 404);
    }

    if (order.payment_status === PAYMENT_STATUS.PAID) {
      await connection.commit();
      return {
        order_id: order.id,
        order_status: order.order_status,
        payment_status: order.payment_status,
        idempotent: true,
      };
    }

    if (
      parsedStatus.pinelabs_order_id &&
      String(parsedStatus.pinelabs_order_id) !== String(order.pinelabs_order_id)
    ) {
      throw httpError("Pine Labs order id mismatch", 400);
    }

    if (!providerAmountMatches(parsedStatus.amount, order.final_amount)) {
      throw httpError("Pine Labs amount mismatch", 400);
    }

    let orderStatus = order.order_status;
    let paymentStatus = PAYMENT_STATUS.PENDING;

    if (SUCCESS_STATUSES.has(parsedStatus.status)) {
      orderStatus = ORDER_STATUS.PLACED;
      paymentStatus = PAYMENT_STATUS.PAID;
    } else if (FAILURE_STATUSES.has(parsedStatus.status)) {
      orderStatus = ORDER_STATUS.PAYMENT_FAILED;
      paymentStatus = PAYMENT_STATUS.FAILED;
    }

    if (
      paymentStatus !== PAYMENT_STATUS.PENDING &&
      order.payment_status === paymentStatus
    ) {
      await connection.commit();
      return {
        order_id: order.id,
        order_status: order.order_status,
        payment_status: order.payment_status,
        idempotent: true,
      };
    }

    if (
      paymentStatus === PAYMENT_STATUS.FAILED &&
      order.payment_status !== PAYMENT_STATUS.FAILED
    ) {
      await connection.query(
        `UPDATE products p
         INNER JOIN order_items oi
           ON oi.product_id = p.id
         SET p.quantity = p.quantity + oi.quantity
         WHERE oi.order_id = ?`,
        [order.id]
      );
    }

    await connection.query(
      `UPDATE orders
       SET order_status = ?, payment_status = ?, provider_status_response = ?,
           paid_at = CASE WHEN ? = ? THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
       WHERE id = ?`,
      [
        orderStatus,
        paymentStatus,
        JSON.stringify(providerStatus),
        paymentStatus,
        PAYMENT_STATUS.PAID,
        order.id,
      ]
    );

    await connection.query(
      `UPDATE payments
       SET status = ?, provider_status_response = ?,
           paid_at = CASE WHEN ? = ? THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
       WHERE order_id = ?`,
      [
        paymentStatus,
        JSON.stringify(providerStatus),
        paymentStatus,
        PAYMENT_STATUS.PAID,
        order.id,
      ]
    );

    await connection.commit();

    return {
      order_id: order.id,
      order_status: orderStatus,
      payment_status: paymentStatus,
      idempotent: false,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Pine Labs callback rollback failed", rollbackError);
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createOrder,
  getOrderForUser,
  handlePinelabsCallback,
};
