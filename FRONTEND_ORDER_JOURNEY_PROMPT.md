# Frontend Order Journey Implementation Prompt

Use this prompt to implement the complete order placement journey on the frontend for Phone Club.

## Goal

Build the frontend checkout/order flow using the backend order APIs.

The backend supports three payment methods:

- `COD`
- `UPI`
- `CARD`

For `COD`, the backend places the order immediately.

For `UPI` and `CARD`, the backend creates a Pine Labs checkout order and returns a `redirect_url`. The frontend must redirect the user to that URL.

Important: the frontend must never mark a payment as successful by itself. After Pine Labs payment/redirect, the frontend must call the backend order status API and show the backend-confirmed status.

## Backend Base URL

Use the configured backend API base URL.

For local development:

```js
const API_BASE_URL = "http://localhost:3000";
```

All order APIs require Bearer token auth:

```js
Authorization: `Bearer ${accessToken}`
```

## Checkout UI Requirements

Create or update the checkout page to show:

- Cart items
- Selected shipping address
- Payment method options:
  - Cash on Delivery
  - UPI
  - Card
- Place Order button
- Loading state while placing order
- Error state if backend returns an error

Payment method values sent to backend must be:

```js
"COD"
"UPI"
"CARD"
```

## API 1: Place Order

Endpoint:

```http
POST /api/orders
```

Headers:

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### COD Request

```json
{
  "payment_method": "COD",
  "shipping_address_id": 1,
  "items": [
    {
      "product_id": "012b1b03-9b05-4449-abc8-ad4e317816f9",
      "quantity": 1
    }
  ]
}
```

### UPI Request

```json
{
  "payment_method": "UPI",
  "shipping_address_id": 1,
  "items": [
    {
      "product_id": "012b1b03-9b05-4449-abc8-ad4e317816f9",
      "quantity": 1
    }
  ]
}
```

### Card Request

```json
{
  "payment_method": "CARD",
  "shipping_address_id": 1,
  "items": [
    {
      "product_id": "012b1b03-9b05-4449-abc8-ad4e317816f9",
      "quantity": 1
    }
  ]
}
```

### COD Success Response

```json
{
  "order_id": 12,
  "order_status": "PLACED",
  "payment_status": "PENDING",
  "payment_method": "COD",
  "amount": 20499,
  "currency": "INR"
}
```

### UPI/Card Success Response

```json
{
  "order_id": 13,
  "order_status": "PENDING_PAYMENT",
  "payment_status": "PENDING",
  "payment_method": "CARD",
  "amount": 20499,
  "currency": "INR",
  "pinelabs_order_id": "v1-123456",
  "merchant_payment_reference": "PAY_123456789",
  "redirect_url": "https://pluraluat.v2.pinepg.in/..."
}
```

### Place Order Behavior

If response `payment_method` is `COD`:

- Navigate user to order success page.
- Use `order_id` from response.
- Do not redirect to Pine Labs.

If response `payment_method` is `UPI` or `CARD`:

- Save `order_id` in `sessionStorage`.
- Redirect browser to `redirect_url`.

Example:

```js
sessionStorage.setItem("pending_order_id", String(order.order_id));
window.location.href = order.redirect_url;
```

## API 2: Get Order Status

Endpoint:

```http
GET /api/orders/:orderId/status
```

Headers:

```http
Authorization: Bearer <accessToken>
```

Example:

```http
GET /api/orders/13/status
```

### Status Response

```json
{
  "id": 13,
  "merchant_order_reference": "ORDER_123456789",
  "payment_method": "CARD",
  "order_status": "PLACED",
  "payment_status": "PAID",
  "final_amount": "20499.00",
  "currency": "INR",
  "pinelabs_order_id": "v1-123456",
  "pinelabs_redirect_url": "https://pluraluat.v2.pinepg.in/...",
  "created_at": "2026-07-04T10:00:00.000Z",
  "updated_at": "2026-07-04T10:05:00.000Z",
  "provider": "PINELABS",
  "payment_id": "v1-123456",
  "merchant_payment_reference": "PAY_123456789",
  "provider_payment_status": "PAID"
}
```

## Possible Status Values

Order status:

```js
"PENDING_PAYMENT"
"PLACED"
"PAYMENT_FAILED"
"CANCELLED"
```

Payment status:

```js
"PENDING"
"PAID"
"FAILED"
```

## Payment Return / Status Page Behavior

Create a payment status page that runs after the user returns from Pine Labs.

On page load:

1. Read order id:

```js
const orderId = sessionStorage.getItem("pending_order_id");
```

2. Call:

```http
GET /api/orders/:orderId/status
```

3. Render based on backend-confirmed status.

If:

```js
order.payment_status === "PAID" && order.order_status === "PLACED"
```

Show payment/order success.

If:

```js
order.payment_status === "FAILED" || order.order_status === "PAYMENT_FAILED"
```

Show payment failed and allow retry or go back to checkout.

If:

```js
order.payment_status === "PENDING"
```

Show “Confirming payment…” and poll the status API every 3-5 seconds for a limited time.

Do not mark payment success only because Pine Labs redirected the user.

## Error Response Shape

Validation error:

```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "payment_method",
      "message": "payment_method must be UPI, CARD, or COD"
    }
  ]
}
```

Generic error:

```json
{
  "message": "Something went wrong"
}
```

Business errors:

```json
{
  "message": "Shipping address not found"
}
```

```json
{
  "message": "Product name is out of stock"
}
```

Frontend should show `message` if available. For validation errors, show the first error message or list all validation errors.

## Suggested Frontend Functions

```js
async function placeOrder({
  accessToken,
  paymentMethod,
  shippingAddressId,
  items,
}) {
  const res = await fetch(`${API_BASE_URL}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      payment_method: paymentMethod,
      shipping_address_id: shippingAddressId,
      items,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to place order");
  }

  return data;
}
```

```js
async function getOrderStatus({ accessToken, orderId }) {
  const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to fetch order status");
  }

  return data;
}
```

```js
async function handlePlaceOrder() {
  const order = await placeOrder({
    accessToken,
    paymentMethod: selectedPaymentMethod,
    shippingAddressId: selectedAddressId,
    items: cartItems.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
  });

  if (order.payment_method === "COD") {
    navigate(`/order-success/${order.order_id}`);
    return;
  }

  sessionStorage.setItem("pending_order_id", String(order.order_id));
  window.location.href = order.redirect_url;
}
```

## Important Security Rules

- Do not send amount from frontend.
- Do not calculate final order amount on frontend for backend submission.
- Do not mark payment as successful from frontend redirect.
- Always call backend status API after payment.
- Use only backend-confirmed `payment_status` and `order_status`.

## Deliverables

Implement:

- Checkout page payment method selection for `COD`, `UPI`, `CARD`
- `POST /api/orders` integration
- Pine Labs redirect handling for `UPI` and `CARD`
- Order success page for `COD`
- Payment status page for `UPI` and `CARD`
- Polling/status confirmation using `GET /api/orders/:orderId/status`
- User-friendly loading, pending, success, failed, and error states
