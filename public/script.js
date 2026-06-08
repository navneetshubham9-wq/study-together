const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const socket = io();

let localTracks = { audioTrack: null, videoTrack: null };
let localUid = null;
let joined = false;
let currentRoom = null;
let screenTrack = null;
let isHost = false; 
let isSharing = false; 
const remoteUsers = {}; 

let map = null;
let mapMarker = null;

// VYDEX Office Data Engine State
let officeRealtimeActive = false;
let officeData = {
  activeTab: "word",
  wordHtml: "",
  excelData: [["","","",""],["","","",""],["","","",""],["","","",""]],
  slides: [{ title: "Welcome Slide", content: "• Click content to edit.\n• Share in real-time." }],
  currentSlideIndex: 0
};

// DOM Query Selectors
const joinBtn = document.getElementById("joinBtn");
const joinSection = document.getElementById("join-section"); 
const workspace = document.getElementById("workspace"); 
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const videoArea = document.getElementById("video-area");
const cameraBtn = document.getElementById("cameraBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");
const leaveBtn = document.getElementById("leaveBtn");
const muteAllBtn = document.getElementById("muteAllBtn");
const unmuteAllBtn = document.getElementById("unmuteAllBtn");
const toggleWbBtn = document.getElementById("toggleWbBtn"); 
const toggleMapBtn = document.getElementById("toggleMapBtn"); 
const toggleOfficeBtn = document.getElementById("toggleOfficeBtn");
const openMenuBtn = document.getElementById("openMenuBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const sideMenu = document.getElementById("side-menu-container");

// UI Cards
const whiteboardSection = document.getElementById("whiteboard-section");
const mapSection = document.getElementById("map-section");
const officeSection = document.getElementById("office-section");

// Sync Controls
const hostWbSyncBtn = document.getElementById("host-wb-sync-btn");
const wbFullscreenBtn = document.getElementById("wb-fullscreen-btn");
const hostOfficeRealtimeBtn = document.getElementById("host-office-realtime-btn");
const hostOfficeFullscreenBtn = document.getElementById("host-office-fullscreen-btn");
const hostLockOverlay = document.getElementById("host-lock-overlay");
const lockedContentArea = document.getElementById("locked-content-area");
const hostCircleVideoContainer = document.getElementById("host-circle-video-container");

// Chat & Files Selectors
const tabChat = document.getElementById("tab-chat");
const tabFiles = document.getElementById("tab-files");
const chatBoxArea = document.getElementById("chat-box-area");
const fileBoxArea = document.getElementById("file-box-area");
const chatInput = document.getElementById("chatInput");
const sendMsgBtn = document.getElementById("sendMsgBtn");
const chatMessages = document.getElementById("chat-messages");
const fileUpload = document.getElementById("fileUpload");
const fileList = document.getElementById("fileList");

// Canvas Engine Setup
const canvas = document.getElementById("wb-canvas");
const ctx = canvas.getContext("2d");
let drawing = false;
let currentTool = "pencil";
let startX = 0, startY = 0;
let snapshot = null;

function fitCanvasToContainer() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = 550;
}

// Global Notification Engine
function showNotification(msg, type = "primary") {
  const container = document.getElementById("notification-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Side Navigation Panel Controller
openMenuBtn.addEventListener("click", () => { sideMenu.style.display = "block"; });
closeMenuBtn.addEventListener("click", () => { sideMenu.style.display = "none"; });
toggleWbBtn.addEventListener("click", () => { toggleSection(whiteboardSection); fitCanvasToContainer(); });
toggleMapBtn.addEventListener("click", () => { toggleSection(mapSection); if(map) map.invalidateSize(); });
toggleOfficeBtn.addEventListener("click", () => { toggleSection(officeSection); initExcel(); renderSlides(); });

function toggleSection(sec) {
  sec.style.display = (sec.style.display === "none") ? "block" : "none";
}

// Multi-User Initialization & Access Setup
joinBtn.addEventListener("click", async () => {
  const r = roomInput.value.trim();
  const u = usernameInput.value.trim();
  if (!r || !u) return alert("Please fill room and name forms completely.");
  currentRoom = r;
  
  socket.emit("join-room", { room: currentRoom, name: u }, (res) => {
    isHost = res.isHost;
    localUid = res.uid;
    if (isHost) {
      document.querySelectorAll(".host-ctrl").forEach(el => el.style.display = "inline-block");
      showNotification("Welcome Host! Room active.", "success");
    } else {
      showNotification(`Joined successfully as user.`, "primary");
    }
    initWorkspace();
  });
});

async function initWorkspace() {
  joinSection.style.display = "none";
  workspace.style.display = "grid";
  fitCanvasToContainer();
  initMapSystem();
  
  try {
    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
    
    const localPlayer = document.createElement("div");
    localPlayer.id = `video-user-${localUid}`;
    localPlayer.className = "video-container";
    localPlayer.innerHTML = `
      <div id="agora-local-player" class="video-player-div"></div>
      <div class="video-tag">Me (${usernameInput.value})</div>
      <div class="video-controls">
        <button onclick="toggleLocalFullscreen('video-user-${localUid}')">🔳</button>
      </div>
    `;
    videoArea.appendChild(localPlayer);
    localTracks.videoTrack.play("agora-local-player");
    
    await client.join(APP_ID, currentRoom, null, localUid);
    await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
  } catch (err) {
    showNotification("Media authorization error or missing devices.", "danger");
  }
}

// Media Track Listeners & Stream Ingestion Engine
client.on("user-published", async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  if (mediaType === "video") {
    remoteUsers[user.uid] = user;
    let remotePlayer = document.getElementById(`video-user-${user.uid}`);
    if (!remotePlayer) {
      remotePlayer = document.createElement("div");
      remotePlayer.id = `video-user-${user.uid}`;
      remotePlayer.className = "video-container";
      remotePlayer.innerHTML = `
        <div id="agora-remote-${user.uid}" class="video-player-div"></div>
        <div class="video-tag" id="tag-user-${user.uid}">User (${user.uid})</div>
        <div class="video-controls">
          <button id="pin-btn-${user.uid}" onclick="toggleLocalFullscreen('video-user-${user.uid}')">🔳</button>
        </div>
      `;
      videoArea.appendChild(remotePlayer);
    }
    user.videoTrack.play(`agora-remote-${user.uid}`);
    socket.emit("get-username", { room: currentRoom, uid: user.uid });
  }
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
});

client.on("user-unpublished", (user) => {
  delete remoteUsers[user.uid];
  const player = document.getElementById(`video-user-${user.uid}`);
  if (player) player.remove();
});

// Sync Host Lookup & Remote Profiles
socket.on("retrieved-username", data => {
  const tag = document.getElementById(`tag-user-${data.uid}`);
  if(tag) tag.innerText = data.name + (data.isHost ? " (Host)" : "");
});

// Requirement 1 Fix: Seamless Fullscreen Handler Without View Overflows
function toggleLocalFullscreen(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (el.classList.contains("custom-fullscreen-active")) {
    el.classList.remove("custom-fullscreen-active");
    showNotification("Exited absolute video view", "primary");
  } else {
    document.querySelectorAll(".video-container").forEach(c => c.classList.remove("custom-fullscreen-active"));
    el.classList.add("custom-fullscreen-active");
    showNotification("Entered 100% full viewport video rendering", "success");
  }
}

// Local Hardware Toggles
cameraBtn.addEventListener("click", async () => {
  if(localTracks.videoTrack.muted) {
    await localTracks.videoTrack.setMuted(false);
    cameraBtn.innerText = "📹 On";
    cameraBtn.style.background = "var(--primary)";
    // Update circle track if active
    if (officeRealtimeActive && isHost) syncHostCircleVideo(true);
  } else {
    await localTracks.videoTrack.setMuted(true);
    cameraBtn.innerText = "📹 Muted";
    cameraBtn.style.background = "var(--danger)";
    if (officeRealtimeActive && isHost) syncHostCircleVideo(false);
  }
});

muteBtn.addEventListener("click", async () => {
  if(localTracks.audioTrack.muted) {
    await localTracks.audioTrack.setMuted(false);
    muteBtn.innerText = "🎙️ Unmuted";
    muteBtn.style.background = "var(--primary)";
  } else {
    await localTracks.audioTrack.setMuted(true);
    muteBtn.innerText = "🎙️ Muted";
    muteBtn.style.background = "var(--danger)";
  }
});

// Host Global Command Interceptors
muteAllBtn.addEventListener("click", () => socket.emit("host-command", { room: currentRoom, action: "mute" }));
unmuteAllBtn.addEventListener("click", () => socket.emit("host-command", { room: currentRoom, action: "unmute" }));
socket.on("room-mute", async () => { if(!isHost && localTracks.audioTrack) { await localTracks.audioTrack.setMuted(true); muteBtn.innerText = "🎙️ Muted"; muteBtn.style.background = "var(--danger)"; showNotification("Host muted all users.", "danger"); } });
socket.on("room-unmute", async () => { if(!isHost && localTracks.audioTrack) { await localTracks.audioTrack.setMuted(false); muteBtn.innerText = "🎙️ Unmuted"; muteBtn.style.background = "var(--primary)"; showNotification("Host unmuted all users.", "success"); } });

// Interactive Whiteboard Canvas Handling Logic
document.querySelectorAll("#wb-toolbar button[id^='tool-']").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll("#wb-toolbar button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.id.replace("tool-", "");
  });
});

document.getElementById("tool-clear").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit("clear-whiteboard", { room: currentRoom });
});
socket.on("clear-whiteboard", () => { ctx.clearRect(0, 0, canvas.width, canvas.height); });

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", drawMove);
canvas.addEventListener("mouseup", stopDraw);

function startDraw(e) {
  drawing = true;
  startX = e.offsetX;
  startY = e.offsetY;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.strokeStyle = document.getElementById("wb-color").value;
  ctx.lineWidth = document.getElementById("wb-size").value;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function drawMove(e) {
  if(!drawing) return;
  const currentX = e.offsetX;
  const currentY = e.offsetY;
  const color = document.getElementById("wb-color").value;
  const size = document.getElementById("wb-size").value;

  if (currentTool === "pencil" || currentTool === "eraser") {
    ctx.strokeStyle = (currentTool === "eraser") ? "#ffffff" : color;
    ctx.lineWidth = size;
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
    socket.emit("drawing", { room: currentRoom, x: currentX, y: currentY, lastX: startX, lastY: startY, tool: currentTool, color: ctx.strokeStyle, size });
    startX = currentX;
    startY = currentY;
  } else {
    ctx.putImageData(snapshot, 0, 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    if(currentTool === "line") {
      ctx.moveTo(startX, startY);
      ctx.lineTo(currentX, currentY);
    } else if(currentTool === "rect") {
      ctx.rect(startX, startY, currentX - startX, currentY - startY);
    } else if(currentTool === "circle") {
      let r = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
      ctx.arc(startX, startY, r, 0, 2 * Math.PI);
    }
    ctx.stroke();
  }
}

function stopDraw(e) {
  if(!drawing) return;
  drawing = false;
  if(currentTool !== "pencil" && currentTool !== "eraser") {
    socket.emit("wb-shape", { room: currentRoom, tool: currentTool, startX, startY, endX: e.offsetX, endY: e.offsetY, color: ctx.strokeStyle, size: ctx.lineWidth });
  }
}

socket.on("drawing", data => {
  ctx.beginPath();
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.size;
  ctx.lineCap = "round";
  ctx.moveTo(data.lastX, data.lastY);
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
});

socket.on("wb-shape", data => {
  ctx.beginPath();
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.size;
  if(data.tool === "line") {
    ctx.moveTo(data.startX, data.startY);
    ctx.lineTo(data.endX, data.endY);
  } else if(data.tool === "rect") {
    ctx.rect(data.startX, data.startY, data.endX - data.startX, data.endY - data.startY);
  } else if(data.tool === "circle") {
    let r = Math.sqrt(Math.pow(data.endX - data.startX, 2) + Math.pow(data.endY - data.startY, 2));
    ctx.arc(data.startX, data.startY, r, 0, 2 * Math.PI);
  }
  ctx.stroke();
});

// Requirement 2 Implementation: Synchronous forced Whiteboard Fullscreen State Engine
let wbForcedFullscreen = false;

wbFullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    whiteboardSection.requestFullscreen().catch(err => alert("Fullscreen error"));
  } else {
    document.exitFullscreen();
  }
});

hostWbSyncBtn.addEventListener("click", () => {
  if(!isHost) return;
  wbForcedFullscreen = !wbForcedFullscreen;
  if(wbForcedFullscreen) {
    hostWbSyncBtn.innerText = "❌ Stop Forced Fullscreen";
    hostWbSyncBtn.style.background = "var(--danger)";
    socket.emit("wb-fullscreen-sync", { room: currentRoom, active: true });
    // Host also gets local layout preview update
    showNotification("Forced whiteboard fullscreen activated for all users.", "success");
  } else {
    hostWbSyncBtn.innerText = "👁️ Force Fullscreen";
    hostWbSyncBtn.style.background = "var(--primary)";
    socket.emit("wb-fullscreen-sync", { room: currentRoom, active: false });
    showNotification("Forced whiteboard fullscreen released.", "primary");
  }
});

socket.on("wb-fullscreen-sync", data => {
  if (isHost) return; // Host is exempt from force locks
  if (data.active) {
    showNotification("Host forced Whiteboard Fullscreen View.", "success");
    // Append whiteboard wrapper elements inside overlay
    lockedContentArea.innerHTML = "";
    const container = document.getElementById("wb-wrapper");
    lockedContentArea.appendChild(container);
    hostLockOverlay.style.display = "flex";
    
    // Requirement 5 Injection: Circular Host Picture-in-Picture logic
    syncHostCircleVideo(true);
    setTimeout(() => fitCanvasToContainer(), 200);
  } else {
    showNotification("Forced view released by Host.", "primary");
    const container = document.getElementById("wb-wrapper");
    document.getElementById("whiteboard-section").appendChild(container);
    hostLockOverlay.style.display = "none";
    hostCircleVideoContainer.style.display = "none";
    hostCircleVideoContainer.innerHTML = "";
    setTimeout(() => fitCanvasToContainer(), 200);
  }
});

function syncHostCircleVideo(shouldShow) {
  if (!shouldShow) {
    hostCircleVideoContainer.style.display = "none";
    hostCircleVideoContainer.innerHTML = "";
    return;
  }
  // Search for the host node element to target stream pipeline clone
  socket.emit("query-host-uid", { room: currentRoom }, (res) => {
    if (res && res.hostUid) {
      hostCircleVideoContainer.innerHTML = "";
      hostCircleVideoContainer.style.display = "block";
      if (res.hostUid === localUid) {
        if(localTracks.videoTrack && !localTracks.videoTrack.muted) {
          localTracks.videoTrack.play(hostCircleVideoContainer);
        }
      } else if (remoteUsers[res.hostUid] && remoteUsers[res.hostUid].videoTrack) {
        remoteUsers[res.hostUid].videoTrack.play(hostCircleVideoContainer);
      } else {
        hostCircleVideoContainer.innerHTML = "<div style='color:white;font-size:10px;text-align:center;margin-top:50px;'>Camera Off</div>";
      }
    }
  });
}

// Requirement 3: Floating, Draggable & Cross-Platform Converter Core Engine
const floatingConverter = document.getElementById("floating-converter");
const converterHeader = document.getElementById("converter-header");
const openConverterTrigger = document.getElementById("open-converter-trigger");
const closeConverterBtn = document.getElementById("close-converter-btn");

openConverterTrigger.addEventListener("click", () => {
  floatingConverter.style.display = "flex";
  populateConverterUnits();
});
closeConverterBtn.addEventListener("click", () => {
  floatingConverter.style.display = "none";
});

// Multi-Axis Drag Control Pipeline 
let isDraggingConverter = false;
let converterOffsetX = 0, converterOffsetY = 0;

converterHeader.addEventListener("mousedown", (e) => {
  isDraggingConverter = true;
  converterOffsetX = e.clientX - floatingConverter.offsetLeft;
  converterOffsetY = e.clientY - floatingConverter.offsetTop;
});

document.addEventListener("mousemove", (e) => {
  if (!isDraggingConverter) return;
  floatingConverter.style.left = (e.clientX - converterOffsetX) + "px";
  floatingConverter.style.top = (e.clientY - converterOffsetY) + "px";
  floatingConverter.style.bottom = "auto";
  floatingConverter.style.right = "auto";
});

document.addEventListener("mouseup", () => { isDraggingConverter = false; });

// Global Accelerator Hotkeys Injection Engine
document.addEventListener("keydown", (e) => {
  if (e.altKey && (e.key === "c" || e.key === "C" || e.key === "ç")) {
    e.preventDefault();
    if(floatingConverter.style.display === "flex") {
      floatingConverter.style.display = "none";
    } else {
      floatingConverter.style.display = "flex";
      populateConverterUnits();
    }
  }
});

const conversionData = {
  currency: { units: ["USD", "INR", "EUR", "GBP", "AED"], rates: { USD: 1, INR: 83.5, EUR: 0.92, GBP: 0.78, AED: 3.67 } },
  length: { units: ["Meter", "Kilometer", "Centimeter", "Mile", "Foot"], rates: { Meter: 1, Kilometer: 0.001, Centimeter: 100, Mile: 0.000621371, Foot: 3.28084 } },
  weight: { units: ["Kilogram", "Gram", "Pound", "Ounce"], rates: { Kilogram: 1, Gram: 1000, Pound: 2.20462, Ounce: 35.274 } },
  temp: { units: ["Celsius", "Fahrenheit", "Kelvin"] }
};

const catSelect = document.getElementById("converter-category");
const fromSelect = document.getElementById("converter-from");
const toSelect = document.getElementById("converter-to");
const inputVal = document.getElementById("converter-input-val");
const resultVal = document.getElementById("converter-result-val");

catSelect.addEventListener("change", populateConverterUnits);
fromSelect.addEventListener("change", calculateConversion);
toSelect.addEventListener("change", calculateConversion);
inputVal.addEventListener("input", calculateConversion);

function populateConverterUnits() {
  const cat = catSelect.value;
  fromSelect.innerHTML = "";
  toSelect.innerHTML = "";
  conversionData[cat].units.forEach(u => {
    let opt1 = document.createElement("option"); opt1.value = u; opt1.innerText = u;
    let opt2 = document.createElement("option"); opt2.value = u; opt2.innerText = u;
    fromSelect.appendChild(opt1);
    toSelect.appendChild(opt2);
  });
  if(toSelect.options[1]) toSelect.selectedIndex = 1;
  calculateConversion();
}

function calculateConversion() {
  const cat = catSelect.value;
  const from = fromSelect.value;
  const to = toSelect.value;
  const val = parseFloat(inputVal.value);
  if (isNaN(val)) { resultVal.value = ""; return; }
  
  if (from === to) { resultVal.value = val; return; }

  if (cat === "temp") {
    let celsius = 0;
    if (from === "Celsius") celsius = val;
    else if (from === "Fahrenheit") celsius = (val - 32) * 5 / 9;
    else if (from === "Kelvin") celsius = val - 273.15;

    let out = 0;
    if (to === "Celsius") out = celsius;
    else if (to === "Fahrenheit") out = (celsius * 9 / 5) + 32;
    else if (to === "Kelvin") out = celsius + 273.15;
    resultVal.value = out.toFixed(4);
  } else {
    const baseVal = val / conversionData[cat].rates[from];
    const target = baseVal * conversionData[cat].rates[to];
    resultVal.value = target.toFixed(4);
  }
}

// Requirement 4: VYDEX Office Enterprise Suite Suite Architecture & Logic Modules
document.querySelectorAll(".office-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".office-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".office-component").forEach(c => c.style.display = "none");
    btn.classList.add("active");
    const activeId = btn.id.replace("tab-", "office-");
    document.getElementById(activeId).style.display = "flex";
    officeData.activeTab = btn.id.replace("tab-", "");
    if(officeRealtimeActive && isHost) broadcastOfficeState();
  });
});

// --- Word Component Module ---
const wordEditor = document.getElementById("word-editor");
wordEditor.addEventListener("input", () => {
  officeData.wordHtml = wordEditor.innerHTML;
  if(officeRealtimeActive && isHost) broadcastOfficeState();
});
document.getElementById("download-word-btn").addEventListener("click", () => {
  const blob = new Blob([wordEditor.innerHTML], { type: "text/html" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "vydex-document.html"; a.click();
});

// --- Excel Component Module ---
function initExcel() {
  const table = document.getElementById("excel-table");
  table.innerHTML = "";
  // Header
  const hRow = document.createElement("tr");
  const thCorner = document.createElement("th"); thCorner.innerText = "#"; hRow.appendChild(thCorner);
  for(let c=0; c<officeData.excelData[0].length; c++) {
    const th = document.createElement("th");
    th.innerText = String.fromCharCode(65 + c);
    hRow.appendChild(th);
  }
  table.appendChild(hRow);

  // Rows
  for(let r=0; r<officeData.excelData.length; r++) {
    const tr = document.createElement("tr");
    const tdIndex = document.createElement("td"); tdIndex.innerText = r+1; tdIndex.style.fontWeight="600"; tr.appendChild(tdIndex);
    for(let c=0; c<officeData.excelData[r].length; c++) {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.value = officeData.excelData[r][c] || "";
      input.setAttribute("data-row", r);
      input.setAttribute("data-col", c);
      input.addEventListener("input", (e) => {
        const row = e.target.getAttribute("data-row");
        const col = e.target.getAttribute("data-col");
        officeData.excelData[row][col] = e.target.value;
        if(officeRealtimeActive && isHost) broadcastOfficeState();
      });
      td.appendChild(input);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

document.getElementById("excel-add-row").addEventListener("click", () => {
  const colsCount = officeData.excelData[0].length;
  officeData.excelData.push(new Array(colsCount).fill(""));
  initExcel();
  if(officeRealtimeActive && isHost) broadcastOfficeState();
});

document.getElementById("excel-add-col").addEventListener("click", () => {
  officeData.excelData.forEach(row => row.push(""));
  initExcel();
  if(officeRealtimeActive && isHost) broadcastOfficeState();
});

document.getElementById("download-excel-btn").addEventListener("click", () => {
  let csvContent = "";
  officeData.excelData.forEach(row => { csvContent += row.join(",") + "\n"; });
  const blob = new Blob([csvContent], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "vydex-sheet.csv"; a.click();
});

// --- Presentation Component Module ---
const slideTitleInput = document.getElementById("slide-title-input");
const slideContentInput = document.getElementById("slide-content-input");

function renderSlides() {
  const sidebar = document.getElementById("pres-sidebar");
  sidebar.innerHTML = "";
  officeData.slides.forEach((slide, index) => {
    const div = document.createElement("div");
    div.className = `slide-thumb ${index === officeData.currentSlideIndex ? 'active' : ''}`;
    div.innerText = `${index + 1}. ${slide.title || "Untitled"}`;
    div.addEventListener("click", () => {
      officeData.currentSlideIndex = index;
      loadCurrentSlide();
      if(officeRealtimeActive && isHost) broadcastOfficeState();
    });
    sidebar.appendChild(div);
  });
  loadCurrentSlide();
}

function loadCurrentSlide() {
  const currentSlide = officeData.slides[officeData.currentSlideIndex];
  if(currentSlide) {
    slideTitleInput.value = currentSlide.title || "";
    slideContentInput.value = currentSlide.content || "";
  } else {
    slideTitleInput.value = "";
    slideContentInput.value = "";
  }
}

slideTitleInput.addEventListener("input", () => {
  if(!officeData.slides[officeData.currentSlideIndex]) return;
  officeData.slides[officeData.currentSlideIndex].title = slideTitleInput.value;
  renderSlides();
  if(officeRealtimeActive && isHost) broadcastOfficeState();
});

slideContentInput.addEventListener("input", () => {
  if(!officeData.slides[officeData.currentSlideIndex]) return;
  officeData.slides[officeData.currentSlideIndex].content = slideContentInput.value;
  if(officeRealtimeActive && isHost) broadcastOfficeState();
});

document.getElementById("pres-add-slide").addEventListener("click", () => {
  officeData.slides.push({ title: "New Slide", content: "• Content point" });
  officeData.currentSlideIndex = officeData.slides.length - 1;
  renderSlides();
  if(officeRealtimeActive && isHost) broadcastOfficeState();
});

document.getElementById("pres-delete-slide").addEventListener("click", () => {
  if (officeData.slides.length <= 1) return alert("At least one slide required.");
  officeData.slides.splice(officeData.currentSlideIndex, 1);
  officeData.currentSlideIndex = 0;
  renderSlides();
  if(officeRealtimeActive && isHost) broadcastOfficeState();
});

document.getElementById("download-pres-btn").addEventListener("click", () => {
  let output = "VYDEX PRESENTATION SLIDES\n=========================\n\n";
  officeData.slides.forEach((s, idx) => {
    output += `Slide ${idx+1}: ${s.title}\n-------------------------\n${s.content}\n\n\n`;
  });
  const blob = new Blob([output], { type: "text/plain" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "vydex-slides.txt"; a.click();
});

// --- VYDEX Office Collaborative Realtime Sync Controllers ---
hostOfficeRealtimeBtn.addEventListener("click", () => {
  if(!isHost) return;
  officeRealtimeActive = !officeRealtimeActive;
  if (officeRealtimeActive) {
    hostOfficeRealtimeBtn.innerText = "🛑 Stop Realtime Sync";
    hostOfficeRealtimeBtn.style.background = "var(--danger)";
    hostOfficeFullscreenBtn.removeAttribute("disabled");
    broadcastOfficeState();
    showNotification("Real-time office workspace sync activated.", "success");
  } else {
    hostOfficeRealtimeBtn.innerText = "🔄 Start Realtime Sync";
    hostOfficeRealtimeBtn.style.background = "var(--primary)";
    hostOfficeFullscreenBtn.setAttribute("disabled", "true");
    if(officeForcedFullscreenActive) releaseHostOfficeFullscreen();
    socket.emit("office-realtime-sync", { room: currentRoom, active: false });
    showNotification("Office synchronization disconnected.", "primary");
  }
});

let officeForcedFullscreenActive = false;
hostOfficeFullscreenBtn.addEventListener("click", () => {
  if(!isHost || !officeRealtimeActive) return;
  officeForcedFullscreenActive = !officeForcedFullscreenActive;
  if(officeForcedFullscreenActive) {
    hostOfficeFullscreenBtn.innerText = "❌ Exit Forced Fullscreen";
    hostOfficeFullscreenBtn.style.background = "var(--danger)";
    socket.emit("office-fullscreen-sync", { room: currentRoom, active: true });
    showNotification("Forced office fullscreen synchronized.", "success");
  } else {
    releaseHostOfficeFullscreen();
  }
});

function releaseHostOfficeFullscreen() {
  officeForcedFullscreenActive = false;
  hostOfficeFullscreenBtn.innerText = "🔲 Force Office Fullscreen";
  hostOfficeFullscreenBtn.style.background = "var(--primary)";
  socket.emit("office-fullscreen-sync", { room: currentRoom, active: false });
  showNotification("Forced office fullscreen released.", "primary");
}

function broadcastOfficeState() {
  socket.emit("office-data-stream", { room: currentRoom, officeData });
}

socket.on("office-data-stream", data => {
  if (isHost) return; 
  officeData = data.officeData;
  
  // Sync view states
  document.querySelectorAll(".office-tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`tab-${officeData.activeTab}`).classList.add("active");
  document.querySelectorAll(".office-component").forEach(c => c.style.display = "none");
  document.getElementById(`office-${officeData.activeTab}`).style.display = "flex";

  // Re-inject content parameters dynamically
  wordEditor.innerHTML = officeData.wordHtml || "";
  initExcel();
  renderSlides();
});

socket.on("office-fullscreen-sync", data => {
  if (isHost) return;
  if(data.active) {
    showNotification("Host launched forced VYDEX Office Session.", "success");
    lockedContentArea.innerHTML = "";
    const coreOffice = document.getElementById("office-section");
    lockedContentArea.appendChild(coreOffice);
    coreOffice.style.display = "block";
    hostLockOverlay.style.display = "flex";
    syncHostCircleVideo(true);
  } else {
    showNotification("Forced VYDEX Office View released.", "primary");
    const coreOffice = document.getElementById("office-section");
    document.getElementById("workspace").prepend(coreOffice);
    hostLockOverlay.style.display = "none";
    hostCircleVideoContainer.style.display = "none";
    hostCircleVideoContainer.innerHTML = "";
  }
});

socket.on("office-realtime-sync", data => {
  if (isHost) return;
  if(!data.active) {
    // Force release if host terminates runtime loop
    const coreOffice = document.getElementById("office-section");
    document.getElementById("workspace").prepend(coreOffice);
    hostLockOverlay.style.display = "none";
    hostCircleVideoContainer.style.display = "none";
  }
});

// Leaflet GIS Mapping System Architecture
function initMapSystem() {
  if(map) return;
  map = L.map('map').setView([22.0, 78.0], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  
  map.on("click", (e) => {
    const latlng = e.latlng;
    socket.emit("map-click", { room: currentRoom, latlng });
    updateMapMarker(latlng);
  });
}

function updateMapMarker(latlng) {
  if(mapMarker) map.removeLayer(mapMarker);
  mapMarker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  map.panTo([latlng.lat, latlng.lng]);
}
socket.on("map-click", data => updateMapMarker(data.latlng));

document.getElementById("screenshotMapBtn").addEventListener("click", () => {
  const mapContainer = document.getElementById("map-wrapper");
  html2canvas(mapContainer, { useCORS: true }).then(canvas => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "vydex-map-capture.png";
    a.click();
    showNotification("Map screenshot downloaded successfully!", "success");
  });
});

// Standard Messaging & Multi-format File-sharing Channels
sendMsgBtn.addEventListener("click", () => { 
  const text = chatInput.value.trim(); 
  if (!text) return; 
  socket.emit("chat-message", { room: currentRoom, name: usernameInput.value || "Me", text }); 
  appendMessage(`Me: ${text}`); 
  chatInput.value = ""; 
});

chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMsgBtn.click(); } });

socket.on("chat-message", data => { 
  if(data.name === "System" && data.text.includes("left")) return; 
  appendMessage(`${data.name}: ${data.text}`); 
});

function appendMessage(msg) {
  const div = document.createElement("div");
  div.className = "chat-msg";
  if(msg.startsWith("Me:")) div.style.alignSelf = "flex-end";
  div.innerText = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

tabChat.addEventListener("click", () => { tabChat.classList.add("active"); tabFiles.classList.remove("active"); chatBoxArea.style.display="flex"; fileBoxArea.style.display="none"; });
tabFiles.addEventListener("click", () => { tabFiles.classList.add("active"); tabChat.classList.remove("active"); fileBoxArea.style.display="flex"; chatBoxArea.style.display="none"; });

document.getElementById("uploadBtn").addEventListener("click", async () => { 
  const f = fileUpload.files[0]; 
  if (!f) return; 
  const fd = new FormData(); 
  fd.append("file", f); 
  fd.append("room", currentRoom); 
  fd.append("uploader", usernameInput.value || "User"); 
  try { 
    const res = await (await fetch("/upload", { method: "POST", body: fd })).json();
    addFileLink(res.filename, res.url); 
  } catch (err) { 
    showNotification("File upload failed.", "danger");
  } 
});

function addFileLink(name, url) { 
  const a = document.createElement("a"); 
  a.href = url; a.textContent = name; a.download = name; a.target = "_blank"; 
  fileList.prepend(a); 
}
socket.on("file-uploaded", data => { addFileLink(data.filename, data.url); });

leaveBtn.addEventListener("click", () => { window.location.reload(); });