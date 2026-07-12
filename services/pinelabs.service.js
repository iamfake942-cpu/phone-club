const crypto = require("crypto");
const httpError = require("../utils/httpError");

function envValue(key) {
  const value = process.env[key];

  if (!value) {
    return value;
  }

  return value.trim().replace(/^["']|["']$/g, "");
}

function getConfig() {
  return {
    baseUrl: envValue("PINELABS_BASE_URL"),
    clientId: envValue("PINELABS_CLIENT_ID"),
    clientSecret: envValue("PINELABS_CLIENT_SECRET"),
    secretKey: envValue("PINELABS_SECRET_KEY"),
    tokenPath: envValue("PINELABS_TOKEN_PATH") || "/api/auth/v1/token",
    checkoutOrderPath:
      envValue("PINELABS_CHECKOUT_ORDER_PATH") ||
      "/api/checkout/v1/orders",
    statusPathTemplate:
      envValue("PINELABS_STATUS_PATH_TEMPLATE") ||
      "/api/checkout/v1/orders/:pinelabs_order_id",
    callbackUrl: envValue("PINELABS_CALLBACK_URL"),
    failureCallbackUrl: envValue("PINELABS_FAILURE_CALLBACK_URL"),
    allowedPaymentMethods:
      envValue("PINELABS_ALLOWED_PAYMENT_METHODS") || "UPI,CARD",
  };
}

function assertConfigured(config) {
  const missing = [
    "baseUrl",
    "clientId",
    "clientSecret",
    "secretKey",
  ].filter((key) => !config[key]);

  if (missing.length > 0) {
    throw httpError(
      `Pine Labs configuration missing: ${missing.join(", ")}`,
      500
    );
  }
}

let cachedToken = null;

function buildUrl(path) {
  const config = getConfig();
  assertConfigured(config);

  return new URL(path, config.baseUrl).toString();
}

function requestHeaders(headers = {}) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Request-ID": crypto.randomUUID(),
    "Request-Timestamp": new Date().toISOString(),
    ...headers,
  };
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    method: options.method || "POST",
    headers: requestHeaders(options.headers),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    console.error("Pine Labs API error", {
      status: response.status,
      path,
      data,
    });
    throw httpError("Pine Labs payment request failed", 502);
  }

  return data || {};
}

async function generateAccessToken() {
  const config = getConfig();
  assertConfigured(config);

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken;
  }

  const response = await request(config.tokenPath, {
    body: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
    },
  });

  if (!response.access_token) {
    console.error("Pine Labs token response missing access_token", response);
    throw httpError("Invalid Pine Labs auth response", 502);
  }

  const expiresIn = Number(response.expires_in || 3600);
  cachedToken = {
    accessToken: response.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return cachedToken.accessToken;
}

async function authorizedRequest(path, options = {}) {
  const accessToken = await generateAccessToken();

  return request(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
}

function firstValue(source, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      return current[part];
    }, source);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function splitName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: "Customer",
      lastName: "",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildPineAddress(address, fullName) {
  return {
    address1: address.address_line1,
    address2: address.address_line2 || "",
    pincode: address.postal_code,
    city: address.city,
    state: address.state,
    country: address.country,
    full_name: fullName,
    adddress_type: address.label || "Home",
    address_category: "shipping",
  };
}

function toMinorUnit(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function getAllowedPaymentMethods(config, paymentMethod) {
  if (paymentMethod === "UPI" || paymentMethod === "CARD") {
    return [paymentMethod];
  }

  return config.allowedPaymentMethods
    .split(",")
    .map((method) => method.trim().toUpperCase())
    .filter(Boolean);
}

async function createCheckoutOrder({
  merchantOrderReference,
  amount,
  currency,
  orderId,
  paymentMethod,
  user,
  address,
  items,
}) {
  const config = getConfig();
  const customerName = user.name || "Customer";
  const { firstName, lastName } = splitName(customerName);
  const pineAddress = buildPineAddress(address, customerName);
  const payload = {
    merchant_order_reference: merchantOrderReference,
    order_amount: {
      value: toMinorUnit(amount),
      currency,
    },
    integration_mode: "REDIRECT",
    pre_auth: false,
    allowed_payment_methods: getAllowedPaymentMethods(config, paymentMethod),
    notes: `Phone Club order ${orderId}`,
    callback_url: config.callbackUrl,
    failure_callback_url: config.failureCallbackUrl || config.callbackUrl,
    purchase_details: {
      customer: {
        email_id: user.email,
        first_name: firstName,
        last_name: lastName,
        customer_id: String(user.id),
        shipping_address: pineAddress,
        billing_address: {
          ...pineAddress,
          address_category: "billing",
        },
      },
      merchant_metadata: {
        local_order_id: String(orderId),
      },
      cart_details: {
        cart_items: items.map((item) => ({
          item_id: String(item.product_id),
          item_name: item.product_name,
          item_original_unit_price: toMinorUnit(item.mrp),
          item_discounted_unit_price: toMinorUnit(item.unit_price),
          item_quantity: item.quantity,
          item_currency: currency,
        })),
      },
    },
  };

  const response = await authorizedRequest(config.checkoutOrderPath, {
    body: payload,
  });

  const pinelabsOrderId = firstValue(response, [
    "pinelabs_order_id",
    "order_id",
    "id",
    "data.pinelabs_order_id",
    "data.order_id",
    "data.id",
  ]);
  const redirectUrl = firstValue(response, [
    "redirect_url",
    "data.redirect_url",
  ]);
  const checkoutToken = firstValue(response, [
    "token",
    "data.token",
  ]);

  if (!pinelabsOrderId || !redirectUrl) {
    console.error("Pine Labs checkout order missing required data", response);
    throw httpError("Invalid Pine Labs checkout order response", 502);
  }

  return {
    raw: response,
    pinelabs_order_id: pinelabsOrderId,
    redirect_url: redirectUrl,
    token: checkoutToken,
  };
}

async function getOrderStatus(pinelabsOrderId) {
  const config = getConfig();
  const path = config.statusPathTemplate.replace(
    ":pinelabs_order_id",
    encodeURIComponent(pinelabsOrderId)
  );

  return authorizedRequest(path, {
    method: "GET",
    body: null,
  });
}

function verifyCallbackSignature(rawBody, signatureHeader) {
  const config = getConfig();
  assertConfigured(config);

  if (!rawBody || !signatureHeader) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", config.secretKey)
    .update(rawBody)
    .digest("hex");
  const expectedBase64 = crypto
    .createHmac("sha256", config.secretKey)
    .update(rawBody)
    .digest("base64");

  const received = String(signatureHeader)
    .trim()
    .replace(/^sha256=/i, "");

  return [expectedHex, expectedBase64].some((expected) => {
    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(received, "utf8");

    return (
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  });
}

function parseStatus(response) {
  const status = firstValue(response, [
    "status",
    "order_status",
    "payment_status",
    "data.status",
    "data.order_status",
    "data.payment_status",
    "payment.status",
    "data.payment.status",
  ]);
  const amount = firstValue(response, [
    "order_amount.value",
    "amount.value",
    "amount",
    "data.order_amount.value",
    "data.amount.value",
    "data.amount",
    "payment.amount.value",
    "data.payment.amount.value",
  ]);
  const pinelabsOrderId = firstValue(response, [
    "pinelabs_order_id",
    "order_id",
    "data.pinelabs_order_id",
    "data.order_id",
  ]);

  return {
    status: String(status || "").toUpperCase(),
    amount: Number(amount || 0),
    pinelabs_order_id: pinelabsOrderId,
    raw: response,
  };
}

module.exports = {
  createCheckoutOrder,
  generateAccessToken,
  getOrderStatus,
  parseStatus,
  verifyCallbackSignature,
};
