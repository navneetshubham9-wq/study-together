const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const socket = io();

// State Variables
let localTracks = { audioTrack: null, videoTrack: null };
let localUid = null;
let joined = false;
let currentRoom = null;
let screenTrack = null;
let isHost = false; 
const remoteUsers = {}; 
let currentMusicUrl = null;

// Whiteboard State
let canDraw = false; 
let currentBrushColor = "#000000";
let currentBrushSize = 3;
let isEraser = false; 

// DOM Elements
const joinBtn = document.getElementById("joinBtn");
const joinSection = document.getElementById("join-section"); 
const workspace = document.getElementById("workspace"); 
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const controls = document.getElementById("controls");

// Buttons
const cameraBtn = document.getElementById("cameraBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");
const leaveBtn = document.getElementById("leaveBtn");
const muteAllBtn = document.getElementById("muteAllBtn");
const unmuteAllBtn = document.getElementById("unmuteAllBtn");
const localMusicMuteBtn = document.getElementById("localMusicMuteBtn"); 
const toggleWbBtn = document.getElementById("toggleWbBtn"); 

const videoArea = document.getElementById("video-area");
const sendMsgBtn = document.getElementById("sendMsg");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const uploadBtn = document.getElementById("uploadBtn");
const fileUpload = document.getElementById("fileUpload");
const fileList = document.getElementById("fileList");

// Host Audio & Remote Player
const hostAudioContainer = document.getElementById("hostAudioContainer");
const hostAudioPlayer = document.getElementById("hostAudioPlayer");
const remoteMusicPlayer = document.getElementById("remoteMusicPlayer");

// Whiteboard Elements
const whiteboardBox = document.getElementById("whiteboard-box");
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const wbToolbar = document.getElementById('wb-toolbar');
const wbStatus = document.getElementById('wb-status');
const wbColor = document.getElementById('wb-color');
const wbSize = document.getElementById('wb-size');
const wbEraser = document.getElementById('wb-eraser');
const wbClear = document.getElementById('wb-clear');
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
  enlargeBtn.onclick = () => {
    targetWrapper.classList.remove("video-wrapper-small");
    targetWrapper.classList.toggle("video-wrapper-large");
  };

  const shrinkBtn = document.createElement("button");
  shrinkBtn.className = "icon-btn";
  shrinkBtn.innerHTML = "➖";
  shrinkBtn.onclick = () => {
    targetWrapper.classList.remove("video-wrapper-large");
    targetWrapper.classList.toggle("video-wrapper-small");
  };

  const maxBtn = document.createElement("button");
  maxBtn.className = "icon-btn";
  maxBtn.innerHTML = "🖥️";
  maxBtn.onclick = () => {
    if (!document.fullscreenElement) {
      elementToFullscreen.requestFullscreen().catch(err => {
        showNotification("Fullscreen error", "danger");
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

addSizeControls(whiteboardBox, document.getElementById('whiteboard-container'));

// ---------- WHITEBOARD LOGIC ----------
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);

wbColor.addEventListener("input", (e) => {
  isEraser = false;
  currentBrushColor = e.target.value;
});

wbSize.addEventListener("input", (e) => {
  currentBrushSize = e.target.value;
});

wbEraser.addEventListener("click", () => {
  isEraser = true; 
});

wbClear.addEventListener("click", () => {
  if (!canDraw) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit("clear-whiteboard", { room: currentRoom });
});

socket.on("clear-whiteboard", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function draw(x0, y0, x1, y1, color, size, eraserFlag, emit = false) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  
  ctx.strokeStyle = eraserFlag ? "#ffffff" : color;
  ctx.lineWidth = eraserFlag ? 30 : size; 
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.closePath();

  if (!emit) return;
  
  socket.emit('drawing', { 
    x0, y0, x1, y1, color, size, isEraser: eraserFlag, room: currentRoom 
  });
}

let lastX = 0; 
let lastY = 0;

canvas.addEventListener('mousedown', (e) => { 
  if (canDraw) {
    drawing = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
  }
});

canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseout', () => drawing = false);
canvas.addEventListener('mousemove', (e) => {
  if (!drawing || !canDraw) return;
  draw(lastX, lastY, e.offsetX, e.offsetY, currentBrushColor, currentBrushSize, isEraser, true);
  lastX = e.offsetX;
  lastY = e.offsetY;
});

socket.on('drawing', (data) => {
  draw(data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.isEraser, false);
});

// ---------- VIDEO UI HELPERS ----------
function createLocalCard(name) {
  let el = document.getElementById("local-player");
  if (el) return el;
  
  const localContainer = document.createElement("div");
  localContainer.className = "video-card"; 
  localContainer.id = "local-player";
  
  localContainer.style.width = "100%"; 
  localContainer.style.height = "200px"; 
  localContainer.style.position = "relative";
  
  const label = document.createElement("div");
  label.style.position = "absolute"; 
  label.style.top = "6px"; 
  label.style.left = "6px";
  label.style.padding = "4px 8px"; 
  label.style.background = "rgba(0,0,0,0.5)";
  label.style.color = "#fff"; 
  label.style.borderRadius = "6px"; 
  label.style.fontSize = "13px";
  label.style.zIndex = "10"; 
  label.textContent = `${name} (You)`;
  
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
  wrapper.style.display = "flex"; 
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "center"; 
  wrapper.style.gap = "6px"; 
  wrapper.style.width = "100%"; 

  const card = document.createElement("div");
  card.className = "video-card"; 
  card.id = `remote-${uid}`;
  card.style.width = "100%"; 
  card.style.height = "200px"; 
  card.style.position = "relative";

  const labelDiv = document.createElement("div");
  labelDiv.style.position = "absolute"; 
  labelDiv.style.top = "6px"; 
  labelDiv.style.left = "6px";
  labelDiv.style.padding = "4px 8px"; 
  labelDiv.style.background = "rgba(0,0,0,0.5)";
  labelDiv.style.color = "#fff"; 
  labelDiv.style.borderRadius = "6px";
  labelDiv.style.fontSize = "13px"; 
  labelDiv.style.zIndex = "10";
  labelDiv.textContent = labelText || `User ${uid}`;
  card.appendChild(labelDiv);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.display = "flex"; 
  controlsDiv.style.gap = "5px";
  controlsDiv.style.justifyContent = "center"; 
  controlsDiv.style.width = "100%";

  const muteRemoteBtn = document.createElement("button");
  muteRemoteBtn.className = "small-btn host-only-btn"; 
  muteRemoteBtn.style.display = isHost ? "inline-block" : "none";
  muteRemoteBtn.textContent = "🎙️❌"; 
  muteRemoteBtn.title = "Mute User";
  muteRemoteBtn.onclick = () => {
    socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "mute-audio" });
  };

  const camOffBtn = document.createElement("button");
  camOffBtn.className = "small-btn host-only-btn"; 
  camOffBtn.style.display = isHost ? "inline-block" : "none";
  camOffBtn.textContent = "📹❌"; 
  camOffBtn.title = "Disable Camera";
  camOffBtn.onclick = () => {
    socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "disable-video" });
  };

  const wbBtn = document.createElement("button");
  wbBtn.className = "small-btn host-only-btn";
  wbBtn.style.display = isHost ? "inline-block" : "none";
  wbBtn.textContent = "🖍️ WB";
  wbBtn.title = "Give Whiteboard Access";
  wbBtn.dataset.access = "false";
  wbBtn.style.background = "var(--primary)";
  wbBtn.onclick = () => {
    const isGranting = wbBtn.dataset.access === "false";
    socket.emit("wb-control", { 
      room: currentRoom, 
      targetUid: uid.toString(), 
      action: isGranting ? "grant" : "revoke" 
    });
    
    wbBtn.dataset.access = isGranting ? "true" : "false";
    wbBtn.textContent = isGranting ? "🚫🖍️ WB" : "🖍️ WB";
    wbBtn.style.background = isGranting ? "var(--danger)" : "var(--primary)";
  };

  controlsDiv.appendChild(muteRemoteBtn); 
  controlsDiv.appendChild(camOffBtn);
  controlsDiv.appendChild(wbBtn); 

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
  card.id = cardId; 
  card.className = "video-card screen-share-card";
  card.style.width = "100%"; 
  card.style.height = "320px";
  card.style.position = "relative"; 
  card.style.border = "3px solid var(--accent)";

  const label = document.createElement("div");
  label.style.position = "absolute"; 
  label.style.top = "6px"; 
  label.style.left = "6px";
  label.style.padding = "4px 8px"; 
  label.style.background = "rgba(0,0,0,0.6)";
  label.style.color = "#fff"; 
  label.style.borderRadius = "6px"; 
  label.style.fontSize = "13px";
  label.style.zIndex = "10"; 
  label.textContent = `User ${uid}'s Presentation`;
  
  card.appendChild(label);
  addSizeControls(card, card);
  videoArea.appendChild(card);
  
  return card;
}

// ---------- JOIN LOGIC ----------
joinBtn.addEventListener("click", async () => {
  if (joined) return;
  
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
      await client.publish([microphoneTrack, cameraTrack]);
    } catch (mediaErr) {
      showNotification("Camera/Mic busy. Joined as viewer.", "info");
    }

    joined = true;
    currentRoom = roomId;
    
    joinSection.classList.add("form-out");
    
    setTimeout(() => {
      joinSection.style.display = "none";
      workspace.classList.remove("hidden");
      workspace.classList.add("workspace-active"); 
      
      setTimeout(() => {
        resizeCanvas(); 
        const localContainer = createLocalCard(userName);
        if (localTracks.videoTrack) {
          localTracks.videoTrack.play(localContainer, { fit: "cover" });
        }
      }, 300);
      
    }, 500); 

    socket.emit("join-room", { room: roomId, uid: localUid, name: userName });
    showNotification(`You joined room ${roomId}`, "join");
    appendMessage(`System: You joined room ${roomId}`);
    
  } catch (err) {
    showNotification("Join failed!", "danger");
  }
});

// ---------- SOCKET RECEIVERS ----------
socket.on("room-history", (data) => {
  if (data.chats) {
    data.chats.forEach(chat => {
      if(chat.name === "System" && chat.text.includes("left")) return;
      appendMessage(`${chat.name}: ${chat.text}`);
    });
  }
  if (data.files) {
    [...data.files].reverse().forEach(file => {
      addFileLink(file.filename, file.url);
    });
  }
  
  if (data.wbVisible) {
    whiteboardBox.style.display = "block";
    setTimeout(resizeCanvas, 100);
    if(isHost) toggleWbBtn.dataset.show = "true";
  }
});

socket.on("host-assignment", (data) => {
  isHost = data.isHost;
  
  if (isHost) {
    hostAudioContainer.style.display = "block";
    canDraw = true;
    wbToolbar.style.display = "flex";
    canvas.style.cursor = "crosshair";
    wbStatus.textContent = "(Host Mode - You have control)";
    
    toggleWbBtn.style.display = "inline-block";
    
    document.querySelectorAll('.host-only-btn').forEach(btn => {
      btn.style.display = "inline-block";
    });
  } else {
    hostAudioContainer.style.display = "none";
    canDraw = false;
    wbToolbar.style.display = "none";
    canvas.style.cursor = "not-allowed";
    wbStatus.textContent = "(View Only - Ask host for access)";
    toggleWbBtn.style.display = "none";
  }
});

socket.on("room-update", (data) => {
  if (isHost && data.size > 1) {
    muteAllBtn.style.display = "inline-block"; 
    unmuteAllBtn.style.display = "inline-block";
  } else if (isHost) {
    muteAllBtn.style.display = "none"; 
    unmuteAllBtn.style.display = "none";
  }
});

// ---------- LOCAL CONTROLS ----------
localMusicMuteBtn.addEventListener("click", () => {
  const isMuted = remoteMusicPlayer.muted;
  remoteMusicPlayer.muted = !isMuted;
  
  if (remoteMusicPlayer.muted) {
    localMusicMuteBtn.textContent = "🎵🔊"; 
    localMusicMuteBtn.title = "Unmute Music";
    localMusicMuteBtn.style.background = "#7f8c8d";
  } else {
    localMusicMuteBtn.textContent = "🎵🔇"; 
    localMusicMuteBtn.title = "Mute Music";
    localMusicMuteBtn.style.background = "#9b59b6";
  }
});

toggleWbBtn.addEventListener("click", () => {
  const isShowing = toggleWbBtn.dataset.show === "true";
  const willShow = !isShowing;
  
  socket.emit("wb-toggle", { room: currentRoom, show: willShow });
  
  toggleWbBtn.dataset.show = willShow ? "true" : "false";
  toggleWbBtn.style.background = willShow ? "linear-gradient(135deg, #e74c3c, #c0392b)" : "linear-gradient(135deg, #3498db, #2980b9)";
});

socket.on("wb-toggle", (data) => {
  if (data.show) {
    whiteboardBox.style.display = "block";
    setTimeout(resizeCanvas, 100);
  } else {
    whiteboardBox.style.display = "none";
  }
});

// ---------- MUSIC PLAYER (Host Only) ----------
document.getElementById("hostAudioFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  showNotification("Uploading music to server...", "info");
  const fd = new FormData();
  fd.append("file", file); 
  fd.append("room", currentRoom || ""); 
  fd.append("uploader", "Host-Music");
  
  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    currentMusicUrl = (await res.json()).url; 
    hostAudioPlayer.src = currentMusicUrl;
    showNotification("Music ready to play 🎵", "join");
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
});

hostAudioPlayer.addEventListener("seeked", () => {
  if (!joined || !isHost || !currentMusicUrl) return;
  socket.emit("control", { room: currentRoom, action: "music-seek", time: hostAudioPlayer.currentTime });
});

// ---------- REMOTE VIDEO SUBSCRIPTIONS ----------
client.on("user-published", async (user, mediaType) => {
  try {
    await client.subscribe(user, mediaType);
    const uid = user.uid.toString();
    remoteUsers[uid] = user;

    if (mediaType === "video") {
      if (user.videoTrack.getTrackId().includes("screen") || uid.includes("screen")) {
        user.videoTrack.play(createScreenShareCard(uid));
      } else {
        createRemoteWrapper(uid, `User ${uid}`);
        user.videoTrack.play(document.getElementById(`remote-${uid}`));
      }
    }
    
    if (mediaType === "audio" && user.audioTrack) {
      user.audioTrack.play();
    }
  } catch (e) { 
    console.error(e); 
  }
});

client.on("user-unpublished", (user, mediaType) => {
  if (mediaType === "video") {
    const sc = document.getElementById(`screen-card-${user.uid}`);
    if (sc) sc.remove();
  }
});

client.on("user-left", (user) => removeRemoteUser(user.uid.toString()));
socket.on("user-left", info => { if (info && info.uid) removeRemoteUser(info.uid.toString(), info.name); });

function removeRemoteUser(uid, name = null) {
  const w = document.getElementById(`remote-wrapper-${uid}`);
  const s = document.getElementById(`screen-card-${uid}`);
  
  if (w) { w.classList.add("fly-out-3d"); setTimeout(() => w.remove(), 700); }
  if (s) { s.classList.add("fly-out-3d"); setTimeout(() => s.remove(), 700); }
  
  if (name) showNotification(`${name} left`, "danger");
  delete remoteUsers[uid];
}

// ---------- LOCAL & GLOBAL CONTROLS ----------
leaveBtn.addEventListener("click", async () => {
  socket.emit("leave-room");
  if (localTracks.audioTrack) localTracks.audioTrack.close();
  if (localTracks.videoTrack) localTracks.videoTrack.close();
  if (screenTrack) screenTrack.close();
  await client.leave();
  setTimeout(() => window.location.reload(), 100);
});

muteAllBtn.addEventListener("click", () => { 
  if (joined && isHost) socket.emit("control", { room: currentRoom, action: "mute-all" }); 
});

unmuteAllBtn.addEventListener("click", () => { 
  if (joined && isHost) socket.emit("control", { room: currentRoom, action: "unmute-all" }); 
});

cameraBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.videoTrack) return;
  const en = localTracks.videoTrack.enabled;
  await localTracks.videoTrack.setEnabled(!en);
  
  cameraBtn.textContent = en ? "📹" : "🚫📹";
  cameraBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
  
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "disable-video" : "enable-video" });
});

muteBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.audioTrack) return;
  const en = localTracks.audioTrack.enabled;
  await localTracks.audioTrack.setEnabled(!en);
  
  muteBtn.textContent = en ? "🎙️" : "🔇";
  muteBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
  
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "mute-audio" : "enable-audio" });
});

// NAYA SCREEN SHARE BUTTON LOGIC
shareBtn.addEventListener("click", async () => {
  if (!joined) return;
  
  if (screenTrack) {
    await client.unpublish(screenTrack); 
    screenTrack.close(); 
    screenTrack = null;
    
    document.getElementById("screen-share-container")?.remove();
    
    if (localTracks.videoTrack) {
      await client.publish(localTracks.videoTrack);
      localTracks.videoTrack.play(document.getElementById("local-player"));
    }
    // Wapas purana Screen Share icon
    shareBtn.textContent = "🖥️ ↗️";
    return;
  }
  
  if (localTracks.videoTrack) await client.unpublish(localTracks.videoTrack);
  
  screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto");
  
  // Stop Share Icon
  shareBtn.textContent = "🛑 🖥️";
  
  const sc = document.createElement("div");
  sc.className = "video-card screen-share-card"; 
  sc.id = "screen-share-container";
  sc.style.gridColumn = "1 / -1"; 
  sc.style.height = "320px"; 
  sc.style.border = "2px solid var(--accent)";
  
  addSizeControls(sc, sc);
  videoArea.appendChild(sc);
  screenTrack.play(sc);
  
  await client.publish(screenTrack);
  
  screenTrack.on("track-ended", () => shareBtn.click());
});

// ---------- INCOMING SOCKET LISTENER ----------
socket.on("wb-control", (data) => {
  if (data.targetUid === localUid) {
    if (data.action === "grant") {
      canDraw = true;
      wbToolbar.style.display = "flex";
      canvas.style.cursor = "crosshair";
      wbStatus.textContent = "(You have access)";
      showNotification("Host gave you Whiteboard access! 🎨", "join");
    } else if (data.action === "revoke") {
      canDraw = false;
      wbToolbar.style.display = "none";
      canvas.style.cursor = "not-allowed";
      wbStatus.textContent = "(View Only - Access Revoked)";
      showNotification("Your whiteboard access was revoked.", "danger");
    }
  }
});

socket.on("control", async (data) => {
  if (!joined || !data) return;

  if (data.action === "music-play" && !isHost) {
    localMusicMuteBtn.style.display = "inline-block";
    
    const url = window.location.origin + data.url;
    if (remoteMusicPlayer.src !== url) remoteMusicPlayer.src = url;
    remoteMusicPlayer.currentTime = data.time || 0;
    
    remoteMusicPlayer.play().catch(() => {
      showNotification("🎵 Click anywhere on screen to allow music!", "danger");
      document.body.addEventListener('click', () => {
        remoteMusicPlayer.play().catch(e => console.error(e));
      }, { once: true });
    });
  }
  
  if (data.action === "music-pause" && !isHost) remoteMusicPlayer.pause();
  if (data.action === "music-seek" && !isHost) remoteMusicPlayer.currentTime = data.time || 0;

  if (data.action === "mute-all" && localTracks.audioTrack) { 
    await localTracks.audioTrack.setEnabled(false); 
    muteBtn.textContent = "🔇"; 
    muteBtn.style.background = "rgba(231, 76, 60, 0.7)";
  }
  
  if (data.action === "unmute-all" && localTracks.audioTrack) { 
    await localTracks.audioTrack.setEnabled(true); 
    muteBtn.textContent = "🎙️"; 
    muteBtn.style.background = "";
  }
  
  if (data.targetUid === localUid) {
    if (data.action === "mute-audio" && localTracks.audioTrack) { 
      await localTracks.audioTrack.setEnabled(false); 
      muteBtn.textContent = "🔇"; 
      muteBtn.style.background = "rgba(231, 76, 60, 0.7)";
      showNotification("Host muted you", "danger"); 
    }
    if (data.action === "disable-video" && localTracks.videoTrack) { 
      await localTracks.videoTrack.setEnabled(false); 
      cameraBtn.textContent = "🚫📹"; 
      cameraBtn.style.background = "rgba(231, 76, 60, 0.7)";
    }
    if (data.action === "enable-audio" && localTracks.audioTrack) { 
      await localTracks.audioTrack.setEnabled(true); 
      muteBtn.textContent = "🎙️"; 
      muteBtn.style.background = "";
    }
    if (data.action === "enable-video" && localTracks.videoTrack) { 
      await localTracks.videoTrack.setEnabled(true); 
      cameraBtn.textContent = "📹"; 
      cameraBtn.style.background = "";
    }
  }
});

// ---------- CHAT & FILES ----------
sendMsgBtn.addEventListener("click", () => {
  const text = chatInput.value.trim(); 
  if (!text) return;
  socket.emit("chat-message", { room: currentRoom, name: usernameInput.value || "Me", text });
  appendMessage(`Me: ${text}`); 
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => { 
  if (e.key === "Enter") { 
    e.preventDefault(); 
    sendMsgBtn.click(); 
  }
});

socket.on("chat-message", data => {
  if(data.name === "System" && data.text.includes("left")) return;
  if(data.name === "System" && data.text.includes("music")) {
    showNotification(data.text, "join");
  }
  appendMessage(`${data.name}: ${data.text}`);
});

document.getElementById("uploadBtn").addEventListener("click", async () => {
  const f = fileUpload.files[0]; 
  if (!f) return;
  
  const fd = new FormData(); 
  fd.append("file", f); 
  fd.append("room", currentRoom); 
  fd.append("uploader", usernameInput.value || "User");
  
  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    const json = await res.json();
    addFileLink(json.filename, json.url);
  } catch (err) { 
    showNotification("Upload failed", "danger"); 
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

socket.on("file-uploaded", data => { 
  addFileLink(data.filename, data.url); 
  showNotification(`${data.uploader} uploaded a file`, "info"); 
});

socket.on("user-joined", info => {
  showNotification(`${info.name || "User"} joined the room!`, "join");
});