const express = require("express");
const { body } = require("express-validator");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { isStrongPassword } = require("../utils/password");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again later.",
  },
});

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many registration requests. Please try again later.",
  },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many password-reset requests. Please try again later.",
  },
});

const registerValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Email must be valid")
    .normalizeEmail(),
  body("password")
    .custom(isStrongPassword)
    .withMessage(
      "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol"
    ),
];

const loginValidation = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Email must be valid")
    .normalizeEmail(),
  body("password").isString().notEmpty().withMessage("Password is required"),
];

const confirmOtpValidation = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Email must be valid")
    .normalizeEmail(),
  body("otp")
    .isString()
    .matches(/^\d{6}$/)
    .withMessage("Verification code must be a 6-digit number"),
];

const forgotPasswordValidation = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Email must be valid")
    .normalizeEmail(),
];

const resetPasswordOtpValidation = [
  ...forgotPasswordValidation,
  body("otp")
    .isString()
    .matches(/^\d{6}$/)
    .withMessage("Verification code must be a 6-digit number"),
];

const resetPasswordValidation = [
  body("resetToken")
    .isString()
    .isLength({ min: 40, max: 100 })
    .withMessage("A valid password-reset token is required"),
  body("password")
    .custom(isStrongPassword)
    .withMessage(
      "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol"
    ),
];

const googleLoginValidation = [
  body("credential")
    .optional()
    .isString()
    .notEmpty()
    .withMessage("Google credential token is required"),
  body("idToken")
    .optional()
    .isString()
    .notEmpty()
    .withMessage("Google ID token is required"),
  body().custom((value) => {
    if (!value.credential && !value.idToken) {
      throw new Error("Google credential token is required");
    }

    return true;
  }),
];

router.post("/register", registrationLimiter, registerValidation, authController.register);
router.post(
  "/confirm-otp",
  registrationLimiter,
  confirmOtpValidation,
  authController.confirmOtp
);
router.post("/login", loginLimiter, loginValidation, authController.login);
router.post(
  "/forgot-password",
  passwordResetLimiter,
  forgotPasswordValidation,
  authController.forgotPassword
);
router.post(
  "/verify-forgot-password-otp",
  passwordResetLimiter,
  resetPasswordOtpValidation,
  authController.verifyForgotPasswordOtp
);
router.post(
  "/reset-password",
  passwordResetLimiter,
  resetPasswordValidation,
  authController.resetPassword
);
router.post(
  "/google",
  loginLimiter,
  googleLoginValidation,
  authController.googleLogin
);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authMiddleware, authController.me);

module.exports = router;
