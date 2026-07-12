const orderService = require("../services/order.service");

async function pinelabsCallback(req, res, next) {
  try {
    const signature =
      req.get("x-pinelabs-signature") ||
      req.get("x-plural-signature") ||
      req.get("x-webhook-signature");

    const result = await orderService.handlePinelabsCallback(
      req.body,
      req.rawBody,
      signature
    );

    res.json({
      message: "Callback processed",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  pinelabsCallback,
};
