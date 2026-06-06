const prisma = require("../config/db");

// get user boards
async function listBoards(req, res) {
  try {
    const boards = await prisma.board.findMany({
      where: { ownerId: req.user.id },
      select: {
        id: true,
        name: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ boards });
  } catch (error) {
    console.error("List boards error:", error);
    return res.status(500).json({ error: "Failed to list boards" });
  }
}

// create board
async function createBoard(req, res) {
  try {
    const { name } = req.body;

    const board = await prisma.board.create({
      data: {
        name: name || "Untitled Board",
        ownerId: req.user.id,
        canvasState: { strokes: [], elements: [] },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    // create empty note
    await prisma.sharedNote.create({
      data: {
        boardId: board.id,
        content: "",
      },
    });

    return res.status(201).json({ board });
  } catch (error) {
    console.error("Create board error:", error);
    return res.status(500).json({ error: "Failed to create board" });
  }
}

// get board by id
async function getBoard(req, res) {
  try {
    const { id } = req.params;

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        sharedNote: {
          select: {
            id: true,
            content: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!board) {
      return res.status(404).json({ error: "Board not found" });
    }

    return res.json({ board });
  } catch (error) {
    console.error("Get board error:", error);
    return res.status(500).json({ error: "Failed to get board" });
  }
}

// update board
async function updateBoard(req, res) {
  try {
    const { id } = req.params;
    const { name, canvasState, thumbnail } = req.body;

    // check exists
    const existing = await prisma.board.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Board not found" });
    }

    // build update
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (canvasState !== undefined) updateData.canvasState = canvasState;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;

    const board = await prisma.board.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        updatedAt: true,
      },
    });

    return res.json({ board });
  } catch (error) {
    console.error("Update board error:", error);
    return res.status(500).json({ error: "Failed to update board" });
  }
}

// delete board
async function deleteBoard(req, res) {
  try {
    const { id } = req.params;

    // check ownership
    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
      return res.status(404).json({ error: "Board not found" });
    }

    if (board.ownerId !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only the owner can delete this board" });
    }

    await prisma.board.delete({ where: { id } });

    return res.json({ message: "Board deleted successfully" });
  } catch (error) {
    console.error("Delete board error:", error);
    return res.status(500).json({ error: "Failed to delete board" });
  }
}

// get chat msgs
async function getMessages(req, res) {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;

    const where = { boardId: id };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      take: parseInt(limit, 10),
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    // return chronologically
    return res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({ error: "Failed to get messages" });
  }
}

// get shared notes
async function getNotes(req, res) {
  try {
    const { id } = req.params;

    const note = await prisma.sharedNote.findUnique({
      where: { boardId: id },
    });

    return res.json({ note: note || { content: "" } });
  } catch (error) {
    console.error("Get notes error:", error);
    return res.status(500).json({ error: "Failed to get notes" });
  }
}

module.exports = {
  listBoards,
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  getMessages,
  getNotes,
};
