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

// socket io cors
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" })); // large limit
app.use(cookieParser());
app.use(passport.initialize());

// serve static files
if (process.env.NODE_ENV === "production") {
  const fs = require("fs");
  const publicPath = fs.existsSync(path.join(__dirname, "../public"))
    ? path.join(__dirname, "../public")
    : path.join(__dirname, "../../");
  app.use(express.static(publicPath));
}

// api routes
app.use("/api/auth", authRoutes);
app.use("/api/boards", boardRoutes);
app.use("/api/users", userRoutes);

// health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// init sockets
initializeSocket(io);

// serve product
app.get("/product", (req, res) => {
  const fs = require("fs");
  const publicPath = fs.existsSync(path.join(__dirname, "../public"))
    ? path.join(__dirname, "../public")
    : path.join(__dirname, "../../");
  res.sendFile(path.join(publicPath, "product.html"));
});

// serve pricing
app.get("/pricing", (req, res) => {
  const fs = require("fs");
  const publicPath = fs.existsSync(path.join(__dirname, "../public"))
    ? path.join(__dirname, "../public")
    : path.join(__dirname, "../../");
  res.sendFile(path.join(publicPath, "pricing.html"));
});

// spa fallback
if (process.env.NODE_ENV === "production") {
  const fs = require("fs");
  const publicPath = fs.existsSync(path.join(__dirname, "../public"))
    ? path.join(__dirname, "../public")
    : path.join(__dirname, "../../");

  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    const filePath = path.join(publicPath, req.path);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.sendFile(path.join(publicPath, "404.html"));
      }
    });
  });
}

// error handler
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

// start server
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

// graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
