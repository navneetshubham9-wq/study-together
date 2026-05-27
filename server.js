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

// Create uploads folder if it doesn't exist
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

// Memory State Storage
const uidToSocket = new Map();
const roomHosts = new Map();
const socketUsers = new Map();
const roomChats = new Map();
const roomFiles = new Map();

// File Upload Route
app.post("/upload", upload.single("file"), (req, res) => {
  const room = req.body.room || "";
  const filename = req.file.filename;
  const url = `/uploads/${filename}`;
  const uploader = req.body.uploader || "Host";
  
  if (room) {
    if (!roomFiles.has(room)) roomFiles.set(room, []);
    roomFiles.get(room).push({ filename, url, uploader });
    io.to(room).emit("file-uploaded", { filename, url, uploader });
  }
  res.json({ filename, url });
});

// Socket Connections
io.on("connection", socket => {
  
  socket.on("join-room", info => {
    const { room, uid, name } = info;
    socket.join(room);
    socketUsers.set(socket.id, { uid, name, room });
    uidToSocket.set(uid.toString(), socket.id);

    // Assign Host (Jo pehle aayega wo Host banega)
    if (!roomHosts.has(room) || roomHosts.get(room) === null) {
      roomHosts.set(room, socket.id);
      socket.emit("host-assignment", { isHost: true });
    } else {
      socket.emit("host-assignment", { isHost: false });
    }
    
    // Send Old History (Chats & Files) to new user
    socket.emit("room-history", { 
      chats: roomChats.get(room) || [], 
      files: roomFiles.get(room) || [] 
    });

    socket.to(room).emit("user-joined", { uid, name });
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 1;
    io.to(room).emit("room-update", { size: roomSize });
  });

  // Global Controls (Music, Mute, Video)
  socket.on("control", data => {
    io.to(data.room).emit("control", data);
  });
  
  // Chat Sync
  socket.on("chat-message", data => {
    if (!roomChats.has(data.room)) roomChats.set(data.room, []);
    roomChats.get(data.room).push({ name: data.name, text: data.text });
    io.to(data.room).emit("chat-message", data);
  });

  // Whiteboard Drawing Sync
  socket.on("drawing", (data) => {
    socket.to(data.room).emit("drawing", data);
  });

  // Leave and Disconnect Handlers
  socket.on("leave-room", () => handleUserLeave(socket.id));
  socket.on("disconnecting", () => handleUserLeave(socket.id));

  function handleUserLeave(socketId) {
    const user = socketUsers.get(socketId);
    if (user) {
      io.to(user.room).emit("user-left", { uid: user.uid, name: user.name });
      
      const leaveMsg = { name: "System", text: `${user.name} left the room` };
      if (!roomChats.has(user.room)) roomChats.set(user.room, []);
      roomChats.get(user.room).push(leaveMsg);
      io.to(user.room).emit("chat-message", leaveMsg);

      if (roomHosts.get(user.room) === socketId) {
        roomHosts.set(user.room, null);
      }

      socketUsers.delete(socketId);
      uidToSocket.delete(user.uid.toString());
      
      const roomSize = io.sockets.adapter.rooms.get(user.room)?.size || 1;
      io.to(user.room).emit("room-update", { size: Math.max(0, roomSize - 1) });
    }
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));