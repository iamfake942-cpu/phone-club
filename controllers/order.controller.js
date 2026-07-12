const { validationResult } = require("express-validator");
const orderService = require("../services/order.service");

function handleValidation(req, res) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return false;
  }

  res.status(400).json({
    message: "Validation failed",
    errors: errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  });

  return true;
}

async function createOrder(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const order = await orderService.createOrder(req.user.id, req.body);

    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
}

async function getOrderStatus(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const order = await orderService.getOrderForUser(
      req.user.id,
      req.params.orderId
    );

    res.json(order);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  getOrderStatus,
};
