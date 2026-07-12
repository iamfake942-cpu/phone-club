const { validationResult } = require("express-validator");
const authService = require("../services/auth.service");

const REFRESH_COOKIE_NAME = "refreshToken";

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const days = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 7);

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: days * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  };
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...getRefreshCookieOptions(),
    maxAge: undefined,
  });
}

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

async function register(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const result = await authService.register(req.body);
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
}

async function confirmOtp(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const result = await authService.confirmRegistrationOtp(req.body);
    setRefreshCookie(res, result.refreshToken);

    res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const result = await authService.login(req.body);
    setRefreshCookie(res, result.refreshToken);

    res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const result = await authService.requestPasswordReset(req.body);
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
}

async function verifyForgotPasswordOtp(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const result = await authService.verifyPasswordResetOtp(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    await authService.resetPassword(req.body);
    res.json({
      message: "Password reset successfully. Please log in again.",
    });
  } catch (error) {
    next(error);
  }
}

async function googleLogin(req, res, next) {
  try {
    if (handleValidation(req, res)) {
      return;
    }

    const result = await authService.loginWithGoogle(req.body);
    setRefreshCookie(res, result.refreshToken);

    res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refresh(req.cookies[REFRESH_COOKIE_NAME]);
    setRefreshCookie(res, result.refreshToken);

    res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.cookies[REFRESH_COOKIE_NAME]);
    clearRefreshCookie(res);

    res.json({
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res) {
  res.json({
    user: req.user,
  });
}

module.exports = {
  confirmOtp,
  forgotPassword,
  googleLogin,
  login,
  logout,
  me,
  refresh,
  register,
  resetPassword,
  verifyForgotPasswordOtp,
};
