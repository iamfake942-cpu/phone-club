const { findActiveUserById, publicUser } = require("../services/auth.service");
const { verifyAccessToken } = require("../utils/token");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const payload = verifyAccessToken(token);
    const user = await findActiveUserById(payload.sub);

    if (!user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    req.user = publicUser(user);
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }
}

module.exports = authMiddleware;
