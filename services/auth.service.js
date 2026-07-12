const db = require("../db");
const { OAuth2Client } = require("google-auth-library");
const { comparePassword, hashPassword } = require("../utils/password");
const {
  sendPasswordResetOtpEmail,
  sendRegistrationOtpEmail,
} = require("./email.service");
const { client: redisClient } = require("./redis");
const crypto = require("crypto");
const {
  getRefreshTokenExpiryDate,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/token");

const googleClient = new OAuth2Client();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    auth_provider: user.auth_provider,
    is_active: Boolean(user.is_active),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function findUserByEmail(email) {
  const [[user]] = await db.query("SELECT * FROM users WHERE email = ? LIMIT 1", [
    email,
  ]);

  return user;
}

async function findActiveUserById(userId) {
  const [[user]] = await db.query(
    `SELECT id, name, email, role, auth_provider, is_active, created_at, updated_at
     FROM users
     WHERE id = ? AND is_active = TRUE
     LIMIT 1`,
    [userId]
  );

  return user;
}

async function findUserByGoogleId(googleId) {
  const [[user]] = await db.query(
    "SELECT * FROM users WHERE google_id = ? LIMIT 1",
    [googleId]
  );

  return user;
}

async function saveRefreshToken(userId, refreshToken) {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [userId, hashToken(refreshToken), getRefreshTokenExpiryDate()]
  );
}

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await saveRefreshToken(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
  };
}

async function register({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    const error = new Error("Email is already registered");
    error.statusCode = 409;
    throw error;
  }

  const expiresInMinutes = getOtpExpiryMinutes();
  const otp = crypto.randomInt(100000, 1000000).toString();
  const [passwordHash, otpHash] = await Promise.all([
    hashPassword(password),
    hashPassword(otp),
  ]);
  const key = `pending_registration:${normalizedEmail}`;

  await redisClient.hSet(key, {
    name: name.trim(),
    email: normalizedEmail,
    password_hash: passwordHash,
    otp_hash: otpHash,
    attempts: "0",
  });
  await redisClient.expire(key, expiresInMinutes * 60);

  await sendRegistrationOtpEmail(normalizedEmail, otp, expiresInMinutes);

  return {
    message: "Verification code sent to your email",
    expiresInMinutes,
  };
}

function getOtpExpiryMinutes() {
  const configuredMinutes = Number(process.env.REGISTRATION_OTP_EXPIRES_IN_MINUTES || 10);

  return Number.isInteger(configuredMinutes) && configuredMinutes > 0
    ? configuredMinutes
    : 10;
}

function getPasswordResetOtpExpiryMinutes() {
  const configuredMinutes = Number(
    process.env.PASSWORD_RESET_OTP_EXPIRES_IN_MINUTES || 10
  );

  return Number.isInteger(configuredMinutes) && configuredMinutes > 0
    ? configuredMinutes
    : 10;
}

function getPasswordResetTokenExpiryMinutes() {
  const configuredMinutes = Number(
    process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES || 10
  );

  return Number.isInteger(configuredMinutes) && configuredMinutes > 0
    ? configuredMinutes
    : 10;
}

async function confirmRegistrationOtp({ email, otp }) {
  const normalizedEmail = email.trim().toLowerCase();
  const key = `pending_registration:${normalizedEmail}`;
  const pendingRegistration = await redisClient.hGetAll(key);

  if (!pendingRegistration || Object.keys(pendingRegistration).length === 0) {
    throw otpError("No active verification request found", 404);
  }

  const attempts = Number(pendingRegistration.attempts || "0");

  if (attempts >= 3) {
    await redisClient.del(key);
    throw otpError("Verification attempt limit reached. Please register again", 429);
  }

  const otpMatches = await comparePassword(otp, pendingRegistration.otp_hash);

  if (!otpMatches) {
    const updatedAttempts = attempts + 1;
    await redisClient.hSet(key, "attempts", String(updatedAttempts));

    if (updatedAttempts >= 3) {
      await redisClient.del(key);
      throw otpError("Verification attempt limit reached. Please register again", 429);
    }

    throw otpError(
      `Invalid verification code. ${3 - updatedAttempts} attempt(s) remaining`,
      401
    );
  }

  const [[existingUser]] = await db.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [normalizedEmail]
  );

  if (existingUser) {
    await redisClient.del(key);
    throw otpError("Email is already registered", 409);
  }

  const [result] = await db.query(
    `INSERT INTO users (name, email, password_hash, auth_provider)
       VALUES (?, ?, ?, 'local')`,
    [
      pendingRegistration.name,
      pendingRegistration.email,
      pendingRegistration.password_hash,
    ]
  );

  await redisClient.del(key);

  const user = await findActiveUserById(result.insertId);
  const tokens = await issueTokenPair(user);

  return {
    user: publicUser(user),
    ...tokens,
  };
}

async function requestPasswordReset({ email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);
  const expiresInMinutes = getPasswordResetOtpExpiryMinutes();
  const response = {
    message: "If an active account exists for this email, a verification code has been sent",
    expiresInMinutes,
  };

  // Always return the same response so this endpoint cannot reveal whether an
  // email address is registered.
  if (!user || !user.is_active) {
    return response;
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `password_reset_otp:${normalizedEmail}`;

  await redisClient.hSet(key, {
    user_id: String(user.id),
    otp_hash: await hashPassword(otp),
    attempts: "0",
  });
  await redisClient.expire(key, expiresInMinutes * 60);

  await sendPasswordResetOtpEmail(normalizedEmail, otp, expiresInMinutes);

  return response;
}

async function verifyPasswordResetOtp({ email, otp }) {
  const normalizedEmail = email.trim().toLowerCase();
  const otpKey = `password_reset_otp:${normalizedEmail}`;
  const pendingReset = await redisClient.hGetAll(otpKey);

  if (!pendingReset || Object.keys(pendingReset).length === 0) {
    throw otpError("No active password-reset request found", 404);
  }

  const attempts = Number(pendingReset.attempts || "0");

  if (attempts >= 3) {
    await redisClient.del(otpKey);
    throw otpError("Verification attempt limit reached. Please request a new code", 429);
  }

  const otpMatches = await comparePassword(otp, pendingReset.otp_hash);

  if (!otpMatches) {
    const updatedAttempts = attempts + 1;
    await redisClient.hSet(otpKey, "attempts", String(updatedAttempts));

    if (updatedAttempts >= 3) {
      await redisClient.del(otpKey);
      throw otpError("Verification attempt limit reached. Please request a new code", 429);
    }

    throw otpError(
      `Invalid verification code. ${3 - updatedAttempts} attempt(s) remaining`,
      401
    );
  }

  const user = await findActiveUserById(pendingReset.user_id);

  if (!user || user.email.toLowerCase() !== normalizedEmail) {
    await redisClient.del(otpKey);
    throw otpError("No active password-reset request found", 404);
  }

  const resetToken = crypto.randomBytes(32).toString("base64url");
  const resetTokenKey = `password_reset_token:${hashToken(resetToken)}`;
  const tokenExpiresInMinutes = getPasswordResetTokenExpiryMinutes();

  await redisClient.set(resetTokenKey, String(user.id), {
    EX: tokenExpiresInMinutes * 60,
  });
  await redisClient.del(otpKey);

  return {
    resetToken,
    expiresInMinutes: tokenExpiresInMinutes,
  };
}

async function resetPassword({ resetToken, password }) {
  const resetTokenKey = `password_reset_token:${hashToken(resetToken)}`;
  // GETDEL makes the reset credential single-use even when requests arrive at
  // the same time. The client never supplies the user ID or email here.
  const userId = await redisClient.getDel(resetTokenKey);

  if (!userId) {
    const error = new Error("Invalid or expired password-reset token");
    error.statusCode = 401;
    throw error;
  }

  const user = await findActiveUserById(userId);

  if (!user) {
    const error = new Error("Invalid or expired password-reset token");
    error.statusCode = 401;
    throw error;
  }

  await db.query(
    `UPDATE users
     SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND is_active = TRUE`,
    [await hashPassword(password), user.id]
  );

  // A password reset invalidates every existing login session.
  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND revoked_at IS NULL`,
    [user.id]
  );
}

function otpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user || !user.is_active) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const passwordMatches =
    user.password_hash && (await comparePassword(password, user.password_hash));

  if (!passwordMatches) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const tokens = await issueTokenPair(user);

  return {
    user: publicUser(user),
    ...tokens,
  };
}

async function verifyGoogleIdToken(credential) {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    const error = new Error("Google login is not configured");
    error.statusCode = 500;
    throw error;
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: googleClientId,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.sub || !payload.email || !payload.email_verified) {
    const error = new Error("Invalid Google account");
    error.statusCode = 401;
    throw error;
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split("@")[0],
  };
}

async function loginWithGoogle({ credential, idToken }) {
  let googleUser;

  try {
    googleUser = await verifyGoogleIdToken(credential || idToken);
  } catch (error) {
    if (!error.statusCode) {
      error.message = "Invalid Google token";
      error.statusCode = 401;
    }

    throw error;
  }

  let user = await findUserByGoogleId(googleUser.googleId);

  if (!user) {
    user = await findUserByEmail(googleUser.email);

    if (user) {
      if (user.google_id && user.google_id !== googleUser.googleId) {
        const error = new Error("Google account is already linked differently");
        error.statusCode = 409;
        throw error;
      }

      await db.query(
        `UPDATE users
         SET google_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND google_id IS NULL`,
        [googleUser.googleId, user.id]
      );
    } else {
      const [result] = await db.query(
        `INSERT INTO users (name, email, google_id, auth_provider)
         VALUES (?, ?, ?, 'google')`,
        [googleUser.name, googleUser.email, googleUser.googleId]
      );

      user = await findActiveUserById(result.insertId);
    }
  }

  if (!user.is_active) {
    const error = new Error("Account is disabled");
    error.statusCode = 403;
    throw error;
  }

  const activeUser = await findActiveUserById(user.id);
  const tokens = await issueTokenPair(activeUser);

  return {
    user: publicUser(activeUser),
    ...tokens,
  };
}

async function refresh(refreshToken) {
  if (!refreshToken) {
    const error = new Error("Refresh token is required");
    error.statusCode = 401;
    throw error;
  }

  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    const authError = new Error("Invalid refresh token");
    authError.statusCode = 401;
    throw authError;
  }

  const tokenHash = hashToken(refreshToken);
  const [[storedToken]] = await db.query(
    `SELECT *
     FROM refresh_tokens
     WHERE token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );

  if (
    !storedToken ||
    String(storedToken.user_id) !== String(payload.sub) ||
    storedToken.revoked_at ||
    new Date(storedToken.expires_at).getTime() <= Date.now()
  ) {
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE user_id = ? AND revoked_at IS NULL`,
      [payload.sub]
    );

    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }

  const user = await findActiveUserById(storedToken.user_id);

  if (!user) {
    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }

  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [storedToken.id]
  );

  const tokens = await issueTokenPair(user);

  return {
    user: publicUser(user),
    ...tokens,
  };
}

async function logout(refreshToken) {
  if (!refreshToken) {
    return;
  }

  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashToken(refreshToken)]
  );
}

module.exports = {
  findActiveUserById,
  confirmRegistrationOtp,
  login,
  loginWithGoogle,
  logout,
  publicUser,
  refresh,
  register,
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetOtp,
};
