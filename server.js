const express = require("express");
const http = require("http");
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const fs = require("fs");
const https = require("https"); // NAYA: Image Proxy ke liye

const app = express();
const server = http.createServer(app);
// Increase Socket Payload limit from 1MB to 10MB just to be safe
const io = new Server(server, { maxHttpBufferSize: 1e7 }); 

// Upload Directory Setup
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  }
});
const upload = multer({ storage });

// Express Middlewares
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

// Memory State Storage
const uidToSocket = new Map();
const roomHosts = new Map();
const socketUsers = new Map();
const roomChats = new Map();
const roomFiles = new Map();
const roomWbState = new Map();
const roomMapState = new Map();
const roomPresState = new Map(); 
const roomChartData = new Map(); 

// NAYA: Internal Image Proxy to bypass CORS completely
app.get("/proxy-image", (req, res) => {
  const imgUrl = req.query.url;
  if(!imgUrl) return res.status(400).send("URL required");
  
  const options = { headers: { 'User-Agent': 'Mozilla/5.0' } };
  
  const fetchImage = (url) => {
      https.get(url, options, (response) => {
          // Handle redirects (Wikipedia uses them often)
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              fetchImage(response.headers.location);
          } else {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
              response.pipe(res);
          }
      }).on('error', () => {
          res.status(500).send("Error fetching image");
      });
  };
  fetchImage(imgUrl);
});

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

    if (!roomHosts.has(room) || roomHosts.get(room) === null) {
      roomHosts.set(room, socket.id);
      socket.emit("host-assignment", { isHost: true });
    } else {
      socket.emit("host-assignment", { isHost: false });
    }
    
    socket.emit("room-history", { 
      chats: roomChats.get(room) || [], 
      files: roomFiles.get(room) || [],
      wbVisible: roomWbState.get(room) || false,
      mapVisible: roomMapState.get(room) || false,
      presVisible: roomPresState.get(room) || false,
      chartData: roomChartData.get(room) || null
    });

    socket.to(room).emit("user-joined", { uid, name });
    
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 1;
    io.to(room).emit("room-update", { size: roomSize });
  });

  socket.on("control", data => io.to(data.room).emit("control", data));
  socket.on("wb-toggle", data => { roomWbState.set(data.room, data.show); io.to(data.room).emit("wb-toggle", data); });
  socket.on("map-toggle", data => { roomMapState.set(data.room, data.show); io.to(data.room).emit("map-toggle", data); });
  socket.on("wb-control", data => io.to(data.room).emit("wb-control", data));
  socket.on("pres-toggle", data => { roomPresState.set(data.room, data.show); io.to(data.room).emit("pres-toggle", data); });
  socket.on("pres-view-switch", data => io.to(data.room).emit("pres-view-switch", data));
  
  socket.on("presentation-data", data => {
    roomChartData.set(data.room, data);
    io.to(data.room).emit("presentation-data", data);
  });

  socket.on("laser-pointer", data => socket.to(data.room).emit("laser-pointer", data));
  socket.on("wb-pointer", data => socket.to(data.room).emit("wb-pointer", data));
  socket.on("math-equation", data => io.to(data.room).emit("math-equation", data));

  socket.on("chat-message", data => {
    if (!roomChats.has(data.room)) roomChats.set(data.room, []);
    roomChats.get(data.room).push({ name: data.name, text: data.text });
    io.to(data.room).emit("chat-message", data);
  });

  socket.on("drawing", data => socket.to(data.room).emit("drawing", data));
  socket.on("wb-fill", data => socket.to(data.room).emit("wb-fill", data));
  socket.on("wb-image", data => socket.to(data.room).emit("wb-image", data));
  socket.on("clear-whiteboard", data => socket.to(data.room).emit("clear-whiteboard"));

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

      if (roomHosts.get(user.room) === socketId) roomHosts.set(user.room, null);

      socketUsers.delete(socketId);
      uidToSocket.delete(user.uid.toString());
      
      const roomSize = io.sockets.adapter.rooms.get(user.room)?.size || 1;
      io.to(user.room).emit("room-update", { size: Math.max(0, roomSize - 1) });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});