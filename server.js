// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  }
});
const upload = multer({ storage });

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

// Health
app.get("/health", (req, res) => res.send("OK"));

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    const room = req.body.room || "";
    const filename = req.file.filename;
    const url = `/uploads/${filename}`;
    if (room) io.to(room).emit("file-uploaded", { filename, url, uploader: req.body.uploader || "Someone" });
    return res.json({ filename, url });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// Map of agoraUid -> socketId for direct control messages
const uidToSocket = new Map();

io.on("connection", socket => {
  socket.on("join-room", info => {
    try {
      const room = info.room;
      const uid = info.uid ? info.uid.toString() : null;
      const name = info.name || "Anonymous";
      if (room) {
        socket.join(room);
        if (uid) uidToSocket.set(uid, socket.id);
        socket.to(room).emit("user-joined", { uid, name });
      }
    } catch (e) {
      console.error("join-room error:", e);
    }
  });

  socket.on("control", data => {
    try {
      if (!data) return;
      const { room, targetUid } = data;
      if (targetUid && uidToSocket.has(targetUid.toString())) {
        const targetSocketId = uidToSocket.get(targetUid.toString());
        io.to(targetSocketId).emit("control", data);
      } else if (room) {
        io.to(room).emit("control", data);
      }
    } catch (e) {
      console.error("control error:", e);
    }
  });

  socket.on("chat-message", data => {
    try {
      if (!data || !data.room) return;
      io.to(data.room).emit("chat-message", { name: data.name || "Someone", text: data.text });
    } catch (e) {
      console.error("chat-message error:", e);
    }
  });

  socket.on("disconnecting", () => {
    try {
      for (const [uid, sId] of uidToSocket.entries()) {
        if (sId === socket.id) uidToSocket.delete(uid);
      }
      const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
      rooms.forEach(r => socket.to(r).emit("user-left", { socketId: socket.id }));
    } catch (e) {
      console.error("disconnecting error:", e);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Uploads directory: ${UPLOAD_DIR}`);
});
