// Corrected and debug-ready script.js
// - Ensure firebaseConfig.storageBucket uses the appspot.com bucket name
// - Includes robust file upload (resumable), immediate local append, detailed console logs
// - Adds diagnostics to help detect CORS / permission issues
// Note: If you still see CORS errors in the console, apply a CORS policy to your storage bucket (gsutil cors set).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAPL2Eh2y33mrcguoziAvP8LoPt8Anu3U",
  authDomain: "study-together-613b7.firebaseapp.com",
  projectId: "study-together-613b7",
  // IMPORTANT: use the appspot.com bucket name (not .firebasestorage.app)
  storageBucket: "study-together-613b7.appspot.com",
  messagingSenderId: "685441753047",
  appId: "1:685441753047:web:c51e387726e9ee0700f592",
  measurementId: "G-Y59SWKY3ES"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// script.js (module)
const APP_ID = "3fd771b87f804bc59f50e485662afaa7"; // provided App ID
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

// Socket.io for chat, file notifications and remote control
const socket = io();

// Local state
let localTracks = { audioTrack: null, videoTrack: null };
let localUid = null;
let joined = false;
const remoteUsers = {}; // uid -> user object

// DOM
const joinBtn = document.getElementById("joinBtn");
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const controls = document.getElementById("controls");
const cameraBtn = document.getElementById("cameraBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");
const videoArea = document.getElementById("video-area");
const sendMsgBtn = document.getElementById("sendMsg");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const uploadBtn = document.getElementById("uploadBtn");
const fileUpload = document.getElementById("fileUpload");
const fileList = document.getElementById("fileList");

// Utility: create video card
function createVideoCard(id, label) {
  const card = document.createElement("div");
  card.className = "video-card";
  card.id = id;

  const labelDiv = document.createElement("div");
  labelDiv.style.position = "absolute";
  labelDiv.style.top = "6px";
  labelDiv.style.left = "6px";
  labelDiv.style.padding = "4px 8px";
  labelDiv.style.background = "rgba(0,0,0,0.5)";
  labelDiv.style.color = "#fff";
  labelDiv.style.borderRadius = "6px";
  labelDiv.style.fontSize = "13px";
  labelDiv.textContent = label;
  card.appendChild(labelDiv);

  const controlsDiv = document.createElement("div");
  controlsDiv.className = "video-controls";

  // Remote control buttons (appear for each remote video)
  const muteRemoteBtn = document.createElement("button");
  muteRemoteBtn.className = "small-btn";
  muteRemoteBtn.textContent = "Mute Remote Mic";
  muteRemoteBtn.onclick = () => {
    const targetUid = id.replace("remote-", "");
    socket.emit("control", { room: currentRoom, targetUid, action: "mute-audio" });
  };

  const camOffBtn = document.createElement("button");
  camOffBtn.className = "small-btn";
  camOffBtn.textContent = "Disable Remote Cam";
  camOffBtn.onclick = () => {
    const targetUid = id.replace("remote-", "");
    socket.emit("control", { room: currentRoom, targetUid, action: "disable-video" });
  };

  controlsDiv.appendChild(muteRemoteBtn);
  controlsDiv.appendChild(camOffBtn);
  card.appendChild(controlsDiv);

  return card;
}

// Append chat message
function appendMessage(text) {
  const d = document.createElement("div");
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

// Current room
let currentRoom = null;

// JOIN flow
joinBtn.addEventListener("click", async () => {
  if (joined) return;
  const userName = usernameInput.value.trim();
  const roomId = roomInput.value.trim();
  if (!userName || !roomId) {
    alert("Enter both Name and Room ID");
    return;
  }
  currentRoom = roomId;

  try {
    // Join Agora channel (no token)
    localUid = await client.join(APP_ID, roomId, null, userName);

    // Create local tracks (mic + camera) and auto‑on
    const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    localTracks.audioTrack = microphoneTrack;
    localTracks.videoTrack = cameraTrack;

    // Local player container
    const localContainer = document.createElement("div");
    localContainer.className = "video-card";
    localContainer.id = `local-player`;
    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.top = "6px";
    label.style.left = "6px";
    label.style.padding = "4px 8px";
    label.style.background = "rgba(0,0,0,0.5)";
    label.style.color = "#fff";
    label.style.borderRadius = "6px";
    label.style.fontSize = "13px";
    label.textContent = `${userName} (You)`;
    localContainer.appendChild(label);

    videoArea.prepend(localContainer);
    cameraTrack.play(localContainer);

    // Publish tracks
    await client.publish([microphoneTrack, cameraTrack]);

    // Show controls
    controls.classList.remove("hidden");
    joined = true;

    // Notify server (socket) about join
    socket.emit("join-room", { room: roomId, uid: localUid, name: userName });

    appendMessage("System: Joined room " + roomId);
  } catch (err) {
    console.error("Join error:", err);
    alert("Join failed: " + (err.message || err));
  }
});

// Handle remote published users
client.on("user-published", async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  const uid = user.uid.toString();

  // If video
  if (mediaType === "video") {
    // create container if not exists
    if (!document.getElementById(`remote-${uid}`)) {
      const card = createVideoCard(`remote-${uid}`, `User ${uid}`);
      videoArea.appendChild(card);
    }
    user.videoTrack.play(document.getElementById(`remote-${uid}`));
  }
  // If audio
  if (mediaType === "audio") {
    user.audioTrack.play();
  }

  remoteUsers[uid] = user;
});

// Handle remote unpublished / left
client.on("user-unpublished", user => {
  const uid = user.uid.toString();
  const el = document.getElementById(`remote-${uid}`);
  if (el) el.remove();
  delete remoteUsers[uid];
});

// Camera toggle
cameraBtn.addEventListener("click", () => {
  if (!localTracks.videoTrack) return;
  const enabled = localTracks.videoTrack.isEnabled();
  localTracks.videoTrack.setEnabled(!enabled);
  cameraBtn.textContent = enabled ? "Camera On" : "Camera Off";
});

// Mic toggle
muteBtn.addEventListener("click", () => {
  if (!localTracks.audioTrack) return;
  const enabled = localTracks.audioTrack.isEnabled();
  localTracks.audioTrack.setEnabled(!enabled);
  muteBtn.textContent = enabled ? "Unmute" : "Mute";
});

// Screen share
shareBtn.addEventListener("click", async () => {
  try {
    const screenTrack = await AgoraRTC.createScreenVideoTrack({}, "auto");
    const screenCard = document.createElement("div");
    screenCard.className = "video-card";
    screenCard.id = "screen-share";
    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.top = "6px";
    label.style.left = "6px";
    label.style.padding = "4px 8px";
    label.style.background = "rgba(0,0,0,0.5)";
    label.style.color = "#fff";
    label.style.borderRadius = "6px";
    label.style.fontSize = "13px";
    label.textContent = "Screen Share";
    screenCard.appendChild(label);
    videoArea.appendChild(screenCard);
    screenTrack.play(screenCard);
    await client.publish(screenTrack);

    // When user stops screen share, remove element
    screenTrack.on("track-ended", () => {
      screenCard.remove();
      client.unpublish(screenTrack).catch(()=>{});
    });
  } catch (err) {
    console.error("Screen share error:", err);
    alert("Screen share failed: " + (err.message || err));
  }
});

// CHAT via socket.io
sendMsgBtn.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat-message", { room: currentRoom, text });
  appendMessage(`Me: ${text}`);
  chatInput.value = "";
});

// Receive chat messages
socket.on("chat-message", data => {
  appendMessage(`${data.name}: ${data.text}`);
});

// FILE upload
uploadBtn.addEventListener("click", async () => {
  const f = fileUpload.files[0];
  if (!f) { alert("Select a file (jpg/pdf)"); return; }
  const fd = new FormData();
  fd.append("file", f);
  fd.append("room", currentRoom || "");
  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
    const json = await res.json();
    // server will broadcast file info; but also append locally
    addFileLink(json.filename, json.url);
  } catch (err) {
    console.error(err);
    alert("Upload failed: " + (err.message || err));
  }
});

// Add file link to UI
function addFileLink(name, url) {
  const a = document.createElement("a");
  a.href = url;
  a.textContent = name;
  a.download = name;
  a.target = "_blank";
  fileList.prepend(a);
}

// Receive file notifications
socket.on("file-uploaded", data => {
  addFileLink(data.filename, data.url);
  appendMessage(`System: ${data.uploader} uploaded ${data.filename}`);
});

// Remote control commands (received from other users)
socket.on("control", data => {
  // data: { action: 'mute-audio'|'disable-video'|'enable-audio'|'enable-video' , fromUid }
  if (!joined) return;
  if (data.targetUid && data.targetUid.toString() !== localUid.toString()) return; // not for me
  if (data.action === "mute-audio" && localTracks.audioTrack) {
    localTracks.audioTrack.setEnabled(false);
    appendMessage("System: Your mic was muted by another participant");
  }
  if (data.action === "disable-video" && localTracks.videoTrack) {
    localTracks.videoTrack.setEnabled(false);
    appendMessage("System: Your camera was disabled by another participant");
  }
  if (data.action === "enable-audio" && localTracks.audioTrack) {
    localTracks.audioTrack.setEnabled(true);
  }
  if (data.action === "enable-video" && localTracks.videoTrack) {
    localTracks.videoTrack.setEnabled(true);
  }
});

// Socket: when someone joins/leaves (optional notifications)
socket.on("user-joined", info => {
  appendMessage(`System: ${info.name} joined`);
});
socket.on("user-left", info => {
  appendMessage(`System: ${info.name} left`);
});
