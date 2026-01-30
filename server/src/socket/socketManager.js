const cookie = require("cookie");
const { verifyToken } = require("../utils/jwt");
const prisma = require("../config/db");

// Track active users per board room
const boardRooms = new Map(); // boardId -> Map(socketId -> userInfo)

// Debounce timers for notes saving
const notesDebounce = new Map();

// Canvas state batch save timers
const canvasBatchTimers = new Map();
const canvasPendingStrokes = new Map();

/**
 * Initialize Socket.io with the HTTP server
 * @param {Server} io - Socket.io server instance
 */
function initializeSocket(io) {
  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      // Parse cookies from handshake
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      const token = cookies.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error("Invalid token"));
      }

      // Fetch user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
        },
      });

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error("Socket auth error:", error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.id})`);

    let currentBoardId = null;

    /**
     * Join a board room
     */
    socket.on("join-board", async (boardId) => {
      try {
        // Verify board exists
        const board = await prisma.board.findUnique({
          where: { id: boardId },
          include: {
            sharedNote: true,
          },
        });

        if (!board) {
          socket.emit("error", { message: "Board not found" });
          return;
        }

        // Leave previous room if any
        if (currentBoardId) {
          socket.leave(currentBoardId);
          removeUserFromRoom(currentBoardId, socket.id);
          io.to(currentBoardId).emit("user-left", {
            odId: socket.id,
            userId: socket.user.id,
            username: socket.user.username,
          });
        }

        // Join new room
        currentBoardId = boardId;
        socket.join(boardId);
        addUserToRoom(boardId, socket.id, socket.user);

        // Load chat history
        const messages = await prisma.chatMessage.findMany({
          where: { boardId },
          orderBy: { createdAt: "asc" },
          take: 100,
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

        // Send initial state to client
        socket.emit("board-state", {
          board: {
            id: board.id,
            name: board.name,
            canvasState: board.canvasState || { strokes: [], elements: [] },
          },
          notes: board.sharedNote?.content || "",
          messages: messages.map((m) => ({
            id: m.id,
            content: m.content,
            createdAt: m.createdAt,
            user: m.user,
          })),
          users: getActiveUsers(boardId),
        });

        // Notify others
        socket.to(boardId).emit("user-joined", {
          odId: socket.id,
          userId: socket.user.id,
          username: socket.user.username,
          avatarUrl: socket.user.avatarUrl,
        });

        console.log(`${socket.user.username} joined board ${boardId}`);
      } catch (error) {
        console.error("Join board error:", error);
        socket.emit("error", { message: "Failed to join board" });
      }
    });

    /**
     * Live cursor movement (throttled on client, broadcast immediately)
     */
    socket.on("cursor-move", (data) => {
      if (!currentBoardId) return;

      socket.to(currentBoardId).emit("cursor-update", {
        odId: socket.id,
        odId: socket.user.id,
        username: socket.user.username,
        x: data.x,
        y: data.y,
        color: data.color || "#2563EB",
      });
    });

    /**
     * Canvas stroke - broadcast and batch save
     */
    socket.on("canvas-stroke", (strokeData) => {
      if (!currentBoardId) return;

      // Broadcast to others immediately
      socket.to(currentBoardId).emit("canvas-stroke", {
        ...strokeData,
        odId: socket.user.id,
      });

      // Queue for batch save
      if (!canvasPendingStrokes.has(currentBoardId)) {
        canvasPendingStrokes.set(currentBoardId, []);
      }
      canvasPendingStrokes.get(currentBoardId).push(strokeData);

      // Set up batch save timer (every 5 seconds)
      if (!canvasBatchTimers.has(currentBoardId)) {
        const timer = setTimeout(async () => {
          await saveCanvasStrokes(currentBoardId);
          canvasBatchTimers.delete(currentBoardId);
        }, 5000);
        canvasBatchTimers.set(currentBoardId, timer);
      }
    });

    /**
     * Canvas element (sticky notes, shapes, etc.)
     */
    socket.on("canvas-element", (elementData) => {
      if (!currentBoardId) return;

      socket.to(currentBoardId).emit("canvas-element", {
        ...elementData,
        odId: socket.user.id,
      });

      // Save element to canvas state
      saveCanvasElement(currentBoardId, elementData);
    });

    /**
     * Canvas element update (move, resize, edit)
     */
    socket.on("canvas-element-update", (updateData) => {
      if (!currentBoardId) return;

      socket.to(currentBoardId).emit("canvas-element-update", {
        ...updateData,
        odId: socket.user.id,
      });
    });

    /**
     * Canvas clear
     */
    socket.on("canvas-clear", async () => {
      if (!currentBoardId) return;

      socket.to(currentBoardId).emit("canvas-clear", {
        odId: socket.user.id,
      });

      // Clear in database
      try {
        await prisma.board.update({
          where: { id: currentBoardId },
          data: { canvasState: { strokes: [], elements: [] } },
        });
      } catch (error) {
        console.error("Clear canvas error:", error);
      }
    });

    /**
     * Chat message
     */
    socket.on("chat-message", async (content) => {
      if (!currentBoardId || !content?.trim()) return;

      try {
        // Save to database
        const message = await prisma.chatMessage.create({
          data: {
            content: content.trim(),
            boardId: currentBoardId,
            userId: socket.user.id,
          },
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

        // Broadcast to everyone in room (including sender)
        io.to(currentBoardId).emit("chat-message", {
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
          user: message.user,
        });
      } catch (error) {
        console.error("Chat message error:", error);
      }
    });

    /**
     * Shared notes update
     */
    socket.on("notes-update", (content) => {
      if (!currentBoardId) return;

      // Broadcast to others immediately
      socket.to(currentBoardId).emit("notes-update", {
        content,
        odId: socket.user.id,
        username: socket.user.username,
      });

      // Debounce save (500ms)
      if (notesDebounce.has(currentBoardId)) {
        clearTimeout(notesDebounce.get(currentBoardId));
      }

      const timer = setTimeout(async () => {
        try {
          await prisma.sharedNote.upsert({
            where: { boardId: currentBoardId },
            update: {
              content,
              lastUpdatedBy: socket.user.id,
            },
            create: {
              boardId: currentBoardId,
              content,
              lastUpdatedBy: socket.user.id,
            },
          });
          notesDebounce.delete(currentBoardId);
        } catch (error) {
          console.error("Save notes error:", error);
        }
      }, 500);

      notesDebounce.set(currentBoardId, timer);
    });

    /**
     * Board name update
     */
    socket.on("board-name-update", async (name) => {
      if (!currentBoardId || !name?.trim()) return;

      try {
        await prisma.board.update({
          where: { id: currentBoardId },
          data: { name: name.trim() },
        });

        io.to(currentBoardId).emit("board-name-update", {
          name: name.trim(),
          odId: socket.user.id,
        });
      } catch (error) {
        console.error("Update board name error:", error);
      }
    });

    /**
     * Leave board room
     */
    socket.on("leave-board", () => {
      if (currentBoardId) {
        socket.leave(currentBoardId);
        removeUserFromRoom(currentBoardId, socket.id);
        socket.to(currentBoardId).emit("user-left", {
          odId: socket.id,
          odId: socket.user.id,
          username: socket.user.username,
        });
        currentBoardId = null;
      }
    });

    /**
     * Disconnect
     */
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user.username} (${socket.id})`);

      if (currentBoardId) {
        removeUserFromRoom(currentBoardId, socket.id);
        socket.to(currentBoardId).emit("user-left", {
          odId: socket.id,
          odId: socket.user.id,
          username: socket.user.username,
        });
      }
    });
  });
}

/**
 * Add user to room tracking
 */
function addUserToRoom(boardId, socketId, user) {
  if (!boardRooms.has(boardId)) {
    boardRooms.set(boardId, new Map());
  }
  boardRooms.get(boardId).set(socketId, {
    odId: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
  });
}

/**
 * Remove user from room tracking
 */
function removeUserFromRoom(boardId, socketId) {
  if (boardRooms.has(boardId)) {
    boardRooms.get(boardId).delete(socketId);
    if (boardRooms.get(boardId).size === 0) {
      boardRooms.delete(boardId);
    }
  }
}

/**
 * Get active users in a room
 */
function getActiveUsers(boardId) {
  if (!boardRooms.has(boardId)) return [];
  return Array.from(boardRooms.get(boardId).values());
}

/**
 * Save pending canvas strokes to database
 */
async function saveCanvasStrokes(boardId) {
  const strokes = canvasPendingStrokes.get(boardId);
  if (!strokes || strokes.length === 0) return;

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { canvasState: true },
    });

    const currentState = board?.canvasState || { strokes: [], elements: [] };
    currentState.strokes = [...(currentState.strokes || []), ...strokes];

    await prisma.board.update({
      where: { id: boardId },
      data: { canvasState: currentState },
    });

    canvasPendingStrokes.delete(boardId);
  } catch (error) {
    console.error("Save canvas strokes error:", error);
  }
}

/**
 * Save canvas element to database
 */
async function saveCanvasElement(boardId, element) {
  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { canvasState: true },
    });

    const currentState = board?.canvasState || { strokes: [], elements: [] };
    if (!currentState.elements) currentState.elements = [];

    // Check if element exists (update) or is new (add)
    const existingIndex = currentState.elements.findIndex(
      (e) => e.id === element.id,
    );
    if (existingIndex >= 0) {
      currentState.elements[existingIndex] = element;
    } else {
      currentState.elements.push(element);
    }

    await prisma.board.update({
      where: { id: boardId },
      data: { canvasState: currentState },
    });
  } catch (error) {
    console.error("Save canvas element error:", error);
  }
}

module.exports = { initializeSocket };
