const express = require("express");
const http = require("http");
const https = require("https"); 
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const fs = require("fs");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const { Chess } = require("chess.js");

const app = express();
// CORS for Express HTTP routes (needed by Capacitor WebView cross-origin fetch)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 2e7,
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true
});

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const VYDEX_DIR = path.join(DOWNLOAD_DIR, "VYDEX");
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(VYDEX_DIR)) {
  fs.mkdirSync(VYDEX_DIR, { recursive: true });
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
app.use("/uploads", (req, res, next) => {
  const filePath = path.join(UPLOAD_DIR, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
  }
  express.static(UPLOAD_DIR)(req, res, next);
});

// Download endpoint: POST base64 file data, returns downloadable URL
app.post("/api/download", express.json({ limit: "50mb" }), (req, res) => {
  const { filename, data, room } = req.body;
  if (!filename || !data) return res.status(400).json({ error: "Missing filename or data" });
  const roomFolder = room ? room.replace(/[^a-zA-Z0-9_-]/g, "") : "shared";
  const roomVydir = path.join(VYDEX_DIR, roomFolder);
  if (!fs.existsSync(roomVydir)) fs.mkdirSync(roomVydir, { recursive: true });
  const safeName = Date.now() + "-" + path.basename(filename).replace(/\s+/g, "_");
  const filePath = path.join(roomVydir, safeName);
  try {
    const buffer = Buffer.from(data, "base64");
    fs.writeFileSync(filePath, buffer);
    res.json({ url: `/vydex/${roomFolder}/${safeName}` });
  } catch (e) {
    res.status(500).json({ error: "Failed to save file" });
  }
});

// List VYDEX downloads for a room
app.get("/api/vydex-downloads/:room", (req, res) => {
  const roomFolder = req.params.room.replace(/[^a-zA-Z0-9_-]/g, "");
  const roomVydir = path.join(VYDEX_DIR, roomFolder);
  try {
    if (fs.existsSync(roomVydir)) {
      const files = fs.readdirSync(roomVydir).map(f => {
        const stat = fs.statSync(path.join(roomVydir, f));
        return { name: f.replace(/^\d+-/, ""), url: `/vydex/${roomFolder}/${f}`, size: stat.size, time: stat.mtime };
      }).sort((a, b) => b.time - a.time);
      return res.json(files);
    }
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: "Failed to list downloads" });
  }
});

// Serve VYDEX files with attachment header
app.use("/vydex", (req, res, next) => {
  const filePath = path.join(VYDEX_DIR, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath).replace(/^\d+-/, "")}"`);
  }
  express.static(VYDEX_DIR)(req, res, next);
});



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
const roomLocked = new Map();
const chessGames = new Map(); // room -> { game: Chess, players: Map<color, socketId>, spectators: Set<socketId>, challenges: [] }
const pendingJoins = new Map();
const pendingApprovals = new Set();
const roomCleanupTimers = new Map();
const roomAllUsers = new Map(); // room -> Map<uid, { name, active }>

function isRoomEmpty(room) {
  for (const [, u] of socketUsers) { if (u.room === room) return false; }
  return true;
}

function clearRoomData(room) {
  roomChats.delete(room);
  roomFiles.delete(room);
  roomWbState.delete(room);
  roomMapState.delete(room);
  roomPresState.delete(room);
  roomOfficeState.delete(room);
  roomChartData.delete(room);
  roomAgenda.delete(room);
  roomLocked.delete(room);
  roomHosts.delete(room);
  roomHostUid.delete(room);
  roomAllUsers.delete(room);
  roomCleanupTimers.delete(room);
  console.log(`Room ${room} data cleared after 24h of inactivity`);
}

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

// ---- Global Announcement (editable server-side, visible on join page) ----
const ANNOUNCEMENT_FILE = path.join(UPLOAD_DIR, "announcement.json");
function getAnnouncement() {
  try {
    if (fs.existsSync(ANNOUNCEMENT_FILE)) return JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, "utf8"));
  } catch (e) { /* ignore */ }
  return { title: "📢 Announcement", message: "Welcome to VYDEX! Stay tuned for updates." };
}
app.get("/api/announcement", (req, res) => res.json(getAnnouncement()));

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

    // Cancel pending cleanup — room is being reused
    if (roomCleanupTimers.has(room)) {
      clearTimeout(roomCleanupTimers.get(room));
      roomCleanupTimers.delete(room);
    }

    socket.join(room);
    
    // Room lock check — reject new joiners if locked and a host exists
    if (roomLocked.get(room) && roomHosts.get(room) !== null && roomHosts.get(room) !== undefined) {
      if (pendingApprovals.has(socket.id)) {
        pendingApprovals.delete(socket.id);
      } else {
        socket.emit("room-locked", { room, message: "This room is locked by the host. Please try again later." });
        socket.leave(room);
        return;
      }
    }

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

    // Track all users (including past joiners) for participant history
    if (!roomAllUsers.has(room)) roomAllUsers.set(room, new Map());
    roomAllUsers.get(room).set(uid.toString(), { name, active: true, ip: getClientIP(socket) });

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
      hostUid: roomHostUid.get(room),
      agenda: roomAgenda.get(room) || "",
      roomLocked: !!roomLocked.get(room)
    });

    socket.to(room).emit("user-joined", { uid, name });
    io.to(room).emit("room-update", { size: io.sockets.adapter.rooms.get(room)?.size || 1 });
  });

  socket.on("get-room-users", (data, callback) => {
    const room = data.room;
    const allUsers = roomAllUsers.get(room);
    const users = [];
    if (allUsers) {
      const hostSocketId = roomHosts.get(room);
      for (const [uid, info] of allUsers) {
        // Determine isHost: find a currently connected socket for this uid
        const sid = uidToSocket.get(uid);
        const isHost = sid !== undefined && hostSocketId === sid;
        users.push({ uid, name: info.name, active: info.active, isHost });
      }
    }
    if (callback) callback(users);
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

  socket.on("toggle-room-lock", data => {
    const room = data.room;
    const newState = !roomLocked.get(room);
    roomLocked.set(room, newState);
    io.to(room).emit("room-lock-state", { room, locked: newState });
  });

  socket.on("agenda-sync", data => {
    roomAgenda.set(data.room, data.agenda);
    socket.to(data.room).emit("agenda-sync", data);
  });

  socket.on("request-join", (data) => {
    const { room, uid, name } = data;
    if (!roomLocked.get(room)) {
      socket.emit("join-response", { allowed: true });
      return;
    }
    const hostSocketId = roomHosts.get(room);
    const hostSocket = hostSocketId ? io.sockets.sockets.get(hostSocketId) : null;
    if (!hostSocket) {
      socket.emit("join-response", { allowed: false, reason: "No host is currently available in this room." });
      return;
    }
    const timeout = setTimeout(() => {
      pendingJoins.delete(socket.id);
      socket.emit("join-response", { allowed: false, reason: "The host did not respond to your join request." });
      hostSocket.emit("join-request-expired", { requesterSocketId: socket.id });
    }, 4000);
    pendingJoins.set(socket.id, { room, uid, name, timeout });
    hostSocket.emit("join-request", { socketId: socket.id, uid, name, room });
  });

  socket.on("respond-join", (data) => {
    const { requesterSocketId, allowed } = data;
    const pending = pendingJoins.get(requesterSocketId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingJoins.delete(requesterSocketId);
    const requesterSocket = io.sockets.sockets.get(requesterSocketId);
    if (requesterSocket) {
      if (allowed) {
        pendingApprovals.add(requesterSocketId);
        requesterSocket.emit("join-response", { allowed: true });
      } else {
        requesterSocket.emit("join-response", { allowed: false, reason: "The host blocked your join request." });
      }
    }
  });

  socket.on("remove-user", data => {
    const targetSocketId = uidToSocket.get(data.targetUid);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit("kicked", { message: "You were removed from the room by the host." });
        targetSocket.disconnect(true);
      }
    }
  });

  socket.on("end-meeting", data => {
    const room = data.room;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (roomSockets) {
      // Emit meeting-ended to everyone FIRST (so host receives it before any disconnect)
      io.to(room).emit("meeting-ended", { room });
      // Disconnect everyone EXCEPT the host who called end-meeting
      // (host receives meeting-ended → reloads → naturally disconnects)
      for (const socketId of roomSockets) {
        if (socketId !== socket.id) {
          const sock = io.sockets.sockets.get(socketId);
          if (sock) sock.disconnect(true);
        }
      }
      // Remove host from room manually so they can't interact further
      socket.leave(room);
    }
    roomChats.delete(room);
    roomFiles.delete(room);
    roomWbState.delete(room);
    roomMapState.delete(room);
    roomPresState.delete(room);
    roomOfficeState.delete(room);
    roomChartData.delete(room);
    roomAgenda.delete(room);
    roomLocked.delete(room);
    roomHosts.delete(room);
    roomHostUid.delete(room);
    if (roomCleanupTimers.has(room)) { clearTimeout(roomCleanupTimers.get(room)); roomCleanupTimers.delete(room); }
    console.log(`Meeting ended for room ${room}`);
  });

  socket.on("get-room-summary", data => {
    const room = data.room;
    // Only host can generate summary
    const hostSockId = roomHosts.get(room);
    if (hostSockId !== socket.id) return socket.emit("room-summary", { error: "Only host can generate summary" });
    const chats = roomChats.get(room) || [];
    const files = roomFiles.get(room) || [];
    let dbData = { room: null, joins: [] };
    try {
      dbData.room = db.prepare("SELECT code, created_at, host_name, host_ip FROM rooms WHERE code = ?").get(room);
      dbData.joins = db.prepare("SELECT uid, name, ip, joined_at, left_at FROM room_joins WHERE room_code = ? ORDER BY joined_at").all(room);
    } catch (e) { console.error("DB summary error:", e); }
    const allUsers = roomAllUsers.get(room);
    const allUsersArr = allUsers ? Array.from(allUsers.entries()).map(([uid, u]) => ({ uid, name: u.name, active: u.active, ip: u.ip })) : [];
    socket.emit("room-summary", { roomCode: room, db: dbData, chats, files, agenda: roomAgenda.get(room) || "", allUsers: allUsersArr });
  });

  socket.on("get-vydex-files", data => {
    const room = data.room;
    if (!room) return socket.emit("vydex-files-list", { error: "No room specified" });
    // Only the host can access VYDEX downloads
    const hostSockId = roomHosts.get(room);
    if (hostSockId !== socket.id) return socket.emit("vydex-files-list", { error: "Only host can access VYDEX downloads" });
    const roomFolder = room.replace(/[^a-zA-Z0-9_-]/g, "");
    const roomVydir = path.join(VYDEX_DIR, roomFolder);
    try {
      if (fs.existsSync(roomVydir)) {
        const files = fs.readdirSync(roomVydir).map(f => {
          const stat = fs.statSync(path.join(roomVydir, f));
          return { name: f.replace(/^\d+-/, ""), url: `/vydex/${roomFolder}/${f}`, size: stat.size, time: stat.mtime };
        }).sort((a, b) => b.time - a.time);
        socket.emit("vydex-files-list", { files });
      } else {
        socket.emit("vydex-files-list", { files: [] });
      }
    } catch (e) {
      console.error("VYDEX list error:", e);
      socket.emit("vydex-files-list", { error: "Failed to list downloads" });
    }
  });

  socket.on("drawing", data => socket.to(data.room).emit("drawing", data));
  socket.on("wb-fill", data => socket.to(data.room).emit("wb-fill", data));
  socket.on("wb-stamp", data => socket.to(data.room).emit("wb-stamp", data));
  socket.on("clear-whiteboard", data => socket.to(data.room).emit("clear-whiteboard"));

  socket.on("leave-room", () => handleUserLeave(socket.id));
  socket.on("disconnecting", () => {
    const pending = pendingJoins.get(socket.id);
    if (pending) { clearTimeout(pending.timeout); pendingJoins.delete(socket.id); }
    handleUserLeave(socket.id);
  });

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

      // Mark user as inactive in the all-users history
      const roomUsers = roomAllUsers.get(user.room);
      if (roomUsers) {
        const entry = roomUsers.get(user.uid.toString());
        if (entry) entry.active = false;
      }

      if (roomHosts.get(user.room) === socketId) {
          roomHosts.set(user.room, null);
          roomHostUid.set(user.room, null);
      }

      // If room has no host and no users left, schedule cleanup in 24h
      if (roomHosts.get(user.room) === null && isRoomEmpty(user.room)) {
        if (roomCleanupTimers.has(user.room)) clearTimeout(roomCleanupTimers.get(user.room));
        const timer = setTimeout(() => clearRoomData(user.room), 24 * 60 * 60 * 1000);
        roomCleanupTimers.set(user.room, timer);
        console.log(`Room ${user.room} empty, cleanup scheduled in 24h`);
      }

      // Clean up chess game if this user was a player
      const chessState = chessGames.get(user.room);
      if (chessState) {
        for (const [color, info] of chessState.players) {
          if (info.socketId === socketId) {
            chessState.players.delete(color);
            io.to(user.room).emit("chess-player-left", { color, username: info.username });
            if (chessState.players.size < 2) {
              io.to(user.room).emit("chess-game-over", {
                result: "Game ended — a player disconnected",
                winner: null,
                fen: chessState.game.fen()
              });
              chessGames.delete(user.room);
            }
            break;
          }
        }
        chessState.spectators.delete(socketId);
      }

      socketUsers.delete(socketId);
      uidToSocket.delete(user.uid.toString());
      io.to(user.room).emit("room-update", { size: Math.max(0, (io.sockets.adapter.rooms.get(user.room)?.size || 1) - 1) });
    }
  }
});

// ==========================================
// CHESS GAME HANDLERS
// ==========================================
io.on("connection", (socket) => {
socket.on("chess-start", (data) => {
  const room = data.room;
  const username = data.username;
  const playerSocketId = socket.id;

  let gameState = chessGames.get(room);
  if (!gameState) {
    gameState = { game: new Chess(), players: new Map(), spectators: new Set(), challenges: [] };
    chessGames.set(room, gameState);
  }

  // If a game is already in progress, reject
  if (gameState.players.size >= 2) {
    return socket.emit("chess-error", { message: "A game is already in progress" });
  }

  // Join as white if no players, black if one player
  let color = null;
  if (!gameState.players.has("w")) {
    color = "w";
  } else if (!gameState.players.has("b")) {
    color = "b";
  } else {
    // Both spots taken, auto-spectate
    gameState.spectators.add(playerSocketId);
    return socket.emit("chess-spectator", { fen: gameState.game.fen(), turn: gameState.game.turn() });
  }

  gameState.players.set(color, { socketId: playerSocketId, username: username || "Player" });

  // Tell this player their color
  socket.emit("chess-your-color", { color: color });

  // Notify everyone in the room about the chess join
  io.to(room).emit("chess-player-joined", {
    color: color,
    username: username || "Player",
    playerCount: gameState.players.size,
    fen: gameState.game.fen(),
    turn: gameState.game.turn()
  });

  if (gameState.players.size === 2) {
    // Game starts
    io.to(room).emit("chess-game-start", {
      fen: gameState.game.fen(),
      turn: gameState.game.turn(),
      white: gameState.players.get("w").username,
      black: gameState.players.get("b").username
    });
  }
});

socket.on("chess-move", (data) => {
  const room = data.room;
  const gameState = chessGames.get(room);
  if (!gameState) return socket.emit("chess-error", { message: "No chess game in this room" });

  // Verify this socket is one of the players
  let playerColor = null;
  for (const [color, info] of gameState.players) {
    if (info.socketId === socket.id) { playerColor = color; break; }
  }
  if (!playerColor) return socket.emit("chess-error", { message: "You are not a player in this game" });

  // Verify it's their turn (w="w", b="b")
  const turnMap = { w: "w", b: "b" };
  if (turnMap[playerColor] !== gameState.game.turn()) {
    return socket.emit("chess-error", { message: "Not your turn" });
  }

  try {
    const move = gameState.game.move(data.move);
    if (!move) return socket.emit("chess-error", { message: "Invalid move" });

    // Broadcast the move to everyone in the room
    io.to(room).emit("chess-move-made", {
      fen: gameState.game.fen(),
      san: move.san,
      from: move.from,
      to: move.to,
      turn: gameState.game.turn(),
      inCheck: gameState.game.isCheck(),
      inCheckmate: gameState.game.isCheckmate(),
      inStalemate: gameState.game.isStalemate(),
      inDraw: gameState.game.isDraw(),
      isGameOver: gameState.game.isGameOver()
    });

    // If game over, clean up after a delay
    if (gameState.game.isGameOver()) {
      setTimeout(() => {
        chessGames.delete(room);
      }, 60000); // Keep for 1 minute for spectators to see
    }
  } catch (e) {
    socket.emit("chess-error", { message: "Invalid move: " + e.message });
  }
});

socket.on("chess-resign", (data) => {
  const room = data.room;
  const gameState = chessGames.get(room);
  if (!gameState) return;

  let playerColor = null;
  let username = "";
  for (const [color, info] of gameState.players) {
    if (info.socketId === socket.id) { playerColor = color; username = info.username; break; }
  }
  if (!playerColor) return;

  io.to(room).emit("chess-game-over", {
    result: (playerColor === "w" ? "Black" : "White") + " wins by resignation",
    winner: playerColor === "w" ? "b" : "w",
    fen: gameState.game.fen(),
    resignedBy: username
  });
  setTimeout(() => chessGames.delete(room), 60000);
});

socket.on("chess-offer-draw", (data) => {
  const room = data.room;
  const gameState = chessGames.get(room);
  if (!gameState) return;

  let playerColor = null;
  for (const [color, info] of gameState.players) {
    if (info.socketId === socket.id) { playerColor = color; break; }
  }
  if (!playerColor) return;

  // Notify the other player
  for (const [color, info] of gameState.players) {
    if (info.socketId !== socket.id) {
      io.to(info.socketId).emit("chess-draw-offered", { byColor: playerColor });
    }
  }
});

socket.on("chess-draw-response", (data) => {
  const room = data.room;
  const gameState = chessGames.get(room);
  if (!gameState) return;

  if (data.accept) {
    io.to(room).emit("chess-game-over", {
      result: "Draw by agreement",
      winner: null,
      fen: gameState.game.fen()
    });
    setTimeout(() => chessGames.delete(room), 60000);
  } else {
    // Notify the offering player that draw was declined
    for (const [color, info] of gameState.players) {
      if (info.socketId !== socket.id) {
        io.to(info.socketId).emit("chess-draw-declined", {});
      }
    }
  }
});

socket.on("chess-spectate", (data) => {
  const room = data.room;
  const gameState = chessGames.get(room);
  if (!gameState) return socket.emit("chess-error", { message: "No chess game in this room" });

  gameState.spectators.add(socket.id);
  socket.emit("chess-spectator", {
    fen: gameState.game.fen(),
    turn: gameState.game.turn(),
    white: gameState.players.get("w")?.username || "White",
    black: gameState.players.get("b")?.username || "Black",
    isGameOver: gameState.game.isGameOver()
  });
});

socket.on("chess-get-state", (data) => {
  const room = data.room;
  const gameState = chessGames.get(room);
  if (!gameState) return socket.emit("chess-state", { active: false });

  const pArr = [];
  for (const [color, info] of gameState.players) {
    pArr.push({ color, username: info.username });
  }

  socket.emit("chess-state", {
    active: true,
    fen: gameState.game.fen(),
    turn: gameState.game.turn(),
    players: pArr,
    spectatorCount: gameState.spectators.size,
    isGameOver: gameState.game.isGameOver(),
    inCheck: gameState.game.isCheck(),
    inCheckmate: gameState.game.isCheckmate(),
    inDraw: gameState.game.isDraw()
  });
});

socket.on("chess-leave", (data) => {
  const room = data.room;
  const gameState = chessGames.get(room);
  if (!gameState) return;

  // Remove from spectators
  gameState.spectators.delete(socket.id);

  // Remove from players - if a player leaves, the game ends
  for (const [color, info] of gameState.players) {
    if (info.socketId === socket.id) {
      gameState.players.delete(color);
      io.to(room).emit("chess-player-left", { color, username: info.username });

      if (gameState.players.size < 2) {
        io.to(room).emit("chess-game-over", {
          result: "Game ended — a player left",
          winner: null,
          fen: gameState.game.fen()
        });
        chessGames.delete(room);
      }
      return;
    }
  }
});
}); // end chess connection callback

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});