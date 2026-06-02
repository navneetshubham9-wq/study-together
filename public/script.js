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
let isSharing = false; 
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
const videoArea = document.getElementById("video-area");

// Buttons
const cameraBtn = document.getElementById("cameraBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");
const leaveBtn = document.getElementById("leaveBtn");
const muteAllBtn = document.getElementById("muteAllBtn");
const unmuteAllBtn = document.getElementById("unmuteAllBtn");
const localMusicMuteBtn = document.getElementById("localMusicMuteBtn"); 
const toggleWbBtn = document.getElementById("toggleWbBtn"); 
const toggleMapBtn = document.getElementById("toggleMapBtn"); 
const togglePresBtn = document.getElementById("togglePresBtn"); // NAYA
const openMathBtn = document.getElementById("openMathBtn"); // NAYA

// Chat & Files
const sendMsgBtn = document.getElementById("sendMsg");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const uploadBtn = document.getElementById("uploadBtn");
const fileUpload = document.getElementById("fileUpload");
const fileList = document.getElementById("fileList");

// Presentation & Math DOM
const mathModal = document.getElementById("math-modal");
const mathInput = document.getElementById("mathInput");
const broadcastMathBtn = document.getElementById("broadcastMathBtn");
const closeMathBtn = document.getElementById("closeMathBtn");
const mathDisplay = document.getElementById("mathDisplay");

const presentationBox = document.getElementById("presentation-box");
const presInputForm = document.getElementById("pres-input-form");
const generateGraphBtn = document.getElementById("generateGraphBtn");
const presTitle = document.getElementById("pres-title");
const presentationContainer = document.getElementById("presentation-container");
const laserPointer = document.getElementById("laser-pointer");

// Host Audio & Remote Player
const hostAudioContainer = document.getElementById("hostAudioContainer");
const hostAudioPlayer = document.getElementById("hostAudioPlayer");
const remoteMusicPlayer = document.getElementById("remoteMusicPlayer");

// Map Elements
const mapBox = document.getElementById("map-box");
const mapContainer = document.getElementById("map-container");
const toggleLabelsBtn = document.getElementById("toggleLabelsBtn");
const screenshotMapBtn = document.getElementById("screenshotMapBtn");
let geoMap; 
let labelsLayer; 
let labelsVisible = true; 

// Whiteboard Elements
const whiteboardBox = document.getElementById("whiteboard-box");
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const wbToolbar = document.getElementById('wb-toolbar');
const wbStatus = document.getElementById('wb-status');
let drawing = false;

// Presentation Chart Instance
let businessChart = null;

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

// ---------- SIZE CONTROLS ----------
function addSizeControls(targetWrapper, elementToFullscreen) {
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "local-controls";

  const enlargeBtn = document.createElement("button");
  enlargeBtn.className = "icon-btn"; enlargeBtn.innerHTML = "➕";
  enlargeBtn.onclick = () => {
    targetWrapper.classList.remove("video-wrapper-small");
    targetWrapper.classList.toggle("video-wrapper-large");
    if(geoMap) setTimeout(() => geoMap.invalidateSize(), 300); 
  };

  const shrinkBtn = document.createElement("button");
  shrinkBtn.className = "icon-btn"; shrinkBtn.innerHTML = "➖";
  shrinkBtn.onclick = () => {
    targetWrapper.classList.remove("video-wrapper-large");
    targetWrapper.classList.toggle("video-wrapper-small");
    if(geoMap) setTimeout(() => geoMap.invalidateSize(), 300);
  };

  const maxBtn = document.createElement("button");
  maxBtn.className = "icon-btn"; maxBtn.innerHTML = "🖥️";
  maxBtn.onclick = () => {
    if (!document.fullscreenElement) {
      elementToFullscreen.requestFullscreen().catch(err => showNotification("Fullscreen error", "danger"));
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
addSizeControls(mapBox, mapContainer); 
addSizeControls(presentationBox, presentationContainer); 

// ---------- NEW: MATHEMATICS LOGIC (KaTeX) ----------
openMathBtn.addEventListener("click", () => {
    mathModal.style.display = "block";
});

closeMathBtn.addEventListener("click", () => {
    mathModal.style.display = "none";
});

broadcastMathBtn.addEventListener("click", () => {
    const eq = mathInput.value.trim();
    if(!eq) return;
    
    // Validate locally first
    try {
        katex.renderToString(eq); 
        socket.emit("math-equation", { room: currentRoom, equation: eq, sender: usernameInput.value || "User" });
        mathInput.value = "";
    } catch(e) {
        showNotification("Invalid LaTeX Syntax!", "danger");
    }
});

socket.on("math-equation", (data) => {
    mathModal.style.display = "block";
    try {
        const html = katex.renderToString(data.equation, { throwOnError: false, displayMode: true });
        mathDisplay.innerHTML = `<div style="font-size:14px; color:var(--primary); margin-bottom:5px;">Shared by: ${data.sender}</div>${html}`;
        showNotification("New Math Equation Shared!", "info");
    } catch(e) {}
});


// ---------- NEW: PRESENTATION & GRAPH LOGIC (Chart.js) ----------
togglePresBtn.addEventListener("click", () => {
  const isShowing = togglePresBtn.dataset.show === "true";
  socket.emit("pres-toggle", { room: currentRoom, show: !isShowing });
  togglePresBtn.dataset.show = !isShowing ? "true" : "false";
  togglePresBtn.style.background = !isShowing ? "linear-gradient(135deg, #e74c3c, #c0392b)" : "linear-gradient(135deg, #f1c40f, #f39c12)";
});

socket.on("pres-toggle", (data) => {
  if (data.show) {
    presentationBox.style.display = "block";
  } else {
    presentationBox.style.display = "none";
  }
});

generateGraphBtn.addEventListener("click", () => {
    const industry = document.getElementById("presIndustry").value || "Business";
    const baseYear = parseInt(document.getElementById("presBaseYear").value) || new Date().getFullYear();
    const baseValue = parseFloat(document.getElementById("presBaseValue").value) || 1000;
    const growth = parseFloat(document.getElementById("presGrowth").value) || 10;
    const years = parseInt(document.getElementById("presForecast").value) || 5;

    let labels = [];
    let values = [];
    let currentValue = baseValue;

    for(let i = 0; i <= years; i++) {
        labels.push((baseYear + i).toString());
        values.push(Math.round(currentValue));
        currentValue += (currentValue * (growth / 100)); // Compounding growth
    }

    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${industry} Projected Growth (in USD/Local Cur.)`,
                data: values,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.2)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#e74c3c',
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { font: { size: 16 } } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 14 } } },
                x: { ticks: { font: { size: 14 } } }
            }
        }
    };

    // Emit to all users
    socket.emit("presentation-data", { room: currentRoom, chartConfig, industry });
});

socket.on("presentation-data", (data) => {
    presTitle.textContent = `${data.industry} Growth Projection`;
    
    const ctxChart = document.getElementById('presentationCanvas').getContext('2d');
    
    if(businessChart) {
        businessChart.destroy(); // Remove old chart
    }
    
    businessChart = new Chart(ctxChart, data.chartConfig);
});

// --- LASER POINTER LOGIC (Host Only controls mouse) ---
let laserTimeout;
presentationContainer.addEventListener("mousemove", (e) => {
    if(!isHost || presentationBox.style.display === "none") return;
    
    const rect = presentationContainer.getBoundingClientRect();
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;
    
    socket.emit("laser-pointer", { room: currentRoom, x: xPercent, y: yPercent });
});

presentationContainer.addEventListener("mouseleave", () => {
    if(!isHost) return;
    socket.emit("laser-pointer", { room: currentRoom, hide: true });
});

socket.on("laser-pointer", (data) => {
    if(data.hide) {
        laserPointer.style.display = "none";
        return;
    }
    
    laserPointer.style.display = "block";
    laserPointer.style.left = (data.x * 100) + "%";
    laserPointer.style.top = (data.y * 100) + "%";
    
    clearTimeout(laserTimeout);
    laserTimeout = setTimeout(() => {
        laserPointer.style.display = "none";
    }, 2000); // Hide if host stops moving mouse
});


// ---------- INITIALIZE LEAFLET WORLD MAP ----------
function initWorldMap() {
  geoMap = L.map('map-container', { center: [20.0, 0.0], zoom: 3, zoomControl: false });
  L.control.zoom({ position: 'bottomleft' }).addTo(geoMap);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri', crossOrigin: true
  }).addTo(geoMap);

  labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    pane: 'markerPane', crossOrigin: true
  }).addTo(geoMap);
}
initWorldMap();

if (toggleLabelsBtn) {
  toggleLabelsBtn.addEventListener("click", () => {
    labelsVisible = !labelsVisible;
    if (labelsVisible) { geoMap.addLayer(labelsLayer); toggleLabelsBtn.style.background = "var(--primary)"; } 
    else { geoMap.removeLayer(labelsLayer); toggleLabelsBtn.style.background = "var(--danger)"; }
  });
}

if (screenshotMapBtn) {
  screenshotMapBtn.addEventListener("click", () => {
    showNotification("📸 Capturing Map...", "info");
    if (window.html2canvas) {
      html2canvas(document.getElementById("map-container"), { useCORS: true, allowTaint: true }).then(canvas => {
        const link = document.createElement('a');
        link.download = `VYDEX_Map_${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click();
      }).catch(err => showNotification("❌ Screenshot Failed.", "danger"));
    }
  });
}

// ---------- WHITEBOARD LOGIC ----------
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', () => {
  resizeCanvas();
  if(geoMap && mapBox.style.display !== "none") geoMap.invalidateSize();
});

document.getElementById('wb-color').addEventListener("input", (e) => { isEraser = false; currentBrushColor = e.target.value; });
document.getElementById('wb-size').addEventListener("input", (e) => { currentBrushSize = e.target.value; });
document.getElementById('wb-eraser').addEventListener("click", () => { isEraser = true; });
document.getElementById('wb-clear').addEventListener("click", () => {
  if (!canDraw) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit("clear-whiteboard", { room: currentRoom });
});

socket.on("clear-whiteboard", () => ctx.clearRect(0, 0, canvas.width, canvas.height));

function draw(x0, y0, x1, y1, color, size, eraserFlag, emit = false) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.strokeStyle = eraserFlag ? "#ffffff" : color;
  ctx.lineWidth = eraserFlag ? 30 : size; 
  ctx.lineCap = 'round'; ctx.stroke(); ctx.closePath();
  if (emit) socket.emit('drawing', { x0, y0, x1, y1, color, size, isEraser: eraserFlag, room: currentRoom });
}

let lastX = 0; let lastY = 0;
canvas.addEventListener('mousedown', (e) => { if (canDraw) { drawing = true; lastX = e.offsetX; lastY = e.offsetY; } });
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseout', () => drawing = false);
canvas.addEventListener('mousemove', (e) => {
  if (!drawing || !canDraw) return;
  draw(lastX, lastY, e.offsetX, e.offsetY, currentBrushColor, currentBrushSize, isEraser, true);
  lastX = e.offsetX; lastY = e.offsetY;
});
socket.on('drawing', (data) => draw(data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.isEraser, false));

// ---------- VIDEO UI HELPERS ----------
function createLocalCard(name) {
  let el = document.getElementById("local-player");
  if (el) return el;
  const localContainer = document.createElement("div");
  localContainer.className = "video-card"; localContainer.id = "local-player";
  localContainer.style.width = "100%"; localContainer.style.height = "200px"; localContainer.style.position = "relative";
  
  const label = document.createElement("div");
  label.style.position = "absolute"; label.style.top = "6px"; label.style.left = "6px"; label.style.padding = "4px 8px"; label.style.background = "rgba(0,0,0,0.5)"; label.style.color = "#fff"; label.style.borderRadius = "6px"; label.style.fontSize = "13px"; label.style.zIndex = "10"; label.textContent = `${name} (You)`;
  
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
  wrapper.id = wrapperId; wrapper.style.display = "flex"; wrapper.style.flexDirection = "column"; wrapper.style.alignItems = "center"; wrapper.style.gap = "6px"; wrapper.style.width = "100%"; 

  const card = document.createElement("div");
  card.className = "video-card"; card.id = `remote-${uid}`; card.style.width = "100%"; card.style.height = "200px"; card.style.position = "relative";

  const labelDiv = document.createElement("div");
  labelDiv.style.position = "absolute"; labelDiv.style.top = "6px"; labelDiv.style.left = "6px"; labelDiv.style.padding = "4px 8px"; labelDiv.style.background = "rgba(0,0,0,0.5)"; labelDiv.style.color = "#fff"; labelDiv.style.borderRadius = "6px"; labelDiv.style.fontSize = "13px"; labelDiv.style.zIndex = "10"; labelDiv.textContent = labelText || `User ${uid}`;
  card.appendChild(labelDiv);

  const controlsDiv = document.createElement("div");
  controlsDiv.style.display = "flex"; controlsDiv.style.gap = "5px"; controlsDiv.style.justifyContent = "center"; controlsDiv.style.width = "100%";

  const muteRemoteBtn = document.createElement("button");
  muteRemoteBtn.className = "small-btn host-only-btn"; muteRemoteBtn.style.display = isHost ? "inline-block" : "none"; muteRemoteBtn.textContent = "🎙️❌"; muteRemoteBtn.title = "Mute User"; muteRemoteBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "mute-audio" });

  const camOffBtn = document.createElement("button");
  camOffBtn.className = "small-btn host-only-btn"; camOffBtn.style.display = isHost ? "inline-block" : "none"; camOffBtn.textContent = "📹❌"; camOffBtn.title = "Disable Camera"; camOffBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "disable-video" });

  const wbBtn = document.createElement("button");
  wbBtn.className = "small-btn host-only-btn"; wbBtn.style.display = isHost ? "inline-block" : "none"; wbBtn.textContent = "🖍️ WB"; wbBtn.dataset.access = "false"; wbBtn.style.background = "var(--primary)";
  wbBtn.onclick = () => {
    const isGranting = wbBtn.dataset.access === "false";
    socket.emit("wb-control", { room: currentRoom, targetUid: uid.toString(), action: isGranting ? "grant" : "revoke" });
    wbBtn.dataset.access = isGranting ? "true" : "false"; wbBtn.textContent = isGranting ? "🚫🖍️ WB" : "🖍️ WB"; wbBtn.style.background = isGranting ? "var(--danger)" : "var(--primary)";
  };

  controlsDiv.appendChild(muteRemoteBtn); controlsDiv.appendChild(camOffBtn); controlsDiv.appendChild(wbBtn); 
  wrapper.appendChild(card); wrapper.appendChild(controlsDiv); addSizeControls(wrapper, card); videoArea.appendChild(wrapper);
  return wrapper;
}

// ---------- JOIN LOGIC (100% FIXED) ----------
joinBtn.addEventListener("click", async () => {
  if (joined) return;
  
  try {
    remoteMusicPlayer.volume = 0; 
    let playPromise = remoteMusicPlayer.play();
    if (playPromise !== undefined) {
      playPromise.then(() => { remoteMusicPlayer.pause(); remoteMusicPlayer.volume = 1; }).catch(e => console.log("Audio unlock pending..."));
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
        if(geoMap) geoMap.invalidateSize(); 
        const localContainer = createLocalCard(userName);
        if (localTracks.videoTrack) localTracks.videoTrack.play(localContainer, { fit: "cover" });
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
  if (data.chats) data.chats.forEach(chat => { if(chat.name === "System" && chat.text.includes("left")) return; appendMessage(`${chat.name}: ${chat.text}`); });
  if (data.files) [...data.files].reverse().forEach(file => addFileLink(file.filename, file.url));
  
  if (data.wbVisible) { whiteboardBox.style.display = "block"; setTimeout(resizeCanvas, 100); if(isHost) toggleWbBtn.dataset.show = "true"; }
  if (data.mapVisible) { mapBox.style.display = "block"; setTimeout(() => geoMap.invalidateSize(), 100); if(isHost) toggleMapBtn.dataset.show = "true"; }
  
  // NAYA: Restore Presentation state
  if (data.presVisible) {
      presentationBox.style.display = "block";
      if(isHost) togglePresBtn.dataset.show = "true";
  }
  if (data.chartData) {
      presTitle.textContent = "Current Growth Projection";
      const ctxChart = document.getElementById('presentationCanvas').getContext('2d');
      if(businessChart) businessChart.destroy();
      businessChart = new Chart(ctxChart, data.chartData);
  }
});

socket.on("host-assignment", (data) => {
  isHost = data.isHost;
  if (isHost) {
    hostAudioContainer.style.display = "block";
    canDraw = true;
    document.getElementById('wb-toolbar').style.display = "flex";
    canvas.style.cursor = "crosshair";
    wbStatus.textContent = "(Host Mode)";
    
    presInputForm.style.display = "flex"; // Show form to host
    toggleWbBtn.style.display = "inline-block";
    toggleMapBtn.style.display = "inline-block"; 
    togglePresBtn.style.display = "inline-block"; // Show presentation button
    
    document.querySelectorAll('.host-only-btn').forEach(btn => btn.style.display = "inline-block");
  } else {
    hostAudioContainer.style.display = "none";
    canDraw = false;
    document.getElementById('wb-toolbar').style.display = "none";
    canvas.style.cursor = "not-allowed";
    wbStatus.textContent = "(View Only)";
    presInputForm.style.display = "none";
    toggleWbBtn.style.display = "none";
    toggleMapBtn.style.display = "none";
    togglePresBtn.style.display = "none";
  }
});

socket.on("room-update", (data) => {
  if (isHost && data.size > 1) { muteAllBtn.style.display = "inline-block"; unmuteAllBtn.style.display = "inline-block"; } 
  else if (isHost) { muteAllBtn.style.display = "none"; unmuteAllBtn.style.display = "none"; }
});

// ---------- MAP TOGGLE ----------
toggleMapBtn.addEventListener("click", () => {
  const isShowing = toggleMapBtn.dataset.show === "true";
  socket.emit("map-toggle", { room: currentRoom, show: !isShowing });
  toggleMapBtn.dataset.show = !isShowing ? "true" : "false";
  toggleMapBtn.style.background = !isShowing ? "linear-gradient(135deg, #e74c3c, #c0392b)" : "linear-gradient(135deg, #27ae60, #2ecc71)";
});
socket.on("map-toggle", (data) => {
  if (data.show) { mapBox.style.display = "block"; setTimeout(() => { if(geoMap) geoMap.invalidateSize(); }, 100); } 
  else mapBox.style.display = "none";
});

toggleWbBtn.addEventListener("click", () => {
  const isShowing = toggleWbBtn.dataset.show === "true";
  socket.emit("wb-toggle", { room: currentRoom, show: !isShowing });
  toggleWbBtn.dataset.show = !isShowing ? "true" : "false";
  toggleWbBtn.style.background = !isShowing ? "linear-gradient(135deg, #e74c3c, #c0392b)" : "linear-gradient(135deg, #3498db, #2980b9)";
});
socket.on("wb-toggle", (data) => {
  if (data.show) { whiteboardBox.style.display = "block"; setTimeout(resizeCanvas, 100); } 
  else whiteboardBox.style.display = "none";
});

// MUSIC
document.getElementById("hostAudioFile").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const fd = new FormData(); fd.append("file", file); fd.append("room", currentRoom || ""); fd.append("uploader", "Host-Music");
  try { currentMusicUrl = (await (await fetch("/upload", { method: "POST", body: fd })).json()).url; hostAudioPlayer.src = currentMusicUrl; showNotification("Music ready", "join"); } catch (err) {}
});
hostAudioPlayer.addEventListener("play", () => { if (!joined || !isHost || !currentMusicUrl) return; socket.emit("control", { room: currentRoom, action: "music-play", url: currentMusicUrl, time: hostAudioPlayer.currentTime }); });
hostAudioPlayer.addEventListener("pause", () => { if (!joined || !isHost) return; socket.emit("control", { room: currentRoom, action: "music-pause" }); });
hostAudioPlayer.addEventListener("seeked", () => { if (!joined || !isHost || !currentMusicUrl) return; socket.emit("control", { room: currentRoom, action: "music-seek", time: hostAudioPlayer.currentTime }); });

localMusicMuteBtn.addEventListener("click", () => {
  remoteMusicPlayer.muted = !remoteMusicPlayer.muted;
  localMusicMuteBtn.textContent = remoteMusicPlayer.muted ? "🎵🔊" : "🎵🔇"; 
  localMusicMuteBtn.style.background = remoteMusicPlayer.muted ? "#7f8c8d" : "#9b59b6";
});

// REMOTE SUBSCRIPTIONS
client.on("user-published", async (user, mediaType) => {
  try {
    await client.subscribe(user, mediaType);
    const uid = user.uid.toString();
    remoteUsers[uid] = user;
    if (mediaType === "video") {
      if (user.videoTrack.getTrackId().includes("screen") || uid.includes("screen")) {
        const sc = document.createElement("div"); sc.className = "video-card screen-share-card"; sc.id = `screen-card-${uid}`;
        sc.style.width = "100%"; sc.style.height = "320px"; sc.style.gridColumn = "1 / -1"; sc.style.border = "3px solid var(--accent)";
        addSizeControls(sc, sc); videoArea.appendChild(sc); user.videoTrack.play(sc);
      } else {
        createRemoteWrapper(uid, `User ${uid}`); user.videoTrack.play(document.getElementById(`remote-${uid}`));
      }
    }
    if (mediaType === "audio" && user.audioTrack) user.audioTrack.play();
  } catch (e) { console.error(e); }
});

client.on("user-unpublished", (user, mediaType) => { if (mediaType === "video") document.getElementById(`screen-card-${user.uid}`)?.remove(); });
client.on("user-left", (user) => removeRemoteUser(user.uid.toString()));
socket.on("user-left", info => { if (info && info.uid) removeRemoteUser(info.uid.toString(), info.name); });
function removeRemoteUser(uid, name = null) {
  document.getElementById(`remote-wrapper-${uid}`)?.remove();
  document.getElementById(`screen-card-${uid}`)?.remove();
  delete remoteUsers[uid];
}

// LOCAL & GLOBAL CONTROLS
leaveBtn.addEventListener("click", async () => { socket.emit("leave-room"); await client.leave(); window.location.reload(); });
muteAllBtn.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "mute-all" }); });
unmuteAllBtn.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "unmute-all" }); });

cameraBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.videoTrack) return;
  const en = localTracks.videoTrack.enabled; await localTracks.videoTrack.setEnabled(!en);
  cameraBtn.textContent = en ? "📹" : "🚫📹"; cameraBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "disable-video" : "enable-video" });
});

muteBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.audioTrack) return;
  const en = localTracks.audioTrack.enabled; await localTracks.audioTrack.setEnabled(!en);
  muteBtn.textContent = en ? "🎙️" : "🔇"; muteBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "mute-audio" : "enable-audio" });
});

shareBtn.addEventListener("click", async () => {
  if (!joined) return;
  if (isSharing) {
    isSharing = false;
    if (screenTrack) { await client.unpublish(screenTrack); screenTrack.close(); screenTrack = null; }
    socket.emit("control", { room: currentRoom, action: "share-stop", uid: localUid });
    const myContainer = document.getElementById("local-player");
    if(myContainer) { myContainer.style.height = "200px"; myContainer.parentElement.style.width = "100%"; myContainer.parentElement.classList.remove("video-wrapper-large"); }
    if (localTracks.videoTrack) { await client.publish(localTracks.videoTrack); localTracks.videoTrack.play(myContainer); }
    shareBtn.textContent = "Share Screen"; shareBtn.style.background = "";
    return;
  }
  if (localTracks.videoTrack) await client.unpublish(localTracks.videoTrack);
  try {
      screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto");
      isSharing = true; shareBtn.textContent = "Stop Share"; shareBtn.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
      const myContainer = document.getElementById("local-player");
      if(myContainer) { myContainer.style.height = "400px"; myContainer.parentElement.classList.add("video-wrapper-large"); screenTrack.play(myContainer); }
      await client.publish(screenTrack);
      socket.emit("control", { room: currentRoom, action: "share-start", uid: localUid });
      screenTrack.on("track-ended", () => { if (isSharing) shareBtn.click(); });
  } catch(e) { if (localTracks.videoTrack) { await client.publish(localTracks.videoTrack); localTracks.videoTrack.play(document.getElementById("local-player")); } }
});

socket.on("control", async (data) => {
  if (!joined || !data) return;
  if (data.action === "share-start") { const w = document.getElementById(`remote-wrapper-${data.uid}`); if (w) w.classList.add("video-wrapper-large"); }
  if (data.action === "share-stop") { const w = document.getElementById(`remote-wrapper-${data.uid}`); if (w) w.classList.remove("video-wrapper-large"); }
  if (data.action === "music-play" && !isHost) {
    localMusicMuteBtn.style.display = "inline-block"; remoteMusicPlayer.src = window.location.origin + data.url; remoteMusicPlayer.currentTime = data.time || 0;
    remoteMusicPlayer.play().catch(() => { showNotification("🎵 Click screen to allow music!", "danger"); document.body.addEventListener('click', () => remoteMusicPlayer.play().catch(e=>e), { once: true }); });
  }
  if (data.action === "music-pause" && !isHost) remoteMusicPlayer.pause();
  if (data.action === "music-seek" && !isHost) remoteMusicPlayer.currentTime = data.time || 0;
  if (data.action === "mute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); muteBtn.textContent = "🔇"; muteBtn.style.background = "rgba(231, 76, 60, 0.7)"; }
  if (data.action === "unmute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); muteBtn.textContent = "🎙️"; muteBtn.style.background = ""; }
  
  if (data.targetUid === localUid) {
    if (data.action === "mute-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); muteBtn.textContent = "🔇"; muteBtn.style.background = "rgba(231, 76, 60, 0.7)"; showNotification("Host muted you", "danger"); }
    if (data.action === "disable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(false); cameraBtn.textContent = "🚫📹"; cameraBtn.style.background = "rgba(231, 76, 60, 0.7)"; }
    if (data.action === "enable-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); muteBtn.textContent = "🎙️"; muteBtn.style.background = ""; }
    if (data.action === "enable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(true); cameraBtn.textContent = "📹"; cameraBtn.style.background = ""; }
  }
});

// CHAT & FILES
sendMsgBtn.addEventListener("click", () => { const text = chatInput.value.trim(); if (!text) return; socket.emit("chat-message", { room: currentRoom, name: usernameInput.value || "Me", text }); appendMessage(`Me: ${text}`); chatInput.value = ""; });
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMsgBtn.click(); } });
socket.on("chat-message", data => { if(data.name === "System" && data.text.includes("left")) return; appendMessage(`${data.name}: ${data.text}`); });
document.getElementById("uploadBtn").addEventListener("click", async () => {
  const f = fileUpload.files[0]; if (!f) return; const fd = new FormData(); fd.append("file", f); fd.append("room", currentRoom); fd.append("uploader", usernameInput.value || "User");
  try { addFileLink((await (await fetch("/upload", { method: "POST", body: fd })).json()).filename, (await (await fetch("/upload", { method: "POST", body: fd })).json()).url); } catch (err) { }
});
function addFileLink(name, url) { const a = document.createElement("a"); a.href = url; a.textContent = name; a.download = name; a.target = "_blank"; fileList.prepend(a); }
socket.on("file-uploaded", data => { addFileLink(data.filename, data.url); showNotification(`${data.uploader} uploaded a file`, "info"); });
socket.on("user-joined", info => showNotification(`${info.name || "User"} joined the room!`, "join"));