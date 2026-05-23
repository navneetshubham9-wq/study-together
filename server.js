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

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  }
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));
app.get("/health", (req, res) => res.send("OK"));

app.post("/upload", upload.single("file"), (req, res) => {
  try {
    const room = req.body.room || "";
    const filename = req.file.filename;
    const url = `/uploads/${filename}`;
    if (room) {
      io.to(room).emit("file-uploaded", { filename, url, uploader: req.body.uploader || "Someone" });
    }
    return res.json({ filename, url });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

const uidToSocket = new Map();
const roomHosts = new Map();
const socketUsers = new Map(); // Track users for accurate notifications

function sendControl(data) {
  try {
    if (!data) return;
    const { room, targetUid, action } = data;
    
    if (action === "mute-all" || action === "unmute-all") {
      io.to(room).emit("control", data);
      return;
    }

    if (targetUid && uidToSocket.has(targetUid.toString())) {
      const targetSocketId = uidToSocket.get(targetUid.toString());
      io.to(targetSocketId).emit("control", data);
    } else if (room) {
      io.to(room).emit("control", data);
    }
  } catch (e) {
    console.error("sendControl error:", e);
  }
}

// Ye function user ke jaane par sab clean karega aur chat message bhejega
function handleUserLeave(socketId) {
  const user = socketUsers.get(socketId);
  if (user) {
    // 1. UI se video gayab karne ke liye
    io.to(user.room).emit("user-left", { uid: user.uid, name: user.name });
    
    // 2. Chatbox me left notification bhejne ke liye
    io.to(user.room).emit("chat-message", { 
      name: "System", 
      text: `${user.name} left the room` 
    });

    uidToSocket.delete(user.uid);
    socketUsers.delete(socketId);

    if (roomHosts.get(user.room) === socketId) {
      roomHosts.set(user.room, null);
    }

    const currentRoomData = io.sockets.adapter.rooms.get(user.room);
    const roomSize = currentRoomData ? currentRoomData.size - 1 : 0;
    // Host buttons ko manage karne ke liye room size update
    io.to(user.room).emit("room-update", { size: Math.max(0, roomSize) });
  }
}

io.on("connection", socket => {
  socket.on("join-room", info => {
    try {
      const room = info && info.room;
      const uid = info && info.uid ? info.uid.toString() : null;
      const name = info && info.name ? info.name : "Anonymous";
      if (!room) return;
      
      socket.join(room);
      if (uid) uidToSocket.set(uid, socket.id);
      socketUsers.set(socket.id, { uid, name, room });

      if (!roomHosts.has(room) || roomHosts.get(room) === null) {
        roomHosts.set(room, socket.id);
        socket.emit("host-assignment", { isHost: true });
      } else {
        socket.emit("host-assignment", { isHost: false });
      }
      
      socket.to(room).emit("user-joined", { uid, name });

      const roomSize = io.sockets.adapter.rooms.get(room).size;
      io.to(room).emit("room-update", { size: roomSize });

    } catch (e) {
      console.error("join-room error:", e);
    }
  });

  socket.on("control", data => {
    try {
      if (!data) return;
      sendControl(data);
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

  // Explicit leave event before reload
  socket.on("leave-room", () => {
    handleUserLeave(socket.id);
  });

  // Fallback if tab is closed directly
  socket.on("disconnecting", () => {
    handleUserLeave(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});