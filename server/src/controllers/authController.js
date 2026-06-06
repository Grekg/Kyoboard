const prisma = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/password");
const { generateToken, cookieOptions } = require("../utils/jwt");

// create user
async function signup(req, res) {
  try {
    const { username, email, password } = req.body;

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

    // check existing
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

    // hash pass
    const passwordHash = await hashPassword(password);

    // save user
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

    // set auth cookie
    const token = generateToken({ userId: user.id, email: user.email });
    res.cookie("token", token, cookieOptions);

    return res.status(201).json({
      message: "Account created successfully",
      token,
      user,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Failed to create account" });
  }
}

// login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // get user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // check pass
    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // set auth cookie
    const token = generateToken({ userId: user.id, email: user.email });
    res.cookie("token", token, cookieOptions);

    return res.json({
      message: "Login successful",
      token,
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

// get current user
async function me(req, res) {
  return res.json({ user: req.user });
}

// logout
async function logout(req, res) {
  res.clearCookie("token", { path: "/" });
  return res.json({ message: "Logged out successfully" });
}

// google callback
async function googleAuthCallback(req, res) {
  try {
    const user = req.user;
    if (!user) {
      const redirectUrl = process.env.CLIENT_URL || "http://localhost:5500";
      return res.redirect(`${redirectUrl}/login.html?error=Google auth failed`);
    }

    // make token
    const token = generateToken({ userId: user.id, email: user.email });

    // set cookie
    res.cookie("token", token, cookieOptions);

    // redirect
    const redirectUrl = process.env.CLIENT_URL || "http://localhost:5500";
    return res.redirect(`${redirectUrl}/login.html?token=${token}`);
  } catch (error) {
    console.error("Google Callback Error:", error);
    const redirectUrl = process.env.CLIENT_URL || "http://localhost:5500";
    return res.redirect(`${redirectUrl}/login.html?error=Login error`);
  }
}

module.exports = {
  signup,
  login,
  me,
  logout,
  googleAuthCallback,
};
