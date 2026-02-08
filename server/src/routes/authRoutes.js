const express = require("express");
const {
  signup,
  login,
  me,
  logout,
  googleAuthCallback,
} = require("../controllers/authController");
const passport = require("passport");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

// Public routes
router.post("/signup", signup);
router.post("/login", login);

// Protected routes
router.get("/me", authMiddleware, me);
router.post("/logout", authMiddleware, logout);
// Google Auth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login.html",
  }),
  googleAuthCallback,
);

module.exports = router;
