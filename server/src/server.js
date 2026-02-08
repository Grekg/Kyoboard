require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const boardRoutes = require("./routes/boardRoutes");
const userRoutes = require("./routes/userRoutes");
const { initializeSocket } = require("./socket/socketManager");
const passport = require("./config/passport");

const app = express();
const server = http.createServer(app);

// CORS configuration - allow both localhost and 127.0.0.1
const allowedOrigins = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:5501",
  "http://localhost:5501",
  process.env.CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" })); // Large limit for canvas state
app.use(cookieParser());
app.use(passport.initialize());

// Serve static frontend files in production
if (process.env.NODE_ENV === "production") {
  // Docker uses ./public, non-Docker uses ../../
  const fs = require("fs");
  const publicPath = fs.existsSync(path.join(__dirname, "../public"))
    ? path.join(__dirname, "../public")
    : path.join(__dirname, "../../");
  app.use(express.static(publicPath));
}

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/boards", boardRoutes);
app.use("/api/users", userRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Initialize Socket.io
initializeSocket(io);

// Serve index.html for SPA routes in production
if (process.env.NODE_ENV === "production") {
  const fs = require("fs");
  const publicPath = fs.existsSync(path.join(__dirname, "../public"))
    ? path.join(__dirname, "../public")
    : path.join(__dirname, "../../");

  app.get(/.*/, (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith("/api")) {
      return next();
    }
    // Check if file exists, otherwise serve 404.html
    const filePath = path.join(publicPath, req.path);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.sendFile(path.join(publicPath, "404.html"));
      }
    });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  if (process.env.NODE_ENV === "production") {
    const fs = require("fs");
    const publicPath = fs.existsSync(path.join(__dirname, "../public"))
      ? path.join(__dirname, "../public")
      : path.join(__dirname, "../../");
    return res.status(500).sendFile(path.join(publicPath, "500.html"));
  }
  res.status(500).json({ error: "Internal server error" });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎨 Kyoboard Server Running                              ║
║                                                           ║
║   HTTP/Socket.io: http://localhost:${PORT}                  ║
║   Environment:    ${process.env.NODE_ENV || "development"}                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
