const prisma = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/password");

/**
 * GET /api/users/me
 * Get current user profile
 */
async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        boards: {
          select: {
            id: true,
            name: true,
            thumbnail: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        },
      },
    });

    return res.json({ user });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ error: "Failed to get profile" });
  }
}

/**
 * PUT /api/users/me
 * Update current user profile (including password change)
 */
async function updateProfile(req, res) {
  try {
    const { username, email, avatarUrl, currentPassword, newPassword } =
      req.body;

    // Build update data
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ error: "Current password is required to change password" });
      }

      // Verify current password
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { passwordHash: true },
      });

      const isValid = await comparePassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "New password must be at least 6 characters" });
      }

      updateData.passwordHash = await hashPassword(newPassword);
    }

    // Check for conflicts
    if (username || email) {
      const conflict = await prisma.user.findFirst({
        where: {
          AND: [
            { id: { not: req.user.id } },
            {
              OR: [username ? { username } : {}, email ? { email } : {}].filter(
                (o) => Object.keys(o).length > 0,
              ),
            },
          ],
        },
      });

      if (conflict) {
        if (conflict.username === username) {
          return res.status(400).json({ error: "Username already taken" });
        }
        if (conflict.email === email) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    return res.json({
      user,
      message: newPassword ? "Profile and password updated" : "Profile updated",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
}

module.exports = {
  getProfile,
  updateProfile,
};
