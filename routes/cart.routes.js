const express = require("express");
const { body, param } = require("express-validator");
const cartController = require("../controllers/cart.controller");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

const productIdParamValidation = [
  param("productId")
    .isLength({ min: 1, max: 36 })
    .withMessage("Product id must be a valid product id"),
];

const addItemValidation = [
  body("product_id")
    .isLength({ min: 1, max: 36 })
    .withMessage("Product id must be a valid product id"),
  body("quantity")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("Quantity must be between 1 and 10"),
];

const updateItemValidation = [
  ...productIdParamValidation,
  body("quantity")
    .isInt({ min: 1, max: 10 })
    .withMessage("Quantity must be between 1 and 10"),
];

router.get("/", cartController.getCart);
router.post("/items", addItemValidation, cartController.addItem);
router.patch("/items/:productId", updateItemValidation, cartController.updateItem);
router.delete(
  "/items/:productId",
  productIdParamValidation,
  cartController.removeItem
);
router.delete("/", cartController.clearCart);

module.exports = router;
