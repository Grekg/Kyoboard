const prisma = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/password");
const { generateToken, cookieOptions } = require("../utils/jwt");

/**
 * POST /api/auth/signup
 * Create a new user account
 */
async function signup(req, res) {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: "Username, email, and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ error: "Email already registered" });
      }
      return res.status(400).json({ error: "Username already taken" });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Generate token and set cookie
    const token = generateToken({ userId: user.id, email: user.email });
    res.cookie("token", token, cookieOptions);

    return res.status(201).json({
      message: "Account created successfully",
      user,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Failed to create account" });
  }
}

/**
 * POST /api/auth/login
 * Authenticate user and return JWT in cookie
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password
    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate token and set cookie
    const token = generateToken({ userId: user.id, email: user.email });
    res.cookie("token", token, cookieOptions);

    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
async function me(req, res) {
  return res.json({ user: req.user });
}

/**
 * POST /api/auth/logout
 * Clear auth cookie
 */
async function logout(req, res) {
  res.clearCookie("token", { path: "/" });
  return res.json({ message: "Logged out successfully" });
}

module.exports = {
  signup,
  login,
  me,
  logout,
};
