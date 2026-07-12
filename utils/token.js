const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
    },
    requireEnv("JWT_ACCESS_SECRET"),
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
    }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      tokenVersion: crypto.randomUUID(),
    },
    requireEnv("JWT_REFRESH_SECRET"),
    {
      expiresIn: `${Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 7)}d`,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, requireEnv("JWT_ACCESS_SECRET"));
}

function verifyRefreshToken(token) {
  return jwt.verify(token, requireEnv("JWT_REFRESH_SECRET"));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getRefreshTokenExpiryDate() {
  const days = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

module.exports = {
  getRefreshTokenExpiryDate,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
