const express = require("express");
const {
  listBoards,
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  getMessages,
  getNotes,
} = require("../controllers/boardController");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Board CRUD
router.get("/", listBoards);
router.post("/", createBoard);
router.get("/:id", getBoard);
router.put("/:id", updateBoard);
router.delete("/:id", deleteBoard);

// Board sub-resources
router.get("/:id/messages", getMessages);
router.get("/:id/notes", getNotes);

module.exports = router;
