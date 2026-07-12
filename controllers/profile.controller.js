const { validationResult } = require("express-validator");
const profileService = require("../services/profile.service");

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

async function getProfile(req, res, next) {
  try {
    const result = await profileService.getProfile(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const result = await profileService.updateProfile(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getAddresses(req, res, next) {
  try {
    const addresses = await profileService.getAddressesByUserId(req.user.id);
    res.json({ addresses });
  } catch (error) {
    next(error);
  }
}

async function createAddress(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const address = await profileService.createAddress(req.user.id, req.body);
    res.status(201).json(address);
  } catch (error) {
    next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const address = await profileService.updateAddressById(
      req.user.id,
      req.params.id,
      req.body
    );
    res.json(address);
  } catch (error) {
    next(error);
  }
}

async function deleteAddress(req, res, next) {
  try {
    await profileService.deleteAddressById(req.user.id, req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

async function setDefaultAddress(req, res, next) {
  try {
    const address = await profileService.setDefaultAddressById(
      req.user.id,
      req.params.id
    );
    res.json(address);
  } catch (error) {
    next(error);
  }
}

async function reverseAddressFromCoords(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const address = await profileService.reverseGeocodeCoordinates(latitude, longitude);
    res.json({ address });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  reverseAddressFromCoords,
};
