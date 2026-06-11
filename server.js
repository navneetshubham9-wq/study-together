const express = require("express");
const http = require("http");
const https = require("https"); 
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const fs = require("fs");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 2e7,
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true
});

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---- Database & Encryption Setup ----
const DB_DIR = path.join(__dirname, "db");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, "logs.db"));
db.pragma("journal_mode = WAL");

const KEY_FILE = path.join(DB_DIR, "encryption.key");
let ENCRYPTION_KEY;
if (fs.existsSync(KEY_FILE)) {
  ENCRYPTION_KEY = fs.readFileSync(KEY_FILE);
} else {
  ENCRYPTION_KEY = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, ENCRYPTION_KEY);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    host_name TEXT,
    host_ip TEXT
  );
  CREATE TABLE IF NOT EXISTS room_joins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    uid TEXT NOT NULL,
    name TEXT,
    ip TEXT,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    left_at TEXT,
    FOREIGN KEY (room_code) REFERENCES rooms(code)
  );
  CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    sender_name TEXT,
    encrypted_iv TEXT NOT NULL,
    encrypted_data TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (room_code) REFERENCES rooms(code)
  );
  CREATE TABLE IF NOT EXISTS file_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    filename TEXT NOT NULL,
    uploader TEXT,
    url TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (room_code) REFERENCES rooms(code)
  );
`);

function encryptText(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { iv: iv.toString("hex"), data: encrypted };
}

function getClientIP(socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return socket.handshake.address;
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
const roomAgenda = new Map(); 

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

    // Log file share to database
    try {
      const stmt = db.prepare("INSERT INTO file_shares (room_code, filename, uploader, url) VALUES (?, ?, ?, ?)");
      stmt.run(room, filename, uploader, url);
    } catch (e) { console.error("DB file log error:", e); }
  }
  res.json({ filename, url });
});

io.on("connection", socket => {
  
  socket.on("join-room", info => {
    const { room, uid, name } = info;
    socket.join(room);
    
    // Log room creation and join to database
    try {
      const existing = db.prepare("SELECT id FROM rooms WHERE code = ?").get(room);
      if (!existing) {
        const ip = getClientIP(socket);
        db.prepare("INSERT INTO rooms (code, host_name, host_ip) VALUES (?, ?, ?)").run(room, name, ip);
      }
      db.prepare("INSERT INTO room_joins (room_code, uid, name, ip) VALUES (?, ?, ?, ?)").run(room, uid, name, getClientIP(socket));
    } catch (e) { console.error("DB room log error:", e); }
    
    socketUsers.set(socket.id, { uid, name, room });
    uidToSocket.set(uid.toString(), socket.id);

    const joiningIsHost = !roomHosts.has(room) || roomHosts.get(room) === null;
    if (joiningIsHost) {
      roomHosts.set(room, socket.id);
      roomHostUid.set(room, uid);
    }
    socket.emit("host-assignment", { isHost: joiningIsHost, hostUid: joiningIsHost ? uid : roomHostUid.get(room) });
    
    socket.emit("room-history", {
      isHost: joiningIsHost,
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
    const timestamp = new Date().toISOString();
    if (!roomChats.has(data.room)) roomChats.set(data.room, []);
    roomChats.get(data.room).push({ name: data.name, text: data.text, time: timestamp });
    socket.to(data.room).emit("chat-message", data);

    // Encrypt and log chat to database
    try {
      const enc = encryptText(data.text);
      db.prepare("INSERT INTO chat_logs (room_code, sender_name, encrypted_iv, encrypted_data) VALUES (?, ?, ?, ?)")
        .run(data.room, data.name, enc.iv, enc.data);
    } catch (e) { console.error("DB chat log error:", e); }
  });

  socket.on("agenda-sync", data => {
    roomAgenda.set(data.room, data.agenda);
    socket.to(data.room).emit("agenda-sync", data);
  });

  socket.on("get-room-summary", data => {
    const room = data.room;
    const chats = roomChats.get(room) || [];
    const files = roomFiles.get(room) || [];
    let dbData = { room: null, joins: [] };
    try {
      dbData.room = db.prepare("SELECT code, created_at, host_name, host_ip FROM rooms WHERE code = ?").get(room);
      dbData.joins = db.prepare("SELECT uid, name, ip, joined_at, left_at FROM room_joins WHERE room_code = ? ORDER BY joined_at").all(room);
    } catch (e) { console.error("DB summary error:", e); }
    socket.emit("room-summary", { roomCode: room, db: dbData, chats, files, agenda: roomAgenda.get(room) || "" });
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
      // Log leave time in database
      try {
        db.prepare("UPDATE room_joins SET left_at = datetime('now') WHERE room_code = ? AND uid = ? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1")
          .run(user.room, user.uid);
      } catch (e) { console.error("DB leave log error:", e); }

      io.to(user.room).emit("user-left", { uid: user.uid, name: user.name });
      const leaveMsg = { name: "System", text: `${user.name} left the room`, time: new Date().toISOString() };
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