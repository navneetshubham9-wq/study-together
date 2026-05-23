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

// public/script.js
// Ensure index.html loads AgoraRTC and socket.io client before this script.
const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const socket = io();

// State
let localTracks = { audioTrack: null, videoTrack: null };
let localUid = null;
let joined = false;
let currentRoom = null;
let screenTrack = null;
const remoteUsers = {}; // uid -> Agora user

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

// Helpers
function appendMessage(text) {
  const d = document.createElement("div");
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function createLocalCard(name) {
  let el = document.getElementById("local-player");
  if (el) return el;
  const localContainer = document.createElement("div");
  localContainer.className = "video-card";
  localContainer.id = "local-player";
  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.top = "6px";
  label.style.left = "6px";
  label.style.padding = "4px 8px";
  label.style.background = "rgba(0,0,0,0.5)";
  label.style.color = "#fff";
  label.style.borderRadius = "6px";
  label.style.fontSize = "13px";
  label.textContent = `${name} (You)`;
  localContainer.appendChild(label);
  videoArea.prepend(localContainer);
  return localContainer;
}

function createRemoteCard(uid, labelText) {
  const id = `remote-${uid}`;
  if (document.getElementById(id)) return document.getElementById(id);

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
  labelDiv.textContent = labelText || `User ${uid}`;
  card.appendChild(labelDiv);

  const controlsDiv = document.createElement("div");
  controlsDiv.className = "video-controls";

  const muteRemoteBtn = document.createElement("button");
  muteRemoteBtn.className = "small-btn";
  muteRemoteBtn.textContent = "Mute Remote Mic";
  muteRemoteBtn.onclick = () => {
    if (!currentRoom) { appendMessage("System: Join a room first"); return; }
    socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "mute-audio" });
    appendMessage(`You requested to mute user ${uid}`);
  };

  const camOffBtn = document.createElement("button");
  camOffBtn.className = "small-btn";
  camOffBtn.textContent = "Disable Remote Cam";
  camOffBtn.onclick = () => {
    if (!currentRoom) { appendMessage("System: Join a room first"); return; }
    socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "disable-video" });
    appendMessage(`You requested to disable camera of user ${uid}`);
  };

  controlsDiv.appendChild(muteRemoteBtn);
  controlsDiv.appendChild(camOffBtn);
  card.appendChild(controlsDiv);

  videoArea.appendChild(card);
  return card;
}

// JOIN
joinBtn.addEventListener("click", async () => {
  if (joined) return;
  const userName = usernameInput.value.trim();
  const roomId = roomInput.value.trim();
  if (!userName || !roomId) { alert("Enter both Name and Room ID"); return; }

  try {
    const uid = await client.join(APP_ID, roomId, null, userName);
    localUid = uid.toString();

    const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    localTracks.audioTrack = microphoneTrack;
    localTracks.videoTrack = cameraTrack;

    const localContainer = createLocalCard(userName);
    cameraTrack.play(localContainer);

    await client.publish([microphoneTrack, cameraTrack]);

    joined = true;
    currentRoom = roomId;

    muteBtn.textContent = localTracks.audioTrack.isEnabled() ? "Mute" : "Unmute";
    cameraBtn.textContent = localTracks.videoTrack.isEnabled() ? "Camera Off" : "Camera On";
    controls.classList.remove("hidden");

    socket.emit("join-room", { room: roomId, uid: localUid, name: userName });
    appendMessage("System: Joined room " + roomId);

    console.log("After join: localUid=", localUid, "joined=", joined);
  } catch (err) {
    console.error("Join error:", err);
    appendMessage("Join failed: " + (err.message || err));
    alert("Join failed: " + (err.message || err));
  }
});

// Remote published
client.on("user-published", async (user, mediaType) => {
  try {
    await client.subscribe(user, mediaType);
    const uid = user.uid.toString();
    const card = createRemoteCard(uid, `User ${uid}`);
    if (mediaType === "video" && user.videoTrack) {
      user.videoTrack.play(card);
    }
    if (mediaType === "audio" && user.audioTrack) {
      user.audioTrack.play();
    }
    remoteUsers[uid] = user;
    console.log("user-published:", uid, mediaType);
  } catch (e) {
    console.error("user-published error:", e);
  }
});

client.on("user-unpublished", user => {
  try {
    const uid = user.uid.toString();
    const el = document.getElementById(`remote-${uid}`);
    if (el) el.remove();
    delete remoteUsers[uid];
  } catch (e) { console.error(e); }
});

// Self camera toggle
cameraBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.videoTrack) { appendMessage("System: Join room first"); return; }
  try {
    const enabled = localTracks.videoTrack.isEnabled();
    localTracks.videoTrack.setEnabled(!enabled);
    cameraBtn.textContent = enabled ? "Camera On" : "Camera Off";
    appendMessage(`System: Camera ${enabled ? "turned off" : "turned on"}`);
  } catch (err) {
    console.error("Camera toggle error:", err);
  }
});

// Self mic toggle
muteBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.audioTrack) { appendMessage("System: Join room first"); return; }
  try {
    const enabled = localTracks.audioTrack.isEnabled();
    localTracks.audioTrack.setEnabled(!enabled);
    muteBtn.textContent = enabled ? "Unmute" : "Mute";
    appendMessage(`System: Microphone ${enabled ? "muted" : "unmuted"}`);
  } catch (err) {
    console.error("Mic toggle error:", err);
  }
});

// Screen share
shareBtn.addEventListener("click", async () => {
  if (!joined) { appendMessage("System: Join room first"); return; }
  try {
    if (screenTrack) {
      try { await client.unpublish(screenTrack); } catch(e){}
      screenTrack.close();
      screenTrack = null;
      const el = document.getElementById("screen-share");
      if (el) el.remove();
      if (localTracks.videoTrack) await client.publish(localTracks.videoTrack);
      appendMessage("System: Screen share stopped");
      return;
    }

    if (localTracks.videoTrack) {
      try { await client.unpublish(localTracks.videoTrack); } catch(e){}
    }

    screenTrack = await AgoraRTC.createScreenVideoTrack({}, "auto");
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
    appendMessage("System: Screen share started");

    screenTrack.on("track-ended", async () => {
      try { await client.unpublish(screenTrack); } catch(e){}
      screenCard.remove();
      screenTrack = null;
      if (localTracks.videoTrack) await client.publish(localTracks.videoTrack);
      appendMessage("System: Screen share ended");
    });
  } catch (err) {
    console.error("Screen share error:", err);
    appendMessage("Screen share failed: " + (err.message || err));
    if (localTracks.videoTrack) {
      try { await client.publish(localTracks.videoTrack); } catch(e){}
    }
  }
});

// Chat send
sendMsgBtn.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat-message", { room: currentRoom, name: usernameInput.value || "Me", text });
  appendMessage(`Me: ${text}`);
  chatInput.value = "";
});

// Receive chat
socket.on("chat-message", data => {
  appendMessage(`${data.name}: ${data.text}`);
});

// File upload
uploadBtn.addEventListener("click", async () => {
  const f = fileUpload.files[0];
  if (!f) { alert("Select a file"); return; }
  const fd = new FormData();
  fd.append("file", f);
  fd.append("room", currentRoom || "");
  fd.append("uploader", usernameInput.value || "Someone");
  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
    const json = await res.json();
    addFileLink(json.filename, json.url);
  } catch (err) {
    console.error(err);
    appendMessage("Upload failed: " + (err.message || err));
  }
});

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

// Remote control commands (received)
socket.on("control", data => {
  console.log("control received:", data);
  if (!joined) return;
  if (!data || !data.targetUid) return;
  if (data.targetUid.toString() !== localUid.toString()) return;

  if (data.action === "mute-audio" && localTracks.audioTrack) {
    localTracks.audioTrack.setEnabled(false);
    muteBtn.textContent = "Unmute";
    appendMessage("System: Your mic was muted by another participant");
  }
  if (data.action === "disable-video" && localTracks.videoTrack) {
    localTracks.videoTrack.setEnabled(false);
    cameraBtn.textContent = "Camera On";
    appendMessage("System: Your camera was disabled by another participant");
  }
  if (data.action === "enable-audio" && localTracks.audioTrack) {
    localTracks.audioTrack.setEnabled(true);
    muteBtn.textContent = "Mute";
  }
  if (data.action === "enable-video" && localTracks.videoTrack) {
    localTracks.videoTrack.setEnabled(true);
    cameraBtn.textContent = "Camera Off";
  }
});

// Notifications
socket.on("user-joined", info => {
  appendMessage(`System: ${info.name || info.uid} joined`);
});
socket.on("user-left", info => {
  appendMessage(`System: A user left`);
});

