const { verifyToken } = require("../utils/jwt");
const prisma = require("../config/db");

/**
 * Express middleware to authenticate requests via JWT cookie
 */
async function authMiddleware(req, res, next) {
  try {
    // Get token from cookie OR Authorization header
    let token = req.cookies?.token;

    // Check Authorization header if no cookie
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Authentication error" });
  }
}

/**
 * Optional auth - attaches user if token present, but doesn't require it
 */
async function optionalAuthMiddleware(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        });
        req.user = user;
      }
    }
    next();
  } catch (error) {
    next();
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
};
