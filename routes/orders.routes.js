const express = require("express");
const { body, param } = require("express-validator");
const authMiddleware = require("../middleware/auth.middleware");
const orderController = require("../controllers/order.controller");

const router = express.Router();

const createOrderValidation = [
  body("payment_method")
    .isIn(["UPI", "CARD", "COD", "upi", "card", "cod"])
    .withMessage("payment_method must be UPI, CARD, or COD"),
  body("items")
    .isArray({ min: 1 })
    .withMessage("items must contain at least one item"),
  body("items.*.product_id")
    .isLength({ min: 1, max: 36 })
    .withMessage("product_id must be valid"),
  body("items.*.quantity")
    .isInt({ min: 1, max: 10 })
    .withMessage("quantity must be between 1 and 10")
    .toInt(),
  body("shipping_address_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("shipping_address_id must be valid"),
  body("shipping_address")
    .optional()
    .isObject()
    .withMessage("shipping_address must be an object"),
];

router.use(authMiddleware);

router.post("/", createOrderValidation, orderController.createOrder);
router.get(
  "/:orderId/status",
  [param("orderId").isInt({ min: 1 }).withMessage("orderId must be valid")],
  orderController.getOrderStatus
);

module.exports = router;
