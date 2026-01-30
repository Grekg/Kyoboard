const express = require("express");
const { getProfile, updateProfile } = require("../controllers/userController");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get("/me", getProfile);
router.put("/me", updateProfile);

module.exports = router;
