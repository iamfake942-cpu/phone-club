const express = require("express");
const { body, query } = require("express-validator");
const authMiddleware = require("../middleware/auth.middleware");
const profileController = require("../controllers/profile.controller");

const router = express.Router();

const nameValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
];

const createAddressValidation = [
  body("label")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Address label must be between 2 and 50 characters"),
  body("address_line1")
    .trim()
    .isLength({ min: 5, max: 255 })
    .withMessage("Address line 1 must be between 5 and 255 characters"),
  body("address_line2")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Address line 2 must be at most 255 characters"),
  body("city")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("City must be between 2 and 100 characters"),
  body("state")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("State must be between 2 and 100 characters"),
  body("postal_code")
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Postal code must be between 3 and 20 characters"),
  body("country")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Country must be between 2 and 100 characters"),
  body("latitude")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a valid number between -90 and 90"),
  body("longitude")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a valid number between -180 and 180"),
  body("is_default")
    .optional()
    .isBoolean()
    .withMessage("is_default must be a boolean")
    .toBoolean(),
];

const updateAddressValidation = [
  body("label")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Address label must be between 2 and 50 characters"),
  body("address_line1")
    .optional()
    .trim()
    .isLength({ min: 5, max: 255 })
    .withMessage("Address line 1 must be between 5 and 255 characters"),
  body("address_line2")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Address line 2 must be at most 255 characters"),
  body("city")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("City must be between 2 and 100 characters"),
  body("state")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("State must be between 2 and 100 characters"),
  body("postal_code")
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Postal code must be between 3 and 20 characters"),
  body("country")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Country must be between 2 and 100 characters"),
  body("latitude")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a valid number between -90 and 90"),
  body("longitude")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a valid number between -180 and 180"),
  body("is_default")
    .optional()
    .isBoolean()
    .withMessage("is_default must be a boolean")
    .toBoolean(),
];

const reverseAddressValidation = [
  query("lat")
    .exists()
    .withMessage("Latitude is required")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a valid number between -90 and 90")
    .toFloat(),
  query("lng")
    .exists()
    .withMessage("Longitude is required")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a valid number between -180 and 180")
    .toFloat(),
];

router.get("/", authMiddleware, profileController.getProfile);
router.put("/", authMiddleware, nameValidation, profileController.updateProfile);

router.get("/addresses", authMiddleware, profileController.getAddresses);
router.post(
  "/addresses",
  authMiddleware,
  createAddressValidation,
  profileController.createAddress
);
router.put(
  "/addresses/:id",
  authMiddleware,
  updateAddressValidation,
  profileController.updateAddress
);
router.delete("/addresses/:id", authMiddleware, profileController.deleteAddress);
router.patch("/addresses/:id/default", authMiddleware, profileController.setDefaultAddress);
router.get(
  "/address-from-coords",
  authMiddleware,
  reverseAddressValidation,
  profileController.reverseAddressFromCoords
);

module.exports = router;
