const cookie = require("cookie");
const { verifyToken } = require("../utils/jwt");
const prisma = require("../config/db");

// track users
const boardRooms = new Map();

// notes debounce
const notesDebounce = new Map();

// canvas batch saves
const canvasBatchTimers = new Map();
const canvasPendingStrokes = new Map();

// init socket io
function initializeSocket(io) {
  // auth middleware
  io.use(async (socket, next) => {
    try {
      // grab token
      let token = socket.handshake.auth?.token;

      // fallback cookies
      if (!token) {
        const cookies = cookie.parse(socket.handshake.headers.cookie || "");
        token = cookies.token;
      }

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error("Invalid token"));
      }

      // get user
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

    // join board
    socket.on("join-board", async (boardId) => {
      try {
        // check board
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

        // leave old room
        if (currentBoardId) {
          socket.leave(currentBoardId);
          removeUserFromRoom(currentBoardId, socket.id);
          io.to(currentBoardId).emit("user-left", {
            odId: socket.id,
            userId: socket.user.id,
            username: socket.user.username,
          });
        }

        // join new room
        currentBoardId = boardId;
        socket.join(boardId);
        addUserToRoom(boardId, socket.id, socket.user);

        // load chat
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

        // send state
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

        // broadcast join
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

    // cursor move
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

    // canvas stroke
    socket.on("canvas-stroke", (strokeData) => {
      if (!currentBoardId) return;
      const boardIdToSave = currentBoardId;

      // broadcast stroke
      socket.to(boardIdToSave).emit("canvas-stroke", {
        ...strokeData,
        odId: socket.user.id,
      });

      // queue save
      if (!canvasPendingStrokes.has(boardIdToSave)) {
        canvasPendingStrokes.set(boardIdToSave, []);
      }
      canvasPendingStrokes.get(boardIdToSave).push(strokeData);

      // batch timer
      if (!canvasBatchTimers.has(boardIdToSave)) {
        const timer = setTimeout(async () => {
          await saveCanvasStrokes(boardIdToSave);
          canvasBatchTimers.delete(boardIdToSave);
        }, 5000);
        canvasBatchTimers.set(boardIdToSave, timer);
      }
    });

    // canvas element
    socket.on("canvas-element", (elementData) => {
      if (!currentBoardId) return;

      socket.to(currentBoardId).emit("canvas-element", {
        ...elementData,
        odId: socket.user.id,
      });

      // save element
      saveCanvasElement(currentBoardId, elementData);
    });

    // update element
    socket.on("canvas-element-update", (updateData) => {
      if (!currentBoardId) return;

      socket.to(currentBoardId).emit("canvas-element-update", {
        ...updateData,
        odId: socket.user.id,
      });

      // update element in db
      updateCanvasElement(currentBoardId, updateData);
    });

    // clear canvas
    socket.on("canvas-clear", async () => {
      if (!currentBoardId) return;

      socket.to(currentBoardId).emit("canvas-clear", {
        odId: socket.user.id,
      });

      // clear db
      try {
        await prisma.board.update({
          where: { id: currentBoardId },
          data: { canvasState: { strokes: [], elements: [] } },
        });
      } catch (error) {
        console.error("Clear canvas error:", error);
      }
    });

    // chat msg
    socket.on("chat-message", async (content) => {
      if (!currentBoardId || !content?.trim()) return;

      try {
        // save msg
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

        // broadcast msg
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

    // update notes
    socket.on("notes-update", (content) => {
      if (!currentBoardId) return;
      const boardIdToSave = currentBoardId;

      // broadcast stroke
      socket.to(boardIdToSave).emit("notes-update", {
        content,
        odId: socket.user.id,
        username: socket.user.username,
      });

      // debounce save
      if (notesDebounce.has(boardIdToSave)) {
        clearTimeout(notesDebounce.get(boardIdToSave));
      }

      const timer = setTimeout(async () => {
        try {
          await prisma.sharedNote.upsert({
            where: { boardId: boardIdToSave },
            update: {
              content,
              lastUpdatedBy: socket.user.id,
            },
            create: {
              boardId: boardIdToSave,
              content,
              lastUpdatedBy: socket.user.id,
            },
          });
          notesDebounce.delete(boardIdToSave);
        } catch (error) {
          console.error("Save notes error:", error);
        }
      }, 500);

      notesDebounce.set(boardIdToSave, timer);
    });

    // update board name
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

    // leave board
    socket.on("leave-board", () => {
      if (currentBoardId) {
        socket.leave(currentBoardId);
        removeUserFromRoom(currentBoardId, socket.id);
        socket.to(currentBoardId).emit("user-left", {
          odId: socket.id,
          odId: socket.user.id,
          username: socket.user.username,
        });

        // force save pending strokes before leaving
        if (canvasPendingStrokes.has(currentBoardId)) {
          saveCanvasStrokes(currentBoardId);
          if (canvasBatchTimers.has(currentBoardId)) {
            clearTimeout(canvasBatchTimers.get(currentBoardId));
            canvasBatchTimers.delete(currentBoardId);
          }
        }

        currentBoardId = null;
      }
    });

    // disconnect
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user.username} (${socket.id})`);

      if (currentBoardId) {
        removeUserFromRoom(currentBoardId, socket.id);
        socket.to(currentBoardId).emit("user-left", {
          odId: socket.id,
          odId: socket.user.id,
          username: socket.user.username,
        });

        // force save pending strokes before disconnecting
        if (canvasPendingStrokes.has(currentBoardId)) {
          saveCanvasStrokes(currentBoardId);
          if (canvasBatchTimers.has(currentBoardId)) {
            clearTimeout(canvasBatchTimers.get(currentBoardId));
            canvasBatchTimers.delete(currentBoardId);
          }
        }
      }
    });
  });
}

// add user
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

// rm user
function removeUserFromRoom(boardId, socketId) {
  if (boardRooms.has(boardId)) {
    boardRooms.get(boardId).delete(socketId);
    if (boardRooms.get(boardId).size === 0) {
      boardRooms.delete(boardId);
    }
  }
}

// get active users
function getActiveUsers(boardId) {
  if (!boardRooms.has(boardId)) return [];
  return Array.from(boardRooms.get(boardId).values());
}

// save strokes
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

// save element
async function saveCanvasElement(boardId, element) {
  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { canvasState: true },
    });

    const currentState = board?.canvasState || { strokes: [], elements: [] };
    if (!currentState.elements) currentState.elements = [];

    // update or add
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

// update element partially
async function updateCanvasElement(boardId, updateData) {
  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { canvasState: true },
    });

    const currentState = board?.canvasState || { strokes: [], elements: [] };
    if (!currentState.elements) return;

    // find and merge
    const existingIndex = currentState.elements.findIndex(
      (e) => e.id === updateData.id,
    );
    if (existingIndex >= 0) {
      currentState.elements[existingIndex] = {
        ...currentState.elements[existingIndex],
        ...updateData
      };

      await prisma.board.update({
        where: { id: boardId },
        data: { canvasState: currentState },
      });
    }
  } catch (error) {
    console.error("Update canvas element error:", error);
  }
}

module.exports = { initializeSocket };
