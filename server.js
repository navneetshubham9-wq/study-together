const express = require("express");
const http = require("http");
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e7 }); 

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

// Memory Mapping States
const uidToSocket = new Map();
const roomHosts = new Map();
const socketUsers = new Map();
const roomChats = new Map();
const roomFiles = new Map();

// Generate Random Client UIDs
function generateShortUid() {
  return Math.floor(100000 + Math.random() * 900000);
}

// REST Route Engine
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  const room = req.body.room;
  const uploader = req.body.uploader || "User";
  const fileUrl = `/uploads/${req.file.filename}`;

  const payload = { filename: req.file.originalname, url: fileUrl, uploader };
  if (!roomFiles.has(room)) roomFiles.set(room, []);
  roomFiles.get(room).push(payload);

  io.to(room).emit("file-uploaded", payload);
  res.json(payload);
});

// Socket Communication Infrastructure Loop
io.on("connection", (socket) => {

  socket.on("join-room", (data, callback) => {
    const room = data.room;
    const name = data.name;
    const uid = generateShortUid();

    socket.join(room);
    uidToSocket.set(uid, socket.id);

    let isHost = false;
    if (!roomHosts.has(room) || roomHosts.get(room) === null) {
      roomHosts.set(room, uid);
      isHost = true;
    }

    socketUsers.set(socket.id, { room, name, uid, isHost });

    callback({ uid, isHost });

    // Catch up routines for new entrants
    if (roomChats.has(room)) {
      roomChats.get(room).forEach(msg => socket.emit("chat-message", msg));
    }
    if (roomFiles.has(room)) {
      roomFiles.get(room).forEach(f => socket.emit("file-uploaded", f));
    }

    const sysMsg = { name: "System", text: `${name} entered the workspace.` };
    if (!roomChats.has(room)) roomChats.set(room, []);
    roomChats.get(room).push(sysMsg);
    socket.to(room).emit("chat-message", sysMsg);
  });

  socket.on("get-username", data => {
    const targetSocketId = uidToSocket.get(data.uid);
    if(targetSocketId) {
      const profile = socketUsers.get(targetSocketId);
      if(profile) {
        socket.emit("retrieved-username", { uid: data.uid, name: profile.name, isHost: profile.isHost });
      }
    }
  });

  socket.on("query-host-uid", (data, callback) => {
    const hostUid = roomHosts.get(data.room);
    callback({ hostUid });
  });

  socket.on("chat-message", data => {
    if (!roomChats.has(data.room)) roomChats.set(data.room, []);
    roomChats.get(data.room).push({ name: data.name, text: data.text });
    io.to(data.room).emit("chat-message", data);
  });

  // Whiteboard Real-time Relay Pipelines
  socket.on("drawing", data => socket.to(data.room).emit("drawing", data));
  socket.on("wb-shape", data => socket.to(data.room).emit("wb-shape", data));
  socket.on("clear-whiteboard", data => socket.to(data.room).emit("clear-whiteboard"));
  
  // Whiteboard Synchronous Fullscreen Lock
  socket.on("wb-fullscreen-sync", data => {
    socket.to(data.room).emit("wb-fullscreen-sync", { active: data.active });
  });

  // Requirement 4: VYDEX Office Enterprise Suite Multi-channel Relay
  socket.on("office-data-stream", data => {
    socket.to(data.room).emit("office-data-stream", data);
  });

  socket.on("office-realtime-sync", data => {
    socket.to(data.room).emit("office-realtime-sync", data);
  });

  socket.on("office-fullscreen-sync", data => {
    socket.to(data.room).emit("office-fullscreen-sync", { active: data.active });
  });

  // Leaflet Map Coordinated Synchronization Click
  socket.on("map-click", data => {
    socket.to(data.room).emit("map-click", data);
  });

  // Host Global Hardware Override Broadcast Rules
  socket.on("host-command", data => {
    const user = socketUsers.get(socket.id);
    if(user && user.isHost) {
      if(data.action === "mute") io.to(data.room).emit("room-mute");
      if(data.action === "unmute") io.to(data.room).emit("room-unmute");
    }
  });

  socket.on("disconnect", () => {
    const user = socketUsers.get(socket.id);
    if (user) {
      uidToSocket.delete(user.uid);
      socketUsers.delete(socket.id);

      const leaveMsg = { name: "System", text: `${user.name} left the workspace.` };
      if (roomChats.has(user.room)) roomChats.get(user.room).push(leaveMsg);
      io.to(user.room).emit("chat-message", leaveMsg);

      // Re-assign or purge host token if owner steps down
      if (user.isHost) {
        roomHosts.set(user.room, null);
        // Sync structures clean update triggers
        io.to(user.room).emit("wb-fullscreen-sync", { active: false });
        io.to(user.room).emit("office-realtime-sync", { active: false });
        io.to(user.room).emit("office-fullscreen-sync", { active: false });
      }
    }
  });
});

server.listen(PORT, () => console.log(`VYDEX Engine cluster serving on port ${PORT}`));