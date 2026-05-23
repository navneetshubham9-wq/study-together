// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Determine Desktop path and ensure uploads folder exists
const userHome = process.env.USERPROFILE || process.env.HOME || __dirname;
const uploadsDir = path.join(userHome, "Desktop", "Study Together", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Multer storage to Desktop/Study Together/uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Serve public files
app.use(express.static(path.join(__dirname, "public")));

// Serve uploads folder statically at /uploads
app.use("/uploads", express.static(uploadsDir));

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const filename = req.file.originalname;
  const url = `/uploads/${encodeURIComponent(filename)}`;
  // Broadcast to room if provided
  const room = req.body.room;
  const uploader = req.body.uploader || "Someone";
  if (room) io.to(room).emit("file-uploaded", { filename, url, uploader });
  else io.emit("file-uploaded", { filename, url, uploader });
  res.json({ filename, url });
});

// Socket.io for chat, room join and remote control
io.on("connection", socket => {
  socket.on("join-room", info => {
    const { room, uid, name } = info || {};
    if (room) {
      socket.join(room);
      socket.data.name = name || `User-${uid}`;
      socket.data.uid = uid;
      io.to(room).emit("user-joined", { uid, name: socket.data.name });
    }
  });

  socket.on("chat-message", data => {
    const { room, text } = data || {};
    const name = socket.data.name || "Anonymous";
    if (room) io.to(room).emit("chat-message", { name, text });
    else io.emit("chat-message", { name, text });
  });

  socket.on("control", data => {
    // data: { room, targetUid, action }
    const { room, targetUid, action } = data || {};
    const fromName = socket.data.name || "Someone";
    if (room) {
      // send to all in room (clients will ignore if not target)
      io.to(room).emit("control", { targetUid, action, from: socket.id, fromName });
    } else {
      io.emit("control", { targetUid, action, from: socket.id, fromName });
    }
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(r => io.to(r).emit("user-left", { name: socket.data.name || "Someone" }));
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Uploads folder: ${uploadsDir}`);
});
