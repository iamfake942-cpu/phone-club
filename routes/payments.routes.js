const express = require("express");
const paymentController = require("../controllers/payment.controller");

const router = express.Router();

router.post("/pinelabs/callback", paymentController.pinelabsCallback);
router.post(
  "/pinelabs/failure-callback",
  paymentController.pinelabsCallback
);

module.exports = router;
