const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const socket = io();

// State Variables
let localTracks = { audioTrack: null, videoTrack: null };
let localUid = null;
let joined = false;
let currentRoom = null;
let screenTrack = null;
let screenAudioTrack = null;
let isHost = false; 
const remoteUsers = {}; 
let currentMusicUrl = null;

// DOM Elements
const joinBtn = document.getElementById("joinBtn");
const joinSection = document.getElementById("join-section"); 
const workspace = document.getElementById("workspace"); 
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const controls = document.getElementById("controls");
const cameraBtn = document.getElementById("cameraBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");
const leaveBtn = document.getElementById("leaveBtn");
const muteAllBtn = document.getElementById("muteAllBtn");
const unmuteAllBtn = document.getElementById("unmuteAllBtn");
const videoArea = document.getElementById("video-area");
const sendMsgBtn = document.getElementById("sendMsg");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const uploadBtn = document.getElementById("uploadBtn");
const fileUpload = document.getElementById("fileUpload");
const fileList = document.getElementById("fileList");

// Host Audio & Remote Player DOM Elements
const hostAudioContainer = document.getElementById("hostAudioContainer");
const hostAudioFile = document.getElementById("hostAudioFile");
const hostAudioPlayer = document.getElementById("hostAudioPlayer");
const remoteMusicPlayer = document.getElementById("remoteMusicPlayer");

// Whiteboard DOM Elements
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;

// ---------- NOTIFICATION HELPER ----------
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// ---------- CHAT HELPER ----------
function appendMessage(text) {
  const d = document.createElement("div");
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

// ---------- SIZE CONTROLS (➕, ➖, 🖥️) ----------
function addSizeControls(targetWrapper, elementToFullscreen) {
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "local-controls";

  const enlargeBtn = document.createElement("button");
  enlargeBtn.className = "icon-btn";
  enlargeBtn.innerHTML = "➕";
  enlargeBtn.title = "Maximize locally";
  enlargeBtn.onclick = () => {
    targetWrapper.classList.remove("video-wrapper-small");
    targetWrapper.classList.toggle("video-wrapper-large");
  };

  const shrinkBtn = document.createElement("button");
  shrinkBtn.className = "icon-btn";
  shrinkBtn.innerHTML = "➖";
  shrinkBtn.title = "Minimize locally";
  shrinkBtn.onclick = () => {
    targetWrapper.classList.remove("video-wrapper-large");
    targetWrapper.classList.toggle("video-wrapper-small");
  };

  const maxBtn = document.createElement("button");
  maxBtn.className = "icon-btn";
  maxBtn.innerHTML = "🖥️";
  maxBtn.title = "Fullscreen";
  maxBtn.onclick = () => {
    if (!document.fullscreenElement) {
      elementToFullscreen.requestFullscreen().catch(err => {
        showNotification("Fullscreen not supported", "danger");
      });
    } else {
      document.exitFullscreen();
    }
  };

  controlsDiv.appendChild(enlargeBtn);
  controlsDiv.appendChild(shrinkBtn);
  controlsDiv.appendChild(maxBtn);
  elementToFullscreen.appendChild(controlsDiv);
}

// Applying Size Controls to Whiteboard
addSizeControls(document.getElementById('whiteboard-box'), document.getElementById('whiteboard-container'));

// ---------- WHITEBOARD DRAWING LOGIC ----------
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);

function draw(x0, y0, x1, y1, emit = false) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.closePath();

  if (!emit) return;
  socket.emit('drawing', { x0, y0, x1, y1, room: currentRoom });
}

canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mousemove', (e) => {
  if (!drawing) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  draw(x, y, x - e.movementX, y - e.movementY, true);
});

socket.on('drawing', (data) => {
  draw(data.x0, data.y0, data.x1, data.y1, false);
});

// ---------- UI CREATION HELPERS (Video Cards) ----------
function createLocalCard(name) {
  let el = document.getElementById("local-player");
  if (el) return el;
  const localContainer = document.createElement("div");
  localContainer.className = "video-card";
  localContainer.id = "local-player";
  
  const label = document.createElement("div");
  label.style.position = "absolute"; label.style.top = "6px"; label.style.left = "6px";
  label.style.padding = "4px 8px"; label.style.background = "rgba(0,0,0,0.5)";
  label.style.color = "#fff"; label.style.borderRadius = "6px"; label.style.fontSize = "13px";
  label.style.zIndex = "10"; label.textContent = `${name} (You)`;
  
  localContainer.appendChild(label);
  addSizeControls(localContainer, localContainer);
  videoArea.prepend(localContainer);
  return localContainer;
}

function createRemoteWrapper(uid, labelText) {
  const wrapperId = `remote-wrapper-${uid}`;
  let wrapper = document.getElementById(wrapperId);
  if (wrapper) return wrapper;

  wrapper = document.createElement("div");
  wrapper.id = wrapperId;
  wrapper.style.display = "flex"; wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "center"; wrapper.style.gap = "6px"; wrapper.style.width = "100%"; 

  const card = document.createElement("div");
  card.className = "video-card"; card.id = `remote-${uid}`;
  card.style.width = "100%"; card.style.height = "200px"; card.style.position = "relative";

  const labelDiv = document.createElement("div");
  labelDiv.style.position = "absolute"; labelDiv.style.top = "6px"; labelDiv.style.left = "6px";
  labelDiv.style.padding = "4px 8px"; labelDiv.style.background = "rgba(0,0,0,0.5)";
  labelDiv.style.color = "#fff"; labelDiv.style.borderRadius = "6px";
  labelDiv.style.fontSize = "13px"; labelDiv.style.zIndex = "10";
  labelDiv.textContent = labelText || `User ${uid}`;
  card.appendChild(labelDiv);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.display = "flex"; controlsDiv.style.gap = "8px";
  controlsDiv.style.justifyContent = "center"; controlsDiv.style.width = "100%";

  const muteRemoteBtn = document.createElement("button");
  muteRemoteBtn.className = "small-btn"; muteRemoteBtn.textContent = "Mute";
  muteRemoteBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "mute-audio" });

  const camOffBtn = document.createElement("button");
  camOffBtn.className = "small-btn"; camOffBtn.textContent = "Disable Cam";
  camOffBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "disable-video" });

  controlsDiv.appendChild(muteRemoteBtn);
  controlsDiv.appendChild(camOffBtn);

  wrapper.appendChild(card);
  wrapper.appendChild(controlsDiv);
  addSizeControls(wrapper, card);
  videoArea.appendChild(wrapper);

  return wrapper;
}

function createScreenShareCard(uid) {
  const cardId = `screen-card-${uid}`;
  let card = document.getElementById(cardId);
  if (card) return card;

  card = document.createElement("div");
  card.id = cardId; card.className = "video-card screen-share-card";
  card.style.width = "100%"; card.style.height = "320px";
  card.style.position = "relative"; card.style.border = "3px solid #4CAF50";

  const label = document.createElement("div");
  label.style.position = "absolute"; label.style.top = "6px"; label.style.left = "6px";
  label.style.padding = "4px 8px"; label.style.background = "rgba(0,0,0,0.6)";
  label.style.color = "#fff"; label.style.borderRadius = "6px"; label.style.fontSize = "13px";
  label.style.zIndex = "10"; label.textContent = `User ${uid}'s Presentation`;
  card.appendChild(label);

  addSizeControls(card, card);
  videoArea.appendChild(card);
  return card;
}

// ---------- JOIN LOGIC ----------
joinBtn.addEventListener("click", async () => {
  if (joined) return;
  
  // Audio Autoplay Hack for Browsers
  try {
    remoteMusicPlayer.volume = 0; 
    let playPromise = remoteMusicPlayer.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        remoteMusicPlayer.pause();
        remoteMusicPlayer.volume = 1; 
      }).catch(e => console.log("Audio unlock pending..."));
    }
  } catch(e) {}

  const userName = usernameInput.value.trim();
  const roomId = roomInput.value.trim();
  if (!userName || !roomId) { alert("Enter both Name and Room ID"); return; }

  try {
    const uid = await client.join(APP_ID, roomId, null, userName);
    localUid = uid.toString();

    try {
      const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTracks.audioTrack = microphoneTrack;
      localTracks.videoTrack = cameraTrack;
      const localContainer = createLocalCard(userName);
      localTracks.videoTrack.play(localContainer);
      await client.publish([microphoneTrack, cameraTrack]);
    } catch (mediaErr) {
      showNotification("Camera/Mic busy. Joined as viewer.", "info");
      createLocalCard(userName); 
    }

    joined = true;
    currentRoom = roomId;
    
    joinSection.classList.add("form-out");
    setTimeout(() => {
      joinSection.style.display = "none";
      workspace.classList.remove("hidden");
      workspace.classList.add("workspace-active"); 
      resizeCanvas(); // Ensure whiteboard is correct size after unhiding
    }, 500);

    socket.emit("join-room", { room: roomId, uid: localUid, name: userName });
    showNotification(`You joined room ${roomId}`, "join");
    appendMessage(`System: You joined room ${roomId}`);
    
  } catch (err) {
    showNotification("Join failed!", "danger");
  }
});

// ---------- ROOM HISTORY & HOST ASSIGNMENT ----------
socket.on("room-history", (data) => {
  if (data.chats && data.chats.length > 0) {
    data.chats.forEach(chat => {
      if(chat.name === "System" && chat.text.includes("left the room")) return;
      appendMessage(`${chat.name}: ${chat.text}`);
    });
  }
  if (data.files && data.files.length > 0) {
    [...data.files].reverse().forEach(file => {
      addFileLink(file.filename, file.url);
    });
  }
});

socket.on("host-assignment", (data) => {
  isHost = data.isHost;
  if (isHost) hostAudioContainer.style.display = "block";
  else hostAudioContainer.style.display = "none";
});

socket.on("room-update", (data) => {
  if (isHost && data.size > 1) {
    muteAllBtn.style.display = "inline-block";
    unmuteAllBtn.style.display = "inline-block";
  } else if (isHost && data.size <= 1) {
    muteAllBtn.style.display = "none";
    unmuteAllBtn.style.display = "none";
  }
});

// ---------- HOST MUSIC PLAYER LOGIC ----------
hostAudioFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  showNotification("Uploading music to server...", "info");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("room", currentRoom || "music-room");
  fd.append("uploader", "Host-Music");

  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    const json = await res.json();
    currentMusicUrl = json.url; 
    hostAudioPlayer.src = currentMusicUrl;
    showNotification("Music uploaded! Ready to play 🎵", "join");
  } catch (err) {
    showNotification("Music upload failed", "danger");
  }
});

hostAudioPlayer.addEventListener("play", () => {
  if (!joined || !isHost || !currentMusicUrl) return;
  socket.emit("control", { room: currentRoom, action: "music-play", url: currentMusicUrl, time: hostAudioPlayer.currentTime });
  socket.emit("chat-message", { room: currentRoom, name: "System", text: "🎵 Host started playing music!" });
});

hostAudioPlayer.addEventListener("pause", () => {
  if (!joined || !isHost) return;
  socket.emit("control", { room: currentRoom, action: "music-pause" });
  socket.emit("chat-message", { room: currentRoom, name: "System", text: "⏸️ Host paused the music." });
});

hostAudioPlayer.addEventListener("seeked", () => {
  if (!joined || !isHost || !currentMusicUrl) return;
  socket.emit("control", { room: currentRoom, action: "music-seek", time: hostAudioPlayer.currentTime });
});

// ---------- LEAVE ROOM ----------
leaveBtn.addEventListener("click", async () => {
  if (!joined) return;
  try {
    socket.emit("leave-room");
    if (localTracks.audioTrack) { localTracks.audioTrack.stop(); localTracks.audioTrack.close(); }
    if (localTracks.videoTrack) { localTracks.videoTrack.stop(); localTracks.videoTrack.close(); }
    if (screenTrack) { screenTrack.stop(); screenTrack.close(); }
    await client.leave();
    setTimeout(() => window.location.reload(), 100);
  } catch (error) {
    window.location.reload();
  }
});

// ---------- REMOTE VIDEO SUBSCRIPTIONS ----------
client.on("user-published", async (user, mediaType) => {
  try {
    await client.subscribe(user, mediaType);
    const uid = user.uid.toString();
    remoteUsers[uid] = user;

    if (mediaType === "video") {
      if (user.videoTrack.getTrackId().includes("screen") || uid.includes("screen")) {
        const screenCard = createScreenShareCard(uid);
        user.videoTrack.play(screenCard);
      } else {
        createRemoteWrapper(uid, `User ${uid}`);
        const card = document.getElementById(`remote-${uid}`);
        user.videoTrack.play(card);
      }
    }
    if (mediaType === "audio" && user.audioTrack) user.audioTrack.play();
  } catch (e) {
    console.error(e);
  }
});

client.on("user-unpublished", (user, mediaType) => {
  const uid = user.uid.toString();
  if (mediaType === "video") {
    const screenCard = document.getElementById(`screen-card-${uid}`);
    if (screenCard) screenCard.remove();
  }
});

function removeRemoteUser3D(uid, name = null) {
  const wrapper = document.getElementById(`remote-wrapper-${uid}`);
  const screenCard = document.getElementById(`screen-card-${uid}`);
  
  if (wrapper) { wrapper.classList.add("fly-out-3d"); setTimeout(() => wrapper.remove(), 700); }
  if (screenCard) { screenCard.classList.add("fly-out-3d"); setTimeout(() => screenCard.remove(), 700); }
  
  if (name) showNotification(`${name} left the room`, "danger");
  else if (wrapper || screenCard) showNotification(`User left the room`, "danger");

  delete remoteUsers[uid];
}

client.on("user-left", (user) => removeRemoteUser3D(user.uid.toString()));
socket.on("user-left", info => { if (info && info.uid) removeRemoteUser3D(info.uid.toString(), info.name); });

// ---------- GLOBAL CONTROLS (Host Only) ----------
muteAllBtn.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "mute-all" }); });
unmuteAllBtn.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "unmute-all" }); });

// ---------- LOCAL CAMERA / MIC TOGGLES ----------
cameraBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.videoTrack) return;
  const enabled = localTracks.videoTrack.enabled;
  await localTracks.videoTrack.setEnabled(!enabled);
  cameraBtn.textContent = enabled ? "Camera On" : "Camera Off";
  showNotification(`Camera ${enabled ? "turned off" : "turned on"}`, "info");
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: enabled ? "disable-video" : "enable-video" });
});

muteBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.audioTrack) return;
  const enabled = localTracks.audioTrack.enabled;
  await localTracks.audioTrack.setEnabled(!enabled);
  muteBtn.textContent = enabled ? "Unmute" : "Mute";
  showNotification(`Microphone ${enabled ? "muted" : "unmuted"}`, "info");
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: enabled ? "mute-audio" : "enable-audio" });
});

// ---------- SCREEN SHARE ----------
shareBtn.addEventListener("click", async () => {
  if (!joined) return;
  try {
    if (screenTrack) {
      await client.unpublish(screenTrack);
      screenTrack.close();
      screenTrack = null;
      const el = document.getElementById("screen-share-container");
      if (el) el.remove();
      
      if (localTracks.videoTrack) {
        await client.publish(localTracks.videoTrack);
        const localContainer = document.getElementById("local-player");
        localTracks.videoTrack.play(localContainer);
      }
      shareBtn.textContent = "Screen Share";
      return;
    }

    if (localTracks.videoTrack) await client.unpublish(localTracks.videoTrack);

    screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto");
    shareBtn.textContent = "Stop Share";

    const screenCard = document.createElement("div");
    screenCard.className = "video-card screen-share-card";
    screenCard.id = "screen-share-container";
    screenCard.style.width = "100%"; screenCard.style.height = "320px";
    screenCard.style.gridColumn = "1 / -1"; screenCard.style.border = "2px solid var(--accent)";
    
    const label = document.createElement("div");
    label.style.position = "absolute"; label.style.top = "6px"; label.style.left = "6px";
    label.style.padding = "4px 8px"; label.style.background = "rgba(0,0,0,0.6)";
    label.style.color = "#fff"; label.style.borderRadius = "6px";
    label.style.fontSize = "13px"; label.style.zIndex = "10";
    label.textContent = `Your Presentation Screen`;
    screenCard.appendChild(label);

    addSizeControls(screenCard, screenCard);
    videoArea.appendChild(screenCard);
    screenTrack.play(screenCard);
    await client.publish(screenTrack);

    screenTrack.on("track-ended", () => { if (screenTrack) shareBtn.click(); });
  } catch (err) {
    console.error(err);
    if (localTracks.videoTrack) {
      await client.publish(localTracks.videoTrack);
      const localContainer = document.getElementById("local-player");
      localTracks.videoTrack.play(localContainer);
    }
  }
});

// ---------- SOCKET COMMANDS RECEIVER ----------
socket.on("control", async (data) => {
  if (!joined || !data) return;

  // Music Player Commands for Non-Hosts
  if (data.action === "music-play") {
    if (!isHost) { 
      const fullUrl = window.location.origin + data.url;
      if (remoteMusicPlayer.src !== fullUrl) remoteMusicPlayer.src = fullUrl;
      remoteMusicPlayer.currentTime = data.time || 0;
      
      let playPromise = remoteMusicPlayer.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          showNotification("🎵 Click anywhere on screen to allow music!", "danger");
          document.body.addEventListener('click', () => {
            remoteMusicPlayer.play().catch(e => console.error(e));
          }, { once: true });
        });
      }
    }
    return;
  }
  if (data.action === "music-pause") { if (!isHost) remoteMusicPlayer.pause(); return; }
  if (data.action === "music-seek") { if (!isHost) remoteMusicPlayer.currentTime = data.time || 0; return; }

  // Room Commands
  if (data.action === "mute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); muteBtn.textContent = "Unmute"; showNotification("Muted by Host", "danger"); return; }
  if (data.action === "unmute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); muteBtn.textContent = "Mute"; showNotification("Unmuted by Host", "info"); return; }
  
  if (data.targetUid === localUid) {
    if (data.action === "mute-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); muteBtn.textContent = "Unmute"; showNotification("Your mic was muted by host", "danger"); }
    if (data.action === "disable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(false); cameraBtn.textContent = "Camera On"; showNotification("Your camera was disabled by host", "danger"); }
    if (data.action === "enable-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); muteBtn.textContent = "Mute"; showNotification("Your mic is now active", "info"); }
    if (data.action === "enable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(true); cameraBtn.textContent = "Camera Off"; showNotification("Your camera is now active", "info"); }
  }
});

// ---------- CHAT SUBMIT LOGIC ----------
sendMsgBtn.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat-message", { room: currentRoom, name: usernameInput.value || "Me", text });
  appendMessage(`Me: ${text}`);
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); sendMsgBtn.click(); }
});

socket.on("chat-message", data => {
  if(data.name === "System" && data.text.includes("left the room")) return;
  if(data.name === "System" && (data.text.includes("music") || data.text.includes("Music"))) {
    showNotification(data.text, "join");
  }
  appendMessage(`${data.name}: ${data.text}`);
});

// ---------- FILE UPLOAD LOGIC ----------
uploadBtn.addEventListener("click", async () => {
  const f = fileUpload.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f); fd.append("room", currentRoom || ""); fd.append("uploader", usernameInput.value || "Someone");
  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    const json = await res.json();
    addFileLink(json.filename, json.url);
  } catch (err) { showNotification("Upload failed", "danger"); }
});

function addFileLink(name, url) {
  const a = document.createElement("a");
  a.href = url; a.textContent = name; a.download = name; a.target = "_blank";
  fileList.prepend(a);
}

socket.on("file-uploaded", data => { 
  addFileLink(data.filename, data.url); 
  showNotification(`${data.uploader} uploaded a file`, "info"); 
});
socket.on("user-joined", info => showNotification(`${info.name || "User"} joined the room!`, "join"));