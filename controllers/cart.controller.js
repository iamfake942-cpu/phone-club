const { validationResult } = require("express-validator");
const cartService = require("../services/cart.service");

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

async function getCart(req, res, next) {
  try {
    const cart = await cartService.getCart(req.user.id);

    res.json(cart);
  } catch (error) {
    next(error);
  }
}

async function addItem(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const item = await cartService.addItem(
      req.user.id,
      req.body.product_id,
      req.body.quantity || 1
    );

    res.status(201).json({
      item,
    });
  } catch (error) {
    next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const item = await cartService.updateItem(
      req.user.id,
      req.params.productId,
      req.body.quantity
    );

    res.json({
      item,
    });
  } catch (error) {
    next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    await cartService.removeItem(req.user.id, req.params.productId);

    res.json({
      message: "Cart item removed",
    });
  } catch (error) {
    next(error);
  }
}

async function clearCart(req, res, next) {
  try {
    await cartService.clearCart(req.user.id);

    res.json({
      message: "Cart cleared",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  addItem,
  clearCart,
  getCart,
  removeItem,
  updateItem,
};
