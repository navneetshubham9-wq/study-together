const express = require("express");
const http = require("http");
const https = require("https"); 
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

const uidToSocket = new Map();
const roomHosts = new Map();
const roomHostUid = new Map(); 
const socketUsers = new Map();
const roomChats = new Map();
const roomFiles = new Map();
const roomWbState = new Map();
const roomMapState = new Map();
const roomPresState = new Map(); 
const roomOfficeState = new Map(); 
const roomChartData = new Map(); 

app.get("/proxy-image", (req, res) => {
  const imgUrl = req.query.url;
  if (!imgUrl) return res.status(400).json({ error: "URL missing" });

  const fetchImage = (targetUrl) => {
    const client = targetUrl.startsWith("https") ? https : http;
    const options = { headers: { "User-Agent": "Mozilla/5.0" } };

    client.get(targetUrl, options, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        let redirectUrl = response.headers.location;
        if (!redirectUrl.startsWith("http")) redirectUrl = new URL(redirectUrl, targetUrl).href;
        fetchImage(redirectUrl);
      } 
      else if (response.statusCode === 200) {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const contentType = response.headers["content-type"] || "image/png";
          const base64 = buffer.toString("base64");
          res.json({ dataUri: `data:${contentType};base64,${base64}` }); 
        });
      } else {
        res.status(500).json({ error: `Server failed with status: ${response.statusCode}` });
      }
    }).on("error", (err) => res.status(500).json({ error: err.message }));
  };

  fetchImage(imgUrl);
});

app.post("/upload", upload.single("file"), (req, res) => {
  const room = req.body.room || "";
  const filename = req.file.filename;
  const url = `/uploads/${filename}`;
  const uploader = req.body.uploader || "Host";
  
  if (room && uploader !== "Host-Music") {
    if (!roomFiles.has(room)) roomFiles.set(room, []);
    roomFiles.get(room).push({ filename, url, uploader });
    io.to(room).emit("file-uploaded", { filename, url, uploader });
  }
  res.json({ filename, url });
});

io.on("connection", socket => {
  
  socket.on("join-room", info => {
    const { room, uid, name } = info;
    socket.join(room);
    
    socketUsers.set(socket.id, { uid, name, room });
    uidToSocket.set(uid.toString(), socket.id);

    if (!roomHosts.has(room) || roomHosts.get(room) === null) {
      roomHosts.set(room, socket.id);
      roomHostUid.set(room, uid); 
      socket.emit("host-assignment", { isHost: true, hostUid: uid });
    } else {
      socket.emit("host-assignment", { isHost: false, hostUid: roomHostUid.get(room) });
    }
    
    socket.emit("room-history", { 
      chats: roomChats.get(room) || [], 
      files: roomFiles.get(room) || [],
      wbVisible: roomWbState.get(room) || false,
      mapVisible: roomMapState.get(room) || false,
      presVisible: roomPresState.get(room) || false,
      officeVisible: roomOfficeState.get(room) || false,
      chartData: roomChartData.get(room) || null,
      hostUid: roomHostUid.get(room)
    });

    socket.to(room).emit("user-joined", { uid, name });
    io.to(room).emit("room-update", { size: io.sockets.adapter.rooms.get(room)?.size || 1 });
  });

  socket.on("control", data => io.to(data.room).emit("control", data));
  socket.on("wb-toggle", data => { roomWbState.set(data.room, data.show); io.to(data.room).emit("wb-toggle", data); });
  socket.on("map-toggle", data => { roomMapState.set(data.room, data.show); io.to(data.room).emit("map-toggle", data); });
  socket.on("pres-toggle", data => { roomPresState.set(data.room, data.show); io.to(data.room).emit("pres-toggle", data); });
  socket.on("office-toggle", data => { roomOfficeState.set(data.room, data.show); io.to(data.room).emit("office-toggle", data); });
  
  socket.on("force-screen", data => { socket.to(data.room).emit("force-screen", data); });
  socket.on("office-sync", data => { socket.to(data.room).emit("office-sync", data); });
  socket.on("music-play", data => { socket.to(data.room).emit("music-play", data); });

  socket.on("wb-control", data => io.to(data.room).emit("wb-control", data));
  socket.on("pres-view-switch", data => io.to(data.room).emit("pres-view-switch", data));
  socket.on("presentation-data", data => { roomChartData.set(data.room, data); io.to(data.room).emit("presentation-data", data); });

  socket.on("laser-pointer", data => socket.to(data.room).emit("laser-pointer", data));
  socket.on("wb-pointer", data => socket.to(data.room).emit("wb-pointer", data));
  socket.on("wb-page-sync", data => socket.to(data.room).emit("wb-page-sync", data));
  socket.on("math-equation", data => io.to(data.room).emit("math-equation", data));

  socket.on("chat-message", data => {
    if (!roomChats.has(data.room)) roomChats.set(data.room, []);
    roomChats.get(data.room).push({ name: data.name, text: data.text });
    io.to(data.room).emit("chat-message", data);
  });

  socket.on("drawing", data => socket.to(data.room).emit("drawing", data));
  socket.on("wb-fill", data => socket.to(data.room).emit("wb-fill", data));
  socket.on("wb-stamp", data => socket.to(data.room).emit("wb-stamp", data));
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

      if (roomHosts.get(user.room) === socketId) {
          roomHosts.set(user.room, null);
          roomHostUid.set(user.room, null);
      }

      socketUsers.delete(socketId);
      uidToSocket.delete(user.uid.toString());
      io.to(user.room).emit("room-update", { size: Math.max(0, (io.sockets.adapter.rooms.get(user.room)?.size || 1) - 1) });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});