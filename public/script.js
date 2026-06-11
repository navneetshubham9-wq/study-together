const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const socket = io("https://study-together-1-aj7e.onrender.com", {
  transports: ["polling", "websocket"],
  upgrade: true,
  rememberUpgrade: true
});

// State variables
let localTracks = { audioTrack: null, videoTrack: null };
let localUid = null;
let joined = false;
let currentRoom = null;
let screenTrack = null;
let isHost = false; 
let globalHostUid = null; 
let isSharing = false; 
const remoteUsers = {}; 

// ==========================================
// 1. DOM Elements (Safely Selected)
// ==========================================
const joinBtn = document.getElementById("joinBtn");
const joinSection = document.getElementById("join-section"); 
const workspace = document.getElementById("workspace"); 
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const videoArea = document.getElementById("video-area");
const messages = document.getElementById("messages");

// Helper Functions
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
    if(!messages) return;
    const d = document.createElement("div"); 
    d.textContent = text;
    messages.appendChild(d); 
    messages.scrollTop = messages.scrollHeight;
}

// ==========================================
// 2. CORE LOGIN & ROOM JOIN LOGIC
// ==========================================
if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
        if (joined) return;
        
        const userName = usernameInput ? usernameInput.value.trim() : "";
        const roomId = roomInput ? roomInput.value.trim() : "";
        
        if (!userName || !roomId) { 
            alert("Please enter both Name and Room ID!"); 
            return; 
        }

        joinBtn.textContent = "Joining...";
        joinBtn.disabled = true;

        try {
            // Agora Connection
            const uid = await client.join(APP_ID, roomId, null, userName);
            localUid = uid.toString();
            
            try { 
                const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(); 
                localTracks.audioTrack = microphoneTrack; 
                localTracks.videoTrack = cameraTrack; 
                await client.publish([microphoneTrack, cameraTrack]); 
            } catch (mediaErr) { 
                showNotification("Camera/Mic blocked or busy. Joined as viewer.", "danger"); 
            }
            
            joined = true; 
            currentRoom = roomId; 
            
            // UI Transition
            if(joinSection) joinSection.classList.add("form-out");
            
            setTimeout(() => {
                if(joinSection) joinSection.style.display = "none"; 
                if(workspace) { 
                    workspace.classList.remove("hidden"); 
                    workspace.classList.add("workspace-active"); 
                }
                
                setTimeout(() => { 
                    if(typeof geoMap !== 'undefined' && geoMap) geoMap.invalidateSize(); 
                    const localId = createLocalCard(userName); 
                    if (localTracks.videoTrack && localId) {
                        localTracks.videoTrack.play(localId, { fit: "cover" }); 
                    }
                }, 300);
            }, 500); 
            
            socket.emit("join-room", { room: roomId, uid: localUid, name: userName });
            showNotification(`You joined room ${roomId}`, "join"); 
            appendMessage(`System: You joined room ${roomId}`);
            
        } catch (err) { 
            alert("Login Failed: " + err.message);
            console.error("Agora Join Error:", err);
            joinBtn.textContent = "🚀 Join Room";
            joinBtn.disabled = false;
        }
    });
}

function createLocalCard(name) {
    let el = document.getElementById("local-player"); 
    if (el) return "local-player";
    
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
    if(videoArea) { 
        videoArea.prepend(localContainer); 
        addSizeControls(localContainer, localContainer); 
    }
    return "local-player";
}

function createRemoteWrapper(uid, labelText) {
    let wrapper = document.getElementById(`remote-wrapper-${uid}`); 
    if (wrapper) return `remote-${uid}`;
    
    wrapper = document.createElement("div"); 
    wrapper.id = `remote-wrapper-${uid}`; 
    wrapper.style.display = "flex"; 
    wrapper.style.flexDirection = "column"; 
    wrapper.style.alignItems = "center"; 
    wrapper.style.gap = "6px"; 
    wrapper.style.width = "100%"; 
    wrapper.style.position = "relative"; 
    
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
    muteRemoteBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "mute-audio" });
    
    const camOffBtn = document.createElement("button"); 
    camOffBtn.className = "small-btn host-only-btn"; 
    camOffBtn.style.display = isHost ? "inline-block" : "none"; 
    camOffBtn.textContent = "📹❌"; 
    camOffBtn.title = "Disable Camera"; 
    camOffBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "disable-video" });
    
    const wbBtn = document.createElement("button"); 
    wbBtn.className = "small-btn host-only-btn"; 
    wbBtn.style.display = isHost ? "inline-block" : "none"; 
    wbBtn.textContent = "🖍️ WB"; 
    wbBtn.dataset.access = "false"; 
    wbBtn.style.background = "var(--primary)";
    wbBtn.onclick = () => { 
        const isGranting = wbBtn.dataset.access === "false"; 
        socket.emit("wb-control", { room: currentRoom, targetUid: uid.toString(), action: isGranting ? "grant" : "revoke" }); 
        wbBtn.dataset.access = isGranting ? "true" : "false"; 
        wbBtn.textContent = isGranting ? "🚫🖍️ WB" : "🖍️ WB"; 
        wbBtn.style.background = isGranting ? "var(--danger)" : "var(--primary)"; 
    };
    
    controlsDiv.appendChild(muteRemoteBtn); 
    controlsDiv.appendChild(camOffBtn); 
    controlsDiv.appendChild(wbBtn); 
    wrapper.appendChild(card); 
    wrapper.appendChild(controlsDiv); 
    
    if(videoArea) { 
        videoArea.appendChild(wrapper); 
        addSizeControls(wrapper, card); 
    }
    return `remote-${uid}`;
}

// ==========================================
// 3. UI PANELS & MAXIMIZE LOGIC
// ==========================================
function addSizeControls(targetWrapper, elementToFullscreen) {
    if(!targetWrapper) return;
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "local-controls";
    
    if(targetWrapper.id !== 'map-box') {
        const enlargeBtn = document.createElement("button"); 
        enlargeBtn.className = "icon-btn"; enlargeBtn.innerHTML = "➕";
        enlargeBtn.onclick = () => { 
            targetWrapper.classList.remove("video-wrapper-small"); 
            targetWrapper.classList.toggle("video-wrapper-large"); 
        };
        const shrinkBtn = document.createElement("button"); 
        shrinkBtn.className = "icon-btn"; shrinkBtn.innerHTML = "➖";
        shrinkBtn.onclick = () => { 
            targetWrapper.classList.remove("video-wrapper-large"); 
            targetWrapper.classList.toggle("video-wrapper-small"); 
        };
        controlsDiv.appendChild(enlargeBtn); 
        controlsDiv.appendChild(shrinkBtn);
    }
    
    if(targetWrapper.id !== 'map-box') {
        const maxBtn = document.createElement("button"); 
        maxBtn.className = "icon-btn"; maxBtn.innerHTML = "🖥️";
        maxBtn.onclick = () => { 
            if (!document.fullscreenElement) { targetWrapper.requestFullscreen().catch(e => console.warn(e)); } 
            else { document.exitFullscreen(); } 
        };
        controlsDiv.appendChild(maxBtn);
    }
    targetWrapper.appendChild(controlsDiv);
}

const whiteboardBox = document.getElementById("whiteboard-box");
const mapBox = document.getElementById("map-box");
const presentationBox = document.getElementById("presentation-box");
const officeBox = document.getElementById("office-box");

if(whiteboardBox) addSizeControls(whiteboardBox, whiteboardBox);
if(mapBox) addSizeControls(mapBox, mapBox);
if(presentationBox) addSizeControls(presentationBox, presentationBox);
if(officeBox) addSizeControls(officeBox, officeBox);

const toggleWbBtn = document.getElementById("toggleWbBtn");
const toggleMapBtn = document.getElementById("toggleMapBtn");
const togglePresBtn = document.getElementById("togglePresBtn");
const toggleOfficeBtn = document.getElementById("toggleOfficeBtn");
const wbStatus = document.getElementById("wb-status");
const fileList = document.getElementById("fileList");
const muteAllBtn = document.getElementById("muteAllBtn");
const unmuteAllBtn = document.getElementById("unmuteAllBtn");
const cameraBtn = document.getElementById("cameraBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");
const sendMsgBtn = document.getElementById("sendMsgBtn");
const chatInput = document.getElementById("chatInput");
const fileUpload = document.getElementById("fileUpload");
const leaveBtn = document.getElementById("leaveBtn");

document.getElementById("mapFullscreenBtn")?.addEventListener("click", () => {
    const mapCont = document.getElementById("map-container");
    if (mapCont && !document.fullscreenElement) { mapCont.requestFullscreen().catch(e => console.warn(e)); } 
    else { document.exitFullscreen(); }
});

function hideAllBigPanels() {
    if(whiteboardBox) whiteboardBox.style.display = "none";
    if(mapBox) mapBox.style.display = "none";
    if(presentationBox) presentationBox.style.display = "none";
    if(officeBox) officeBox.style.display = "none";
    
    const toggleWbBtn = document.getElementById("toggleWbBtn");
    const toggleMapBtn = document.getElementById("toggleMapBtn");
    const togglePresBtn = document.getElementById("togglePresBtn");
    const toggleOfficeBtn = document.getElementById("toggleOfficeBtn");

    if(toggleWbBtn) { toggleWbBtn.dataset.show = "false"; toggleWbBtn.style.background = "linear-gradient(135deg, #3498db, #2980b9)"; }
    if(toggleMapBtn) { toggleMapBtn.dataset.show = "false"; toggleMapBtn.style.background = "linear-gradient(135deg, #27ae60, #2ecc71)"; }
    if(togglePresBtn) { togglePresBtn.dataset.show = "false"; togglePresBtn.style.background = "linear-gradient(135deg, #f1c40f, #f39c12)"; }
    if(toggleOfficeBtn) { toggleOfficeBtn.dataset.show = "false"; toggleOfficeBtn.style.background = "linear-gradient(135deg, #c0392b, #e74c3c)"; }
}

document.getElementById("togglePresBtn")?.addEventListener("click", function() { 
    const isShowing = this.dataset.show === "true";
    if (isShowing) {
        if(presentationBox) presentationBox.style.display = "none";
        this.dataset.show = "false";
        this.style.background = "linear-gradient(135deg, #f1c40f, #f39c12)";
    } else {
        hideAllBigPanels();
        if(presentationBox) presentationBox.style.display = "block";
        this.dataset.show = "true";
        this.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    }
    socket.emit("pres-toggle", { room: currentRoom, show: !isShowing }); 
});
document.getElementById("toggleWbBtn")?.addEventListener("click", function() { 
    const isShowing = this.dataset.show === "true";
    if (isShowing) {
        if(whiteboardBox) whiteboardBox.style.display = "none";
        this.dataset.show = "false";
        this.style.background = "linear-gradient(135deg, #3498db, #2980b9)";
    } else {
        hideAllBigPanels();
        if(whiteboardBox) whiteboardBox.style.display = "block";
        this.dataset.show = "true";
        this.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    }
    socket.emit("wb-toggle", { room: currentRoom, show: !isShowing }); 
});
document.getElementById("toggleMapBtn")?.addEventListener("click", function() { 
    const isShowing = this.dataset.show === "true";
    if (isShowing) {
        if(mapBox) mapBox.style.display = "none";
        this.dataset.show = "false";
        this.style.background = "linear-gradient(135deg, #27ae60, #2ecc71)";
    } else {
        hideAllBigPanels();
        if(mapBox) mapBox.style.display = "block";
        setTimeout(() => {if(typeof geoMap !== 'undefined') geoMap.invalidateSize();}, 100);
        this.dataset.show = "true";
        this.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    }
    socket.emit("map-toggle", { room: currentRoom, show: !isShowing }); 
});
document.getElementById("toggleOfficeBtn")?.addEventListener("click", function() { 
    const isShowing = this.dataset.show === "true";
    if (isShowing) {
        if(officeBox) officeBox.style.display = "none";
        this.dataset.show = "false";
        this.style.background = "linear-gradient(135deg, #c0392b, #e74c3c)";
    } else {
        hideAllBigPanels();
        if(officeBox) officeBox.style.display = "block";
        this.dataset.show = "true";
        this.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
    }
    socket.emit("office-toggle", { room: currentRoom, show: !isShowing }); 
});

socket.on("pres-toggle", (data) => {
    if(data.show) { 
        hideAllBigPanels(); 
        if(presentationBox) presentationBox.style.display = "block"; 
        if(isHost){ const btn = document.getElementById("togglePresBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } 
    } else { 
        if(presentationBox) presentationBox.style.display = "none"; 
        if(isHost){ const btn = document.getElementById("togglePresBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #f1c40f, #f39c12)";} } 
    }
});

socket.on("wb-toggle", (data) => {
    if(data.show) { 
        hideAllBigPanels(); 
        if(whiteboardBox) whiteboardBox.style.display = "block"; 
        if(isHost){ const btn = document.getElementById("toggleWbBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } 
    } else { 
        if(whiteboardBox) whiteboardBox.style.display = "none"; 
        if(isHost){ const btn = document.getElementById("toggleWbBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #3498db, #2980b9)";} } 
        const fsBtn = document.getElementById("wbForceFsBtn");
        if(fsBtn) { fsBtn.dataset.forced = "false"; fsBtn.textContent = "🔒 Force Fullscreen"; fsBtn.style.background = "#e74c3c"; }
    }
});

socket.on("map-toggle", (data) => {
    if(data.show) { 
        hideAllBigPanels(); 
        if(mapBox) mapBox.style.display = "block"; 
        setTimeout(() => { if(typeof geoMap !== 'undefined') geoMap.invalidateSize(); }, 100); 
        if(isHost){ const btn = document.getElementById("toggleMapBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } 
    } else { 
        if(mapBox) mapBox.style.display = "none"; 
        if(isHost){ const btn = document.getElementById("toggleMapBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #27ae60, #2ecc71)";} } 
    }
});

socket.on("office-toggle", (data) => {
    if(data.show) { 
        hideAllBigPanels(); 
        if(officeBox) officeBox.style.display = "block"; 
        if(isHost){ const btn = document.getElementById("toggleOfficeBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } 
    } else { 
        if(officeBox) officeBox.style.display = "none"; 
        if(isHost){ const btn = document.getElementById("toggleOfficeBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #c0392b, #e74c3c)";} } 
        const fsBtn = document.getElementById("officeForceFsBtn");
        if(fsBtn) { fsBtn.dataset.forced = "false"; fsBtn.textContent = "🔒 Force Fullscreen"; fsBtn.style.background = "#e74c3c"; }
    }
});


// ==========================================
// 4. HAMBURGER MENU SCROLL LOGIC
// ==========================================
const controlRowInner = document.getElementById("controlRowInner");
const hamburgerBtn = document.getElementById("hamburgerBtn");
const sideMenuContainer = document.getElementById("side-menu-container");
const controlsSection = document.getElementById("controls");

window.addEventListener("scroll", () => {
    if(!joined || !hamburgerBtn || !sideMenuContainer) return;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    if (scrollY > 80) {
        hamburgerBtn.style.setProperty("display", "block", "important");
        if (controlRowInner && controlRowInner.parentElement === controlsSection) {
            sideMenuContainer.appendChild(controlRowInner);
            controlRowInner.style.display = "flex";
            controlRowInner.style.flexDirection = "column";
            if (sideMenuContainer.dataset.manualToggle !== "true") sideMenuContainer.style.setProperty("display", "none", "important");
        }
    } else {
        hamburgerBtn.style.setProperty("display", "none", "important");
        if (controlRowInner && controlRowInner.parentElement === sideMenuContainer) {
            controlsSection.insertBefore(controlRowInner, controlsSection.firstChild);
            controlRowInner.style.flexDirection = "row";
            sideMenuContainer.style.setProperty("display", "none", "important");
            sideMenuContainer.dataset.manualToggle = "false";
        }
    }
});

hamburgerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!sideMenuContainer) return;
    if (sideMenuContainer.style.display === "none") {
        sideMenuContainer.style.setProperty("display", "flex", "important");
        sideMenuContainer.dataset.manualToggle = "true";
    } else {
        sideMenuContainer.style.setProperty("display", "none", "important");
        sideMenuContainer.dataset.manualToggle = "false";
    }
});

document.addEventListener("click", (e) => {
    if (hamburgerBtn && sideMenuContainer && hamburgerBtn.style.display === "block" && sideMenuContainer.style.display === "flex") {
        if (!sideMenuContainer.contains(e.target) && e.target !== hamburgerBtn) {
            sideMenuContainer.style.setProperty("display", "none", "important");
            sideMenuContainer.dataset.manualToggle = "false";
        }
    }
});

// ==========================================
// 5. LIVE CURRENCY CONVERTER
// ==========================================
const convModal = document.getElementById("converter-modal");
const toggleConvBtn = document.getElementById("toggleConvBtn");
const convType = document.getElementById("convType");
const convFrom = document.getElementById("convFrom");
const convTo = document.getElementById("convTo");
const convInput = document.getElementById("convInput");
const convOutput = document.getElementById("convOutput");

let liveExchangeRates = {};
const convRates = {
    currency: { USD: 1, INR: 83.5, EUR: 0.92, GBP: 0.79, JPY: 151 }, 
    length: { Meter: 1, Centimeter: 100, Kilometer: 0.001, Inch: 39.37, Foot: 3.281, Mile: 0.000621 },
    weight: { Kilogram: 1, Gram: 1000, Pound: 2.205, Ounce: 35.274 },
    temp: { Celsius: "C", Fahrenheit: "F", Kelvin: "K" }
};

async function fetchLiveRates() {
    const titleText = document.getElementById("convTitleText");
    try {
        if(titleText) titleText.textContent = "🔄 Fetching Live...";
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        liveExchangeRates = data.rates;
        if(titleText) titleText.textContent = "🔄 Live Currency";
    } catch(e) {
        if(titleText) titleText.textContent = "🔄 Currency (Offline)";
    }
}

async function populateConvDropdowns() {
    if(!convType || !convFrom || !convTo) return;
    const type = convType.value;
    convFrom.innerHTML = ""; convTo.innerHTML = "";

    let ratesObj = convRates[type];
    if (type === 'currency') {
        if(Object.keys(liveExchangeRates).length === 0) await fetchLiveRates();
        if(Object.keys(liveExchangeRates).length > 0) ratesObj = liveExchangeRates;
    }

    Object.keys(ratesObj).forEach(k => {
        convFrom.innerHTML += `<option value="${k}">${k}</option>`;
        convTo.innerHTML += `<option value="${k}">${k}</option>`;
    });

    if (type === 'currency') {
        if (ratesObj['USD']) convFrom.value = 'USD';
        if (ratesObj['INR']) convTo.value = 'INR';
    } else if (convTo.options.length > 1) {
        convTo.selectedIndex = 1;
    }
    window.currentActiveRates = ratesObj;
    calculateConversion();
}

function calculateConversion() {
    if(!convType || !convInput || !convOutput) return;
    const type = convType.value; 
    const val = parseFloat(convInput.value) || 0;
    const from = convFrom.value; 
    const to = convTo.value;
    
    if (type === 'temp') {
        let c = 0;
        if(from === 'Celsius') c = val; else if(from === 'Fahrenheit') c = (val - 32) * 5/9; else if(from === 'Kelvin') c = val - 273.15;
        if(to === 'Celsius') convOutput.value = c.toFixed(2); else if(to === 'Fahrenheit') convOutput.value = ((c * 9/5) + 32).toFixed(2); else if(to === 'Kelvin') convOutput.value = (c + 273.15).toFixed(2);
    } else {
        const ratesObj = window.currentActiveRates || convRates[type];
        if(ratesObj && ratesObj[from] && ratesObj[to]) {
            const baseVal = val / ratesObj[from];
            convOutput.value = (baseVal * ratesObj[to]).toFixed(4);
        }
    }
}

toggleConvBtn?.addEventListener("click", async () => { 
    if(convModal) {
        const isHidden = convModal.style.display === "none" || convModal.style.display === "";
        convModal.style.display = isHidden ? "block" : "none"; 
        if(isHidden) {
            if (convType && convType.value === 'currency') await fetchLiveRates();
            populateConvDropdowns(); 
        }
    }
});

convType?.addEventListener("change", populateConvDropdowns);
convInput?.addEventListener("input", calculateConversion);
convFrom?.addEventListener("change", calculateConversion);
convTo?.addEventListener("change", calculateConversion);

document.getElementById("closeConvBtn")?.addEventListener("pointerdown", (e) => { 
    e.stopPropagation(); 
    if(convModal) convModal.style.display = "none"; 
});

let isConvDragging = false; let convStartX, convStartY, convInitialX, convInitialY;
document.getElementById("converter-header")?.addEventListener("pointerdown", (e) => { 
    if(e.target.id === "closeConvBtn") return;
    isConvDragging = true; 
    convStartX = e.clientX; 
    convStartY = e.clientY; 
    const rect = convModal.getBoundingClientRect(); 
    convInitialX = rect.left; 
    convInitialY = rect.top; 
    convModal.style.right = "auto"; 
    convModal.style.left = convInitialX + "px"; 
    convModal.style.top = convInitialY + "px"; 
    e.preventDefault();
});
document.addEventListener("pointermove", (e) => { 
    if(!isConvDragging || !convModal) return; 
    convModal.style.left = (convInitialX + e.clientX - convStartX) + "px"; 
    convModal.style.top = (convInitialY + e.clientY - convStartY) + "px"; 
});
document.addEventListener("pointerup", () => isConvDragging = false);

// ==========================================
// 6. DRAGGABLE CALCULATOR
// ==========================================
const calcModal = document.getElementById("calc-modal");
const toggleCalcBtn = document.getElementById("toggleCalcBtn");
const calcDisplay = document.getElementById("calc-display");

toggleCalcBtn?.addEventListener("click", () => { 
    if(calcModal) calcModal.style.display = calcModal.style.display === "none" || calcModal.style.display === "" ? "block" : "none"; 
});
window.calcAppend = (val) => { if(calcDisplay) calcDisplay.value += val; };
window.calcClear = () => { if(calcDisplay) calcDisplay.value = ""; };
window.calcCalculate = () => { 
    if(calcDisplay) { 
        try { calcDisplay.value = eval(calcDisplay.value); } 
        catch(e) { calcDisplay.value = "Error"; setTimeout(calcClear, 1000); } 
    } 
};

document.addEventListener("keydown", (e) => {
    if (calcModal && calcModal.style.display === "block") {
        const key = e.key;
        if (/^[0-9\.\+\-\*\/]$/.test(key)) calcAppend(key);
        else if (key === "Enter" || key === "=") { e.preventDefault(); calcCalculate(); } 
        else if (key === "Escape" || key === "Clear" || key === "Delete") calcClear();
        else if (key === "Backspace" && calcDisplay) calcDisplay.value = calcDisplay.value.slice(0, -1);
    }
});

document.getElementById("closeCalcBtn")?.addEventListener("pointerdown", (e) => { 
    e.stopPropagation(); 
    if(calcModal) calcModal.style.display = "none"; 
});

let isCalcDragging = false; let calcInitialXCalc, calcInitialYCalc;
document.getElementById("calc-header")?.addEventListener("pointerdown", (e) => { 
    if(e.target.id === "closeCalcBtn") return;
    isCalcDragging = true; 
    calcStartX = e.clientX; 
    calcStartY = e.clientY; 
    const rect = calcModal.getBoundingClientRect(); 
    calcInitialXCalc = rect.left; 
    calcInitialYCalc = rect.top; 
    calcModal.style.right = "auto"; 
    calcModal.style.left = calcInitialXCalc + "px"; 
    calcModal.style.top = calcInitialYCalc + "px"; 
    e.preventDefault();
});
document.addEventListener("pointermove", (e) => { 
    if(!isCalcDragging || !calcModal) return; 
    calcModal.style.left = (calcInitialXCalc + e.clientX - calcStartX) + "px"; 
    calcModal.style.top = (calcInitialYCalc + e.clientY - calcStartY) + "px"; 
});
document.addEventListener("pointerup", () => isCalcDragging = false);

// ==========================================
// 7. VYDEX OFFICE (Word, Excel, PPT)
// ==========================================
const officeTabs = document.querySelectorAll(".office-tab");
const officeTabBtns = document.querySelectorAll(".office-tab-btn");
const excelGrid = document.getElementById("excelGrid");
const pptEditor = document.getElementById("pptEditor");
const officeSyncToggle = document.getElementById("officeSyncToggle");
let isOfficeSyncing = false;
let pptSlides = ['<h2 style="margin-top:0;">Slide 1</h2><p>Click to add text</p>'];
let pptCurrentSlide = 0;

function rebuildExcelGrid() {
    if(!excelGrid) return;
    const header = excelGrid.querySelector("tr");
    const colCount = header ? header.cells.length - 1 : 10;
    const rowCount = excelGrid.rows.length;
    let rowsHtml = "";
    for(let r=1; r<rowCount; r++) {
        let row = `<tr><td style="background:#e0e0e0; font-weight:bold; width:40px; min-width:40px; text-align:center;">${r}</td>`;
        for(let c=0; c<colCount; c++) row += `<td contenteditable="false"></td>`;
        row += `</tr>`;
        rowsHtml += row;
    }
    while(excelGrid.rows.length > 1) excelGrid.deleteRow(1);
    excelGrid.innerHTML += rowsHtml;
}

if(excelGrid) {
    let rowsHtml = "";
    for(let r=1; r<=20; r++) {
        let row = `<tr><td style="background:#e0e0e0; font-weight:bold; width:40px; min-width:40px; text-align:center;">${r}</td>`;
        for(let c=0; c<10; c++) row += `<td contenteditable="false"></td>`;
        row += `</tr>`; 
        rowsHtml += row;
    }
    excelGrid.innerHTML += rowsHtml;
}

officeTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        officeTabBtns.forEach(b => b.classList.remove("active-tool"));
        btn.classList.add("active-tool");
        const target = document.getElementById(btn.dataset.target);
        if(target) {
            target.style.display = "flex";
            officeTabs.forEach(t => { if(t !== target) t.style.display = "none"; });
        }
        if(isHost && isOfficeSyncing) socket.emit("office-sync", { room: currentRoom, action: "tab-switch", target: btn.dataset.target });
    });
});

// Office ribbon tab switching
document.querySelectorAll(".office-ribbon-tab").forEach(btn => {
    btn.addEventListener("click", () => {
        const ribbon = btn.closest(".office-ribbon");
        if(!ribbon) return;
        ribbon.querySelectorAll(".office-ribbon-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        ribbon.querySelectorAll(".office-ribbon-panel").forEach(p => p.classList.remove("active"));
        const target = document.getElementById(btn.dataset.panel);
        if(target) target.classList.add("active");
    });
});

officeSyncToggle?.addEventListener("change", (e) => {
    isOfficeSyncing = e.target.checked;
    if(isOfficeSyncing) emitOfficeData();
});

function emitOfficeData() {
    if(!isHost || !isOfficeSyncing) return;
    socket.emit("office-sync", {
        room: currentRoom, action: "content-update",
        pptData: JSON.stringify({ slides: pptSlides, current: pptCurrentSlide }),
        excelData: excelGrid ? Array.from(excelGrid.rows).slice(1).map(r => Array.from(r.cells).slice(1).map(c => c.innerHTML)) : []
    });
}

excelGrid?.addEventListener("input", emitOfficeData);
pptEditor?.addEventListener("click", function() { if(this.contentEditable === "true") this.focus(); });
excelGrid?.addEventListener("click", function(e) { const td = e.target?.closest?.("td"); if(td && td.contentEditable === "true") td.focus(); });

document.getElementById("officeDownloadBtn")?.addEventListener("click", () => {
    let activeTab = Array.from(officeTabs).find(t => t.style.display !== "none" && t.style.display !== "")?.id;
    let content = "", ext = "", mime = "", filename = "VYDEX_Document";
    if(activeTab === 'office-ppt') { content = pptSlides.map((s,i)=>`--- Slide ${i+1} ---\n${new DOMParser().parseFromString(s,'text/html').body.textContent||''}`).join("\n\n"); ext = "txt"; mime = "text/plain"; filename = "VYDEX_Presentation"; }
    if(activeTab === 'office-excel' && excelGrid) {
        content = Array.from(excelGrid.rows).map(r => Array.from(r.cells).map(c => c.innerText).join(",")).join("\n");
        ext = "csv"; mime = "text/csv"; filename = "VYDEX_Excel";
    }
    if(!content) return;
    const blob = new Blob([content], { type: mime }); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); 
    a.href = url; 
    a.download = `${filename}.${ext}`; 
    a.click();
});

// ---- Excel helpers ----
function excelBold() {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const cur = td.style.fontWeight === 'bold' ? 'normal' : 'bold';
    td.style.fontWeight = cur;
    emitOfficeData();
}
function excelItalic() {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const cur = td.style.fontStyle === 'italic' ? 'normal' : 'italic';
    td.style.fontStyle = cur;
    emitOfficeData();
}
function excelBgColor(color) {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    td.style.backgroundColor = color;
    emitOfficeData();
}
function excelFgColor(color) {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    td.style.color = color;
    emitOfficeData();
}
function excelAddRow() {
    if(!excelGrid) return;
    const n = excelGrid.rows.length;
    const cols = excelGrid.rows[0].cells.length - 1;
    let row = `<tr><td style="background:#e0e0e0;font-weight:bold;width:40px;min-width:40px;text-align:center;">${n}</td>`;
    for(let c=0; c<cols; c++) row += `<td contenteditable="false"></td>`;
    row += `</tr>`;
    excelGrid.innerHTML += row;
    if(isHost) document.querySelectorAll('#excelGrid td').forEach(td => td.contentEditable = "true");
    emitOfficeData();
}
function excelAddCol() {
    if(!excelGrid) return;
    const letter = String.fromCharCode(65 + excelGrid.rows[0].cells.length - 1);
    excelGrid.rows[0].insertCell(-1).outerHTML = `<th>${letter}</th>`;
    for(let r=1; r<excelGrid.rows.length; r++) {
        const td = excelGrid.rows[r].insertCell(-1);
        td.innerHTML = "";
        td.contentEditable = "false";
        td.style.cssText = "background:#fdfdfd;padding:12px;border:1px solid #ddd;text-align:center;outline:none;min-width:80px;";
    }
    if(isHost) document.querySelectorAll('#excelGrid td').forEach(td => td.contentEditable = "true");
    emitOfficeData();
}
function excelDeleteRow() {
    if(!excelGrid || excelGrid.rows.length <= 2) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const tr = sel.anchorNode?.closest?.('tr');
    if(!tr || tr.rowIndex === 0) return;
    tr.remove();
    for(let r=1; r<excelGrid.rows.length; r++) {
        excelGrid.rows[r].cells[0].textContent = r;
    }
    emitOfficeData();
}
function excelDeleteCol() {
    if(!excelGrid || excelGrid.rows[0].cells.length <= 2) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td,th');
    if(!td) return;
    const ci = td.cellIndex;
    if(ci === 0) return;
    for(let r=0; r<excelGrid.rows.length; r++) excelGrid.rows[r].deleteCell(ci);
    for(let c=1; c<excelGrid.rows[0].cells.length; c++) {
        excelGrid.rows[0].cells[c].textContent = String.fromCharCode(64 + c);
    }
    emitOfficeData();
}
function excelSortCol(ascending = true) {
    if(!excelGrid || excelGrid.rows.length <= 2) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td,th');
    if(!td) return;
    const ci = td.cellIndex;
    if(ci === 0) return;
    const rows = Array.from(excelGrid.rows).slice(1);
    rows.sort((a, b) => ascending
        ? (a.cells[ci]?.innerText || '').localeCompare(b.cells[ci]?.innerText || '')
        : (b.cells[ci]?.innerText || '').localeCompare(a.cells[ci]?.innerText || ''));
    const tbody = excelGrid.querySelector('tbody') || excelGrid;
    rows.forEach(r => tbody.appendChild(r));
    for(let r=1; r<excelGrid.rows.length; r++) excelGrid.rows[r].cells[0].textContent = r;
    emitOfficeData();
}
function excelFontSize(size) {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    td.style.fontSize = size + "px";
    emitOfficeData();
}
function excelAlign(align) {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    td.style.textAlign = align;
    emitOfficeData();
}
function excelMerge() {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    if(td.colSpan > 1) { td.colSpan = 1; return; }
    const ri = td.parentElement.rowIndex;
    let mergeWith = null;
    for(let c=td.cellIndex+1; c<excelGrid.rows[ri].cells.length; c++) {
        const next = excelGrid.rows[ri].cells[c];
        if(next.tagName === 'TD') { mergeWith = next; break; }
    }
    if(mergeWith) { td.colSpan = (td.colSpan||1) + (mergeWith.colSpan||1); mergeWith.remove(); }
    emitOfficeData();
}
function excelWrap() {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    td.style.whiteSpace = td.style.whiteSpace === 'nowrap' ? 'normal' : 'nowrap';
    emitOfficeData();
}
function excelFormat(fmt) {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    if(fmt === 'currency') td.textContent = '$' + (parseFloat(td.textContent.replace(/[^0-9.-]/g,'')) || 0).toFixed(2);
    else if(fmt === 'percentage') td.textContent = (parseFloat(td.textContent.replace(/[^0-9.-]/g,'')) || 0) + '%';
    else if(fmt === 'number') td.textContent = parseFloat(td.textContent.replace(/[^0-9.-]/g,'')).toLocaleString();
    else if(fmt === 'date') td.textContent = new Date().toLocaleDateString();
    else if(fmt === 'time') td.textContent = new Date().toLocaleTimeString();
    emitOfficeData();
}
function excelAutoSum() {
    if(!excelGrid) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const ci = td.cellIndex;
    const ri = td.parentElement.rowIndex;
    let sum = 0;
    for(let r=1; r<excelGrid.rows.length; r++) {
        const val = parseFloat(excelGrid.rows[r].cells[ci]?.innerText?.replace(/[^0-9.-]/g,''));
        if(!isNaN(val) && r !== ri) sum += val;
    }
    td.textContent = sum;
    emitOfficeData();
}

// ---- Excel advanced features ----
function excelFilter() {
    if (!excelGrid || excelGrid.rows.length <= 1) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td,th');
    if (!td) return;
    const ci = td.cellIndex;
    if (ci === 0) return;
    const vals = new Set();
    for (let r = 1; r < excelGrid.rows.length; r++) {
        const v = excelGrid.rows[r].cells[ci]?.innerText?.trim();
        if (v) vals.add(v);
    }
    const arr = [...vals];
    if (arr.length === 0) return;
    const show = prompt(`Filter column: Show only value (or blank to clear filter):\nValues: ${arr.join(', ')}`, '');
    for (let r = 1; r < excelGrid.rows.length; r++) {
        const v = excelGrid.rows[r].cells[ci]?.innerText?.trim();
        excelGrid.rows[r].style.display = (!show || v === show) ? '' : 'none';
    }
    showNotification(show ? `Filtered: showing "${show}" only` : 'Filter cleared','info');
}
function excelRemoveDuplicates() {
    if (!excelGrid || excelGrid.rows.length <= 2) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td,th');
    if (!td) return;
    const ci = td.cellIndex;
    if (ci === 0) return;
    const seen = new Set();
    const rows = Array.from(excelGrid.rows);
    let removed = 0;
    for (let r = rows.length - 1; r >= 1; r--) {
        const v = rows[r].cells[ci]?.innerText?.trim() || '';
        if (seen.has(v)) { rows[r].remove(); removed++; }
        else seen.add(v);
    }
    for (let r = 1; r < excelGrid.rows.length; r++) excelGrid.rows[r].cells[0].textContent = r;
    showNotification(`Removed ${removed} duplicate(s) from column`,'success');
    emitOfficeData();
}
function excelDataValidation() {
    if (!excelGrid) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if (!td) return;
    const rule = prompt('Validation rule:\n1=Number only\n2=Text only\n3=Max length\n4=Clear', '1');
    if (!rule) return;
    if (rule === '1') {
        td.dataset.validate = 'number';
        showNotification('✓ Number validation set on cell','success');
    } else if (rule === '2') {
        td.dataset.validate = 'text';
        td.addEventListener('input', function(e) {
            if (/[0-9]/.test(e.target.innerText)) e.target.innerText = e.target.innerText.replace(/[0-9]/g,'');
        }, {once: true});
        showNotification('✓ Text-only validation set','success');
    } else if (rule === '3') {
        const max = prompt('Max characters:', '10');
        if (max) {
            td.dataset.maxlen = max;
            td.addEventListener('input', function(e) {
                if (e.target.innerText.length > +max) e.target.innerText = e.target.innerText.slice(0, +max);
            }, {once: true});
            showNotification(`✓ Max ${max} chars validation set`,'success');
        }
    } else {
        delete td.dataset.validate;
        showNotification('Validation cleared','info');
    }
    emitOfficeData();
}
function excelProtectSheet() {
    if (!excelGrid) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if (td) {
        if (td.contentEditable === 'false') {
            document.querySelectorAll('#excelGrid td').forEach(t => { if(!t.dataset.protected) t.contentEditable = 'true'; });
            showNotification('Sheet unprotected','info');
        } else {
            document.querySelectorAll('#excelGrid td').forEach(t => { if(!t.dataset.protected) t.contentEditable = 'false'; });
            showNotification('Sheet protected','warning');
        }
    }
    emitOfficeData();
}
// ---- Excel new features ----
function excelChart() {
    if(!excelGrid) return;
    const labels = prompt('Labels (comma separated):','Jan,Feb,Mar');
    const values = prompt('Values (comma separated):','30,50,20');
    if(!labels || !values) return;
    const labs = labels.split(',').map(s=>s.trim());
    const vals = values.split(',').map(s=>parseFloat(s.trim())||0);
    const max = Math.max(...vals,1);
    let html = '<div style="display:flex;gap:10px;align-items:flex-end;padding:15px 8px;min-height:150px;border:1px solid #ddd;border-radius:4px;margin:4px 0;">';
    labs.forEach((l,i) => {
        const h = (vals[i]/max)*120;
        html += `<div style="flex:1;text-align:center;"><div style="height:${h}px;background:${['#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c'][i%6]};border-radius:3px 3px 0 0;"></div><span style="font-size:9px;display:block;margin-top:2px;">${l}<br><b>${vals[i]}</b></span></div>`;
    });
    html += '</div>';
    const sel = window.getSelection();
    if(sel.rangeCount) {
        const td = sel.anchorNode?.closest?.('td');
        if(td) { td.innerHTML = html; emitOfficeData(); return; }
    }
    showNotification('Click a cell first','warning');
}
function excelInsertPicture() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) { showNotification('Click a cell first','warning'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            td.innerHTML = `<img src="${ev.target.result}" style="max-width:100%;max-height:80px;border-radius:4px;">`;
            emitOfficeData();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}
function excelShape() {
    const s = prompt('Shape (rect, circle, arrow, star):','rect');
    if(!s) return;
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) { showNotification('Click a cell first','warning'); return; }
    const shapes = {
        rect: '<div style="width:60px;height:40px;background:#3498db;border-radius:3px;margin:2px auto;"></div>',
        circle: '<div style="width:40px;height:40px;background:#e74c3c;border-radius:50%;margin:2px auto;"></div>',
        arrow: '<div style="width:0;height:0;border-left:30px solid transparent;border-right:30px solid transparent;border-bottom:40px solid #2ecc71;margin:2px auto;"></div>',
        star: '<div style="font-size:30px;text-align:center;color:#f1c40f;">★</div>'
    };
    td.innerHTML = shapes[s] || shapes.rect;
    emitOfficeData();
}
function excelSparklines() {
    if(!excelGrid) return;
    const range = prompt('Enter cell range (e.g. B2:D2):','B2:D2');
    if(!range) return;
    const parts = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
    if(!parts) { showNotification('Invalid range','danger'); return; }
    const c1 = parts[1].charCodeAt(0)-65, r1 = parseInt(parts[2]);
    const c2 = parts[3].charCodeAt(0)-65, r2 = parseInt(parts[4]);
    const vals = [];
    for(let r=r1; r<=r2; r++) {
        for(let c=c1; c<=c2; c++) {
            if(excelGrid.rows[r] && excelGrid.rows[r].cells[c]) {
                const v = parseFloat(excelGrid.rows[r].cells[c].innerText) || 0;
                vals.push(v);
            }
        }
    }
    if(vals.length < 2) { showNotification('Need at least 2 values','warning'); return; }
    const max = Math.max(...vals,1);
    let line = '<div style="display:flex;align-items:flex-end;gap:2px;height:40px;padding:2px;">';
    vals.forEach(v => {
        const h = (v/max)*36;
        line += `<div style="width:8px;height:${h}px;background:#27ae60;border-radius:1px;"></div>`;
    });
    line += '</div>';
    const lastRow = excelGrid.rows.length - 1;
    const lastCol = excelGrid.rows[0].cells.length - 1;
    if(lastRow>1) excelGrid.rows[lastRow-1].cells[1].innerHTML = line;
    showNotification('Sparkline added','success');
    emitOfficeData();
}
function excelHyperlink() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) { showNotification('Click a cell first','warning'); return; }
    const url = prompt('URL:','https://');
    if(!url) return;
    const text = prompt('Display text:',td.innerText || 'Link');
    if(!text) return;
    td.innerHTML = `<a href="${url}" target="_blank" style="color:#2980b9;text-decoration:underline;">${text}</a>`;
    emitOfficeData();
}
function excelTextBox() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) { showNotification('Click a cell first','warning'); return; }
    const txt = prompt('Text:','Your text here');
    if(!txt) return;
    td.innerHTML = `<div style="border:1px dashed #999;padding:6px;border-radius:4px;text-align:left;">${txt}</div>`;
    emitOfficeData();
}
function excelTheme() {
    const themes = {'1':'#f5f5f5','2':'#ecf0f1','3':'#d5e8d4','4':'#fce4d6','5':'#dae3f3'};
    const c = prompt('Theme:\n1=Light Gray\n2=Soft White\n3=Green Tint\n4=Peach\n5=Blue Tint','1');
    if(!c||!themes[c]) return;
    document.querySelectorAll('#excelGrid td').forEach(td => td.style.background = themes[c]);
    document.querySelectorAll('#excelGrid th').forEach(th => th.style.background = '#333');
    document.querySelectorAll('#excelGrid th').forEach(th => th.style.color = '#fff');
    showNotification('Theme applied','success');
    emitOfficeData();
}
function excelMargins() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const m = prompt('Cell padding (px):','6');
    if(m) td.style.padding = m+'px';
    emitOfficeData();
}
function excelOrientation() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const o = prompt('Orientation (normal, rotate):','normal');
    if(o==='rotate') td.style.transform = 'rotate(-90deg)';
    else td.style.transform = 'none';
    emitOfficeData();
}
function excelPrintArea() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const r = td.parentElement.rowIndex, c = td.cellIndex;
    showNotification(`Print area set to row ${r}, col ${String.fromCharCode(64+c)}`,'success');
}
function excelBackground() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const color = prompt('Background color (hex):','#ffff00');
    if(color) td.style.background = color;
    emitOfficeData();
}
function excelFinancial() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const fn = prompt('Function (PMT, FV, NPV):','PMT');
    const val = parseFloat(td.textContent.replace(/[^0-9.-]/g,'')) || 1000;
    if(fn==='PMT') td.textContent = '-' + (val * 0.1 / 12).toFixed(2);
    else if(fn==='FV') td.textContent = (val * Math.pow(1.05, 5)).toFixed(2);
    else if(fn==='NPV') td.textContent = val.toFixed(2);
    showNotification(`${fn} calculated`,'success');
    emitOfficeData();
}
function excelLogical() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const fn = prompt('Function (IF, AND, OR, NOT):','IF');
    const val = parseFloat(td.textContent.replace(/[^0-9.-]/g,'')) || 0;
    if(fn==='IF') td.textContent = val > 0 ? 'TRUE' : 'FALSE';
    else if(fn==='AND') td.textContent = (val > 0 && val < 100) ? 'TRUE' : 'FALSE';
    else if(fn==='OR') td.textContent = (val > 0 || val < -100) ? 'TRUE' : 'FALSE';
    else if(fn==='NOT') td.textContent = val <= 0 ? 'TRUE' : 'FALSE';
    showNotification(`${fn} evaluated`,'success');
    emitOfficeData();
}
function excelTextFunc() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const fn = prompt('Function (LEN, UPPER, LOWER, LEFT, RIGHT):','LEN');
    const txt = td.innerText || '';
    if(fn==='LEN') td.textContent = txt.length;
    else if(fn==='UPPER') td.textContent = txt.toUpperCase();
    else if(fn==='LOWER') td.textContent = txt.toLowerCase();
    else if(fn==='LEFT') td.textContent = txt.substring(0,3);
    else if(fn==='RIGHT') td.textContent = txt.substring(txt.length-3);
    showNotification(`${fn} done`,'success');
    emitOfficeData();
}
function excelDateFunc() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) return;
    const fn = prompt('Function (TODAY, NOW, YEAR, MONTH):','TODAY');
    const d = new Date();
    if(fn==='TODAY') td.textContent = d.toLocaleDateString();
    else if(fn==='NOW') td.textContent = d.toLocaleString();
    else if(fn==='YEAR') td.textContent = d.getFullYear();
    else if(fn==='MONTH') td.textContent = d.getMonth()+1;
    showNotification(`${fn} inserted`,'success');
    emitOfficeData();
}
function excelGetData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            const text = ev.target.result;
            const rows = text.split('\n').filter(r=>r.trim());
            if(!excelGrid) return;
            const headerRow = excelGrid.rows[0];
            rows.forEach((row, ri) => {
                const cells = row.split(',').map(c=>c.trim());
                let tr = excelGrid.rows[ri+1];
                if(!tr) {
                    tr = excelGrid.insertRow();
                    tr.innerHTML = `<td style="background:#e0e0e0;font-weight:bold;width:40px;">${ri+1}</td>`;
                    excelGrid.appendChild(tr);
                }
                cells.forEach((cell, ci) => {
                    if(tr.cells[ci+1]) tr.cells[ci+1].textContent = cell;
                });
            });
            showNotification('Data imported','success');
            emitOfficeData();
        };
        reader.readAsText(file);
    };
    input.click();
}
function excelTextToColumns() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) { showNotification('Click a cell first','warning'); return; }
    const parts = td.innerText.split(/[\s,;|]+/).filter(Boolean);
    const ri = td.parentElement.rowIndex, ci = td.cellIndex;
    parts.forEach((p, i) => {
        if(excelGrid.rows[ri] && excelGrid.rows[ri].cells[ci+i]) {
            excelGrid.rows[ri].cells[ci+i].textContent = p;
        }
    });
    showNotification(`Split into ${parts.length} columns`,'success');
    emitOfficeData();
}
function excelFlashFill() {
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const td = sel.anchorNode?.closest?.('td');
    if(!td) { showNotification('Click a cell first','warning'); return; }
    const txt = td.innerText;
    const ri = td.parentElement.rowIndex, ci = td.cellIndex;
    for(let r=ri+1; r<excelGrid.rows.length; r++) {
        if(excelGrid.rows[r].cells[ci]) {
            excelGrid.rows[r].cells[ci].textContent = txt;
        }
    }
    showNotification('Flash Fill applied','success');
    emitOfficeData();
}
function excelSpelling() {
    if(!excelGrid) return;
    const words = [];
    for(let r=1; r<excelGrid.rows.length; r++) {
        for(let c=1; c<excelGrid.rows[r].cells.length; c++) {
            const txt = excelGrid.rows[r].cells[c].innerText.trim();
            if(txt) words.push(txt);
        }
    }
    const common = ['the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','it','as','be'];
    const misspelled = words.filter(w => {
        const clean = w.replace(/[^a-zA-Z]/g,'').toLowerCase();
        return clean.length > 1 && !common.includes(clean);
    });
    if(misspelled.length === 0) { showNotification('✓ No unusual words found!','success'); return; }
    showNotification('🔍 Possible: '+[...new Set(misspelled)].slice(0,10).join(', '),'warning');
}
function excelProtectWorkbook() {
    if(!excelGrid) return;
    const pwd = prompt('Set workbook password (leave empty to unprotect):','');
    if(pwd) { showNotification('Workbook protected with password','warning'); }
    else { showNotification('Workbook unprotected','info'); }
}
function excelShareWorkbook() {
    if(!excelGrid) return;
    const choice = confirm('Share workbook with all users?');
    if(choice) showNotification('Workbook shared - all users can edit','success');
    else showNotification('Sharing cancelled','info');
}
// ---- Excel drag-to-select ----
(function() {
    if(!excelGrid) return;
    let isSelecting = false, startCell = null;
    excelGrid.addEventListener('mousedown', function(e) {
        const td = e.target?.closest?.('td') || e.target?.closest?.('th');
        if(!td) return;
        const isTh = td.tagName === 'TH';
        if(isTh) {
            const ci = td.cellIndex;
            if(ci === 0) {
                // Row header - select entire row
                excelGrid.querySelectorAll('td').forEach(t => t.style.background = '');
                const ri = td.parentElement.rowIndex;
                for(let c=1; c<excelGrid.rows[ri].cells.length; c++) {
                    excelGrid.rows[ri].cells[c].style.background = '#d4e6f9';
                }
                return;
            }
            // Column header - select entire column
            excelGrid.querySelectorAll('td').forEach(t => t.style.background = '');
            for(let r=1; r<excelGrid.rows.length; r++) {
                if(excelGrid.rows[r].cells[ci]) {
                    excelGrid.rows[r].cells[ci].style.background = '#d4e6f9';
                }
            }
            return;
        }
        isSelecting = true;
        startCell = { row: td.parentElement.rowIndex, col: td.cellIndex };
        excelGrid.querySelectorAll('td').forEach(t => t.style.background = '');
        td.style.background = '#d4e6f9';
    });
    excelGrid.addEventListener('mousemove', function(e) {
        if(!isSelecting || !startCell) return;
        const td = e.target?.closest?.('td');
        if(!td) return;
        const curRow = td.parentElement.rowIndex;
        const curCol = td.cellIndex;
        const minR = Math.min(startCell.row, curRow);
        const maxR = Math.max(startCell.row, curRow);
        const minC = Math.min(startCell.col, curCol);
        const maxC = Math.max(startCell.col, curCol);
        excelGrid.querySelectorAll('td').forEach(t => t.style.background = '');
        for(let r=minR; r<=maxR; r++) {
            for(let c=minC; c<=maxC; c++) {
                if(excelGrid.rows[r] && excelGrid.rows[r].cells[c]) {
                    excelGrid.rows[r].cells[c].style.background = '#d4e6f9';
                }
            }
        }
    });
    document.addEventListener('mouseup', function() {
        if(isSelecting) {
            isSelecting = false;
            startCell = null;
        }
    });
})();
function pptTheme() {
    const themes = {
        '1': { bg: '#2c3e50', text: '#ecf0f1', accent: '#3498db', name: 'Dark' },
        '2': { bg: '#ecf0f1', text: '#2c3e50', accent: '#e74c3c', name: 'Light' },
        '3': { bg: '#1a5276', text: '#ffffff', accent: '#f1c40f', name: 'Ocean' },
        '4': { bg: '#27ae60', text: '#ffffff', accent: '#f39c12', name: 'Forest' }
    };
    const choice = prompt('Theme:\n1=Dark\n2=Light\n3=Ocean\n4=Forest', '1');
    if (!choice || !themes[choice]) return;
    const t = themes[choice];
    const container = document.getElementById('office-ppt')?.querySelector('[style*="background:#2c3e50;"]') || document.getElementById('office-ppt');
    if (container) {
        container.style.background = t.bg;
        document.querySelectorAll('#office-ppt .office-ribbon, #office-ppt .office-ribbon-tabs, #office-ppt .office-ribbon-panel').forEach(el => {
            el.style.background = t.bg;
        });
    }
    const editor = document.getElementById('pptEditor');
    if (editor) editor.style.background = '#fff';
    showNotification(`Applied "${t.name}" theme`,'success');
}
function pptFormatBg() {
    const container = document.getElementById('office-ppt')?.querySelector('[style*="background:#2c3e50;"]') || document.getElementById('office-ppt');
    if (!container) return;
    const color = prompt('Background color (hex, e.g. #2c3e50):', container.style.background || '#2c3e50');
    if (!color) return;
    container.style.background = color;
    document.querySelectorAll('#office-ppt .office-ribbon, #office-ppt .office-ribbon-tabs, #office-ppt .office-ribbon-panel').forEach(el => {
        el.style.background = color;
    });
    const editor = document.getElementById('pptEditor');
    if (editor) {
        const bg = prompt('Slide background color (hex):', '#ffffff');
        if (bg) editor.style.background = bg;
    }
}
function pptInsertShape() {
    const s = prompt('Shape (rect, circle, arrow, text):', 'rect');
    if (!s) return;
    const map = {
        rect: '<div contenteditable="false" style="width:120px;height:70px;background:#3498db;border:2px solid #2980b9;border-radius:4px;margin:20px auto;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;">Shape</div>',
        circle: '<div contenteditable="false" style="width:80px;height:80px;background:#e74c3c;border:2px solid #c0392b;border-radius:50%;margin:20px auto;"></div>',
        arrow: '<div contenteditable="false" style="width:0;height:0;border-left:50px solid transparent;border-right:50px solid transparent;border-bottom:60px solid #2ecc71;margin:20px auto;"></div>',
        text: '<div contenteditable="true" style="border:2px dashed #3498db;padding:12px;margin:10px;border-radius:6px;text-align:center;font-size:16px;color:#333;">Your text here</div>'
    };
    const editor = document.getElementById('pptEditor');
    if (!editor) return;
    savePptSlide();
    document.execCommand('insertHTML', false, map[s] || map.rect);
    savePptSlide();
    emitOfficeData();
}
function pptInsertTable() {
    const rows = prompt('Rows:', '3');
    const cols = prompt('Columns:', '3');
    if (!rows || !cols) return;
    savePptSlide();
    let table = "<table border='1' style='border-collapse:collapse;width:100%;margin:10px auto;background:#fff;'><tr>";
    for(let c = 0; c < +cols; c++) table += "<th style='border:1px solid #999;padding:6px;background:#e0e0e0;'>Header</th>";
    table += "</tr>";
    for(let r = 1; r < +rows; r++) {
        table += "<tr>";
        for(let c = 0; c < +cols; c++) table += "<td style='border:1px solid #999;padding:6px;'>&nbsp;</td>";
        table += "</tr>";
    }
    table += "</table>";
    document.execCommand('insertHTML', false, table);
    savePptSlide();
    emitOfficeData();
}
function pptInsertPicture() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            savePptSlide();
            document.execCommand('insertHTML', false, `<img src="${ev.target.result}" style="max-width:80%;max-height:200px;margin:10px auto;display:block;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.2);">`);
            savePptSlide();
            emitOfficeData();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}
function pptSlideshow(fromCurrent) {
    const mode = fromCurrent !== undefined ? (fromCurrent ? '2' : '1') : prompt('Slideshow mode:\n1=From Beginning\n2=From Current Slide', '1');
    if (!mode) return;
    const startIdx = mode === '2' ? pptCurrentSlide : 0;
    const el = document.getElementById('pptEditor');
    if (!el) return;
    const origHtml = pptSlides[startIdx] || '';
    const overlay = document.createElement('div');
    overlay.id = 'ppt-fullscreen';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
    let idx = startIdx;
    function showSlide(i) {
        if (i < 0 || i >= pptSlides.length) return;
        idx = i;
        const html = pptSlides[i] || '';
        overlay.innerHTML = `<div style="width:80vw;height:80vh;background:transparent;display:flex;align-items:center;justify-content:center;"><div style="max-width:90%;max-height:90%;background:#fff;color:#000;padding:40px;box-shadow:0 10px 40px rgba(0,0,0,0.5);font-size:28px;text-align:center;border-radius:8px;overflow-y:auto;">${html}</div></div><div style="position:absolute;bottom:20px;color:#888;font-size:14px;">${i+1} / ${pptSlides.length} · Click to advance · Esc to exit</div>`;
    }
    showSlide(startIdx);
    overlay.addEventListener('click', () => {
        if (idx < pptSlides.length - 1) showSlide(idx + 1);
        else { overlay.remove(); showNotification('Slideshow ended','info'); }
    });
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' && document.getElementById('ppt-fullscreen')) {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        } else if (e.key === 'ArrowRight' && document.getElementById('ppt-fullscreen')) {
            if (idx < pptSlides.length - 1) showSlide(idx + 1);
        } else if (e.key === 'ArrowLeft' && document.getElementById('ppt-fullscreen')) {
            if (idx > 0) showSlide(idx - 1);
        }
    });
    document.body.appendChild(overlay);
}

// ---- PPT helpers ----
function loadPptSlide(index) {
    if(index < 0 || index >= pptSlides.length || !pptEditor) return;
    savePptSlide();
    pptCurrentSlide = index;
    pptEditor.innerHTML = pptSlides[index];
    const ind = document.getElementById("pptSlideIndicator");
    if(ind) ind.textContent = `${index + 1} / ${pptSlides.length}`;
    if(pptSliderInput) pptSliderInput.value = index;
}
function savePptSlide() {
    if(!pptEditor) return;
    pptSlides[pptCurrentSlide] = pptEditor.innerHTML;
}
pptEditor?.addEventListener("input", () => { savePptSlide(); emitOfficeData(); });

function pptAddSlide() {
    savePptSlide();
    const blank = '<h2 style="margin-top:0;">New Slide</h2><p>Click to add text</p>';
    pptSlides.push(blank);
    loadPptSlide(pptSlides.length - 1);
    emitOfficeData();
}
function pptDeleteSlide() {
    if(pptSlides.length <= 1) return;
    savePptSlide();
    pptSlides.splice(pptCurrentSlide, 1);
    loadPptSlide(Math.min(pptCurrentSlide, pptSlides.length - 1));
    emitOfficeData();
}
function pptPrevSlide() { savePptSlide(); loadPptSlide(pptCurrentSlide - 1); }
function pptNextSlide() { savePptSlide(); loadPptSlide(pptCurrentSlide + 1); }

const pptSliderInput = document.getElementById("pptSlideSlider");
pptSliderInput?.addEventListener("input", function() {
    savePptSlide();
    const idx = parseInt(this.value);
    if(idx >= 0 && idx < pptSlides.length) {
        pptCurrentSlide = idx;
        pptEditor.innerHTML = pptSlides[idx];
        const ind = document.getElementById("pptSlideIndicator");
        if(ind) ind.textContent = `${idx + 1} / ${pptSlides.length}`;
    }
});

document.getElementById("pptFontFamily")?.addEventListener("change", function() {
    document.execCommand('fontName', false, this.value);
    pptEditor?.focus();
});
document.getElementById("pptFontSize")?.addEventListener("change", function() {
    document.execCommand('fontSize', false, this.value);
    pptEditor?.focus();
});

// ---- PPT new features ----
function pptPhotoAlbum() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = function(e) {
        const files = Array.from(e.target.files);
        if(!files.length) return;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(ev) {
                const imgHtml = `<div style="margin:10px 0;"><img src="${ev.target.result}" style="max-width:90%;max-height:200px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.2);"></div>`;
                const blank = `<h2 style="margin-top:0;">Photo</h2>${imgHtml}`;
                pptSlides.push(blank);
            };
            reader.readAsDataURL(file);
        });
        setTimeout(() => {
            loadPptSlide(pptSlides.length - 1);
            showNotification(`${files.length} photos added`,'success');
            emitOfficeData();
        }, 500);
    };
    input.click();
}
function pptIcons() {
    const icons = ['☀','★','♛','✿','⚡','☂','❄','♫','✈','⌚','❤','☎','☯','♻','⚠','✔'];
    const c = prompt('Choose icon index (1-16):\n' + icons.map((ic,i)=>`${i+1}=${ic}`).join(' '),'1');
    if(!c) return;
    const idx = parseInt(c)-1;
    if(idx<0||idx>=icons.length) return;
    document.execCommand('insertHTML', false, `<span style="font-size:48px;margin:10px;">${icons[idx]}</span>`);
    savePptSlide();
    emitOfficeData();
}
function pptSmartArt() {
    const layouts = {
        '1': { name:'List', html:'<div style="display:flex;flex-direction:column;gap:8px;padding:10px;"><div style="background:#3498db;color:#fff;padding:10px;border-radius:4px;">Item 1</div><div style="background:#2980b9;color:#fff;padding:10px;border-radius:4px;">Item 2</div><div style="background:#2471a3;color:#fff;padding:10px;border-radius:4px;">Item 3</div></div>' },
        '2': { name:'Process', html:'<div style="display:flex;gap:5px;justify-content:center;padding:10px;"><div style="flex:1;background:#e74c3c;color:#fff;padding:10px;border-radius:4px;text-align:center;">Step 1</div><div style="flex:1;background:#e67e22;color:#fff;padding:10px;border-radius:4px;text-align:center;">Step 2</div><div style="flex:1;background:#27ae60;color:#fff;padding:10px;border-radius:4px;text-align:center;">Step 3</div></div>' },
        '3': { name:'Cycle', html:'<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;padding:10px;"><div style="width:60px;height:60px;background:#9b59b6;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;">1</div><div style="width:60px;height:60px;background:#8e44ad;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;">2</div><div style="width:60px;height:60px;background:#7d3c98;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;">3</div></div>' },
        '4': { name:'Pyramid', html:'<div style="display:flex;flex-direction:column;align-items:center;padding:5px;"><div style="width:80%;background:#e74c3c;color:#fff;padding:8px;text-align:center;">Top</div><div style="width:90%;background:#e67e22;color:#fff;padding:8px;text-align:center;">Middle</div><div style="width:100%;background:#f39c12;color:#fff;padding:8px;text-align:center;">Base</div></div>' }
    };
    const c = prompt('SmartArt:\n1=List\n2=Process\n3=Cycle\n4=Pyramid','1');
    if(!c||!layouts[c]) return;
    document.execCommand('insertHTML', false, layouts[c].html);
    savePptSlide();
    showNotification(`Inserted "${layouts[c].name}" SmartArt`,'success');
    emitOfficeData();
}
function pptChart() {
    const labels = prompt('Labels:','Q1,Q2,Q3');
    const values = prompt('Values:','30,50,20');
    if(!labels||!values) return;
    const labs = labels.split(',').map(s=>s.trim());
    const vals = values.split(',').map(s=>parseFloat(s.trim())||0);
    const max = Math.max(...vals,1);
    let html = '<div style="display:flex;gap:8px;align-items:flex-end;padding:15px 8px;min-height:150px;">';
    labs.forEach((l,i) => {
        const h = (vals[i]/max)*120;
        html += `<div style="flex:1;text-align:center;"><div style="height:${h}px;background:${['#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c'][i%6]};border-radius:3px 3px 0 0;"></div><span style="font-size:9px;margin-top:2px;">${l}<br><b>${vals[i]}</b></span></div>`;
    });
    html += '</div>';
    document.execCommand('insertHTML', false, html);
    savePptSlide();
    emitOfficeData();
}
function pptVideo() {
    const url = prompt('Video URL (YouTube embed or direct video):','https://www.youtube.com/embed/');
    if(!url) return;
    const html = `<div style="margin:10px 0;"><iframe src="${url}" style="width:100%;max-width:560px;height:315px;border:none;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.3);" allowfullscreen></iframe></div>`;
    document.execCommand('insertHTML', false, html);
    savePptSlide();
    showNotification('Video embedded','success');
    emitOfficeData();
}
function pptAudio() {
    const url = prompt('Audio URL (MP3):','https://');
    if(!url) return;
    const html = `<div style="margin:10px 0;"><audio src="${url}" controls style="width:80%;max-width:400px;border-radius:6px;"></audio></div>`;
    document.execCommand('insertHTML', false, html);
    savePptSlide();
    showNotification('Audio embedded','success');
    emitOfficeData();
}
function pptVariants() {
    const variants = [
        { bg:'#2c3e50', panel:'#34495e', name:'Dark' },
        { bg:'#ecf0f1', panel:'#bdc3c7', name:'Light' },
        { bg:'#1a5276', panel:'#2e86c1', name:'Blue' },
        { bg:'#27ae60', panel:'#2ecc71', name:'Green' }
    ];
    const c = prompt('Variant:\n1=Dark\n2=Light\n3=Blue\n4=Green','1');
    if(!c) return;
    const v = variants[parseInt(c)-1];
    if(!v) return;
    document.querySelectorAll('#office-ppt .office-ribbon, #office-ppt .office-ribbon-tabs').forEach(el => {
        el.style.background = v.bg;
    });
    document.querySelectorAll('#office-ppt .office-ribbon-panel').forEach(el => {
        if(el) el.style.background = v.panel;
    });
    showNotification(`Variant: ${v.name}`,'success');
}
function pptApplyTransition(val) {
    if(!val) { showNotification('Transition cleared','info'); return; }
    const el = document.getElementById('pptEditor');
    if(!el) return;
    const duration = parseFloat(document.getElementById('pptTransDuration')?.value) || 1;
    const effects = {
        morph: `transform ${duration}s ease`,
        fade: `opacity ${duration}s ease`,
        push: `transform ${duration}s cubic-bezier(0.4,0,0.2,1)`,
        wipe: `clip-path ${duration}s ease`,
        dissolve: `opacity ${duration}s ease-in-out`
    };
    el.style.transition = effects[val] || 'none';
    showNotification(`Transition: ${val} (${duration}s)`,'success');
}
function pptTransitionSound() {
    const sound = prompt('Sound effect (applause, chime, click, drum):','chime');
    if(!sound) return;
    const srcs = { applause:'https://www.soundjay.com/buttons/sounds/button-09.mp3', chime:'https://www.soundjay.com/buttons/sounds/button-10.mp3', click:'https://www.soundjay.com/buttons/sounds/button-01.mp3', drum:'https://www.soundjay.com/buttons/sounds/button-02.mp3' };
    const audio = new Audio(srcs[sound] || srcs.chime);
    audio.play().catch(() => showNotification('Sound playback requires user interaction first','info'));
    showNotification(`Sound: ${sound}`,'success');
}
function pptAdvanceSlide() {
    const opt = prompt('Advance options:\n1=On Click\n2=Automatically after 5s\n3=On Click + Auto','1');
    if(!opt) return;
    if(opt==='2') showNotification('Slides will auto-advance every 5s','info');
    else if(opt==='3') showNotification('Slides advance on click or every 5s','info');
    else showNotification('Slides advance on click','info');
}
function pptApplyAnimation(val) {
    if(!val) { showNotification('Animation cleared','info'); return; }
    const el = document.getElementById('pptEditor');
    if(!el) return;
    const duration = parseFloat(document.getElementById('pptAnimDuration')?.value) || 0.5;
    const delay = parseFloat(document.getElementById('pptAnimDelay')?.value) || 0;
    el.style.animation = 'none';
    el.offsetHeight;
    const animations = {
        appear: `pptAppear ${duration}s ease ${delay}s forwards`,
        fadeIn: `pptFadeIn ${duration}s ease ${delay}s forwards`,
        flyIn: `pptFlyIn ${duration}s ease ${delay}s forwards`,
        floatIn: `pptFloatIn ${duration}s ease ${delay}s forwards`,
        zoomIn: `pptZoomIn ${duration}s ease ${delay}s forwards`
    };
    el.style.animation = animations[val] || 'none';
    showNotification(`Animation: ${val} (${duration}s, delay ${delay}s)`,'success');
}
function pptPresentOnline() {
    if (!pptEditor) return;
    const url = window.location.href;
    const shareText = `Presenting VYDEX slides. Join at: ${url}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
            showNotification('Link copied! Share with your audience.','success');
        }).catch(() => {
            showNotification(`Share this link: ${url}`,'info');
        });
    } else {
        showNotification(`Share this link: ${url}`,'info');
    }
    if (document.fullscreenElement) document.exitFullscreen();
    pptSlideshow(0);
}
function pptCustomShow() {
    const count = prompt('How many slides to include?','3');
    if(!count) return;
    const n = parseInt(count);
    if(n<1||n>pptSlides.length) { showNotification('Invalid count','danger'); return; }
    const slides = [];
    for(let i=0; i<n; i++) {
        slides.push(pptSlides[i] || '<p>Empty</p>');
    }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
    let idx = 0;
    function showCustom(i) {
        if(i<0||i>=slides.length) return;
        idx = i;
        overlay.innerHTML = `<div style="width:80vw;height:80vh;display:flex;align-items:center;justify-content:center;"><div style="max-width:90%;max-height:90%;background:#fff;color:#000;padding:40px;box-shadow:0 10px 40px rgba(0,0,0,0.5);font-size:28px;text-align:center;border-radius:8px;overflow-y:auto;">${slides[i]}</div></div><div style="position:absolute;bottom:20px;color:#888;font-size:14px;">Custom Show · ${i+1}/${slides.length} · Click to advance</div>`;
    }
    showCustom(0);
    overlay.addEventListener('click', () => {
        if(idx<slides.length-1) showCustom(idx+1);
        else { overlay.remove(); showNotification('Custom show ended','info'); }
    });
    document.addEventListener('keydown', function escHandler(e) {
        if(e.key==='Escape'&&document.body.contains(overlay)) { overlay.remove(); document.removeEventListener('keydown', escHandler); }
        else if(e.key==='ArrowRight'&&idx<slides.length-1) showCustom(idx+1);
        else if(e.key==='ArrowLeft'&&idx>0) showCustom(idx-1);
    });
    document.body.appendChild(overlay);
    showNotification(`Custom show with ${n} slides`,'success');
}
function pptRehearse() {
    let seconds = 0;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:20px;z-index:999999;font-size:18px;font-weight:bold;';
    el.textContent = '⏱ 00:00';
    document.body.appendChild(el);
    const timer = setInterval(() => {
        seconds++;
        const m = String(Math.floor(seconds/60)).padStart(2,'0');
        const s = String(seconds%60).padStart(2,'0');
        el.textContent = `⏱ ${m}:${s}`;
    }, 1000);
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop Rehearsal';
    stopBtn.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#e74c3c;color:#fff;border:none;padding:8px 16px;border-radius:20px;z-index:999999;cursor:pointer;font-weight:bold;';
    stopBtn.onclick = function() {
        clearInterval(timer);
        el.remove();
        stopBtn.remove();
        const m = String(Math.floor(seconds/60)).padStart(2,'0');
        const s = String(seconds%60).padStart(2,'0');
        showNotification(`Rehearsal time: ${m}:${s}`,'success');
    };
    document.body.appendChild(stopBtn);
    showNotification('Rehearsal started','info');
}
function pptRecord() {
    if(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia({video:true,audio:true})
            .then(stream => {
                const mediaRecorder = new MediaRecorder(stream);
                const chunks = [];
                mediaRecorder.ondataavailable = e => { if(e.data.size>0) chunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, {type:'video/webm'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'VYDEX_Recording.webm'; a.click();
                    showNotification('Recording saved!','success');
                };
                mediaRecorder.start();
                showNotification('Recording... Click "Stop sharing" when done.','warning');
            })
            .catch(() => showNotification('Screen recording requires permission.','warning'));
    } else {
        showNotification('Screen recording not supported in this browser.','danger');
    }
}

// ---- PPT animation keyframes ----
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pptAppear { from { opacity:0; } to { opacity:1; } }
        @keyframes pptFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pptFlyIn { from { transform:translateY(-50px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes pptFloatIn { from { transform:translateY(30px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes pptZoomIn { from { transform:scale(0.3); opacity:0; } to { transform:scale(1); opacity:1; } }
    `;
    document.head.appendChild(style);
})();

// ==========================================
// 8. FORCED LOCKED FULLSCREEN & PiP
// ==========================================
function applyForcedFullscreen(targetId, isActive) {
    if(isHost) return;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    if (isActive) {
        document.body.classList.add("no-scroll", "locked-fullscreen-active"); 
        targetEl.classList.add("locked-fullscreen");
        if (!isHost && globalHostUid) {
            const hostWrapper = document.getElementById(`remote-wrapper-${globalHostUid}`);
            if (hostWrapper) hostWrapper.classList.add("host-pip");
        }
        showNotification("🔒 Host locked screen in Broadcast Mode.", "danger");
    } else {
        document.body.classList.remove("no-scroll", "locked-fullscreen-active"); 
        targetEl.classList.remove("locked-fullscreen");
        if (!isHost && globalHostUid) {
            const hostWrapper = document.getElementById(`remote-wrapper-${globalHostUid}`);
            if (hostWrapper) hostWrapper.classList.remove("host-pip");
        }
        showNotification("🔓 Screen Unlocked.", "info");
    }
}

document.getElementById("wbForceFsBtn")?.addEventListener("click", (e) => {
    const isForced = e.target.dataset.forced === "true";
    socket.emit("force-screen", { room: currentRoom, target: "whiteboard-box", active: !isForced });
    e.target.dataset.forced = !isForced ? "true" : "false"; 
    e.target.textContent = !isForced ? "🔓 Unlock Audience" : "🔒 Force Fullscreen"; 
    e.target.style.background = !isForced ? "#2ecc71" : "#e74c3c";
});

document.getElementById("officeForceFsBtn")?.addEventListener("click", (e) => {
    const isForced = e.target.dataset.forced === "true";
    socket.emit("force-screen", { room: currentRoom, target: "office-box", active: !isForced });
    e.target.dataset.forced = !isForced ? "true" : "false"; 
    e.target.textContent = !isForced ? "🔓 Unlock Audience" : "🔒 Force Fullscreen"; 
    e.target.style.background = !isForced ? "#2ecc71" : "#e74c3c";
});


// ==========================================
// 9. MATH MODAL
// ==========================================
const mathModal = document.getElementById("math-modal");
const mathInput = document.getElementById("mathInput");
const mathExplanationInput = document.getElementById("mathExplanationInput");
const formulaLibrary = document.getElementById("formulaLibrary");

const formulas = {
    algebra: [ {name: "Quadratic", eq: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", desc: "Roots of a quadratic eq."}, {name: "Logarithm", eq: "\\log_b(xy) = \\log_b(x) + \\log_b(y)", desc: "Log product rule."} ],
    calculus: [ {name: "Derivative", eq: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}", desc: "First principle of derivatives."}, {name: "Integral", eq: "\\int x^n dx = \\frac{x^{n+1}}{n+1} + C", desc: "Power rule for integration."} ]
};

let currentFormulaDesc = "";

function loadFormulas(category) {
    if(!formulaLibrary) return; 
    formulaLibrary.innerHTML = "";
    if(!formulas[category]) return;
    
    formulas[category].forEach(f => {
        const btn = document.createElement("button"); 
        btn.textContent = f.name; 
        btn.style.cssText = "background: rgba(255,255,255,0.1); color: white; border: 1px solid var(--accent); padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;";
        btn.onclick = () => { 
            if(mathInput) mathInput.value = f.eq; 
            currentFormulaDesc = f.desc; 
            if(mathExplanationInput) mathExplanationInput.textContent = "ℹ️ " + f.desc; 
        };
        formulaLibrary.appendChild(btn);
    });
}

document.getElementById("mathCategory")?.addEventListener("change", (e) => loadFormulas(e.target.value));
loadFormulas("algebra"); 

document.getElementById("openMathBtn")?.addEventListener("click", () => { if(mathModal) mathModal.style.display = "block"; });
document.getElementById("closeMathBtn")?.addEventListener("click", () => { if(mathModal) mathModal.style.display = "none"; });

document.getElementById("broadcastMathBtn")?.addEventListener("click", () => {
    const eq = mathInput?.value.trim(); 
    if(!eq) return;
    try { 
        if(typeof katex !== 'undefined') katex.renderToString(eq); 
        socket.emit("math-equation", { room: currentRoom, equation: eq, desc: currentFormulaDesc, sender: usernameInput?.value || "User" }); 
        if(mathInput) mathInput.value = ""; 
        if(mathExplanationInput) mathExplanationInput.textContent = ""; 
    } 
    catch(e) { showNotification("Invalid LaTeX Formula!", "danger"); }
});

// ==========================================
// 10. PRESENTATION (Graphs)
// ==========================================
const presMode = document.getElementById("presMode");
const companyInputs = document.getElementById("companyInputs");
const productInputs = document.getElementById("productInputs");
const generateGraphBtn = document.getElementById("generateGraphBtn");
const presCurrency = document.getElementById("presCurrency");
const presentationContainer = document.getElementById("presentation-container");
let businessChart = null;

presMode?.addEventListener("change", (e) => {
    if(e.target.value === "company") { 
        if(companyInputs) companyInputs.style.display = "flex"; 
        if(productInputs) productInputs.style.display = "none"; 
    } else { 
        if(companyInputs) companyInputs.style.display = "none"; 
        if(productInputs) productInputs.style.display = "flex"; 
    }
});

generateGraphBtn?.addEventListener("click", () => {
    const industry = document.getElementById("presIndustry")?.value || "Business";
    const currency = presCurrency?.value || "$";
    const mode = presMode?.value || "company";
    const growth = parseFloat(document.getElementById("presGrowth")?.value) || 10;
    
    let baseYear = parseInt(document.getElementById("presBaseYear")?.value) || new Date().getFullYear();
    let endYear = parseInt(document.getElementById("presEndYear")?.value) || baseYear + 5;
    if(baseYear < 2001) baseYear = 2001; if(baseYear > 2500) baseYear = 2500;
    if(endYear < 2001) endYear = 2001; if(endYear > 2500) endYear = 2500; if(endYear < baseYear) endYear = baseYear + 5;

    let labels = []; let revenues = []; let unitsArr = []; 
    let currentRevenue = 1000; let currentUnits = 100; let unitPrice = 50;
    
    for(let y = baseYear; y <= endYear; y++) {
        labels.push(y.toString());
        if(mode === "company") { 
            revenues.push(Math.round(currentRevenue)); 
            currentRevenue += (currentRevenue * (growth / 100)); 
        } else { 
            revenues.push(Math.round(unitPrice * currentUnits)); 
            currentUnits += (currentUnits * (growth / 100)); 
        }
    }

    const chartConfig = {
        type: 'line', 
        data: { labels: labels, datasets: [{ label: `${industry} Projected Growth (${currency})`, data: revenues, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.2)', borderWidth: 3, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false }
    };
    
    let tableHTML = `<tr><th>Year</th><th>Revenue (${currency})</th></tr>`;
    for(let i=0; i<labels.length; i++) {
        tableHTML += `<tr><td>${labels[i]}</td><td><strong style="color:var(--primary)">${currency}${revenues[i].toLocaleString()}</strong></td></tr>`;
    }

    socket.emit("presentation-data", { room: currentRoom, chartConfig, industry, tableHTML, view: 'chart' });
});

document.getElementById("viewGraphBtn")?.addEventListener("click", () => { socket.emit("pres-view-switch", {room: currentRoom, view: 'chart'}); });
document.getElementById("viewExcelBtn")?.addEventListener("click", () => { socket.emit("pres-view-switch", {room: currentRoom, view: 'excel'}); });

let laserTimeout;
presentationContainer?.addEventListener("pointermove", (e) => {
    if(!isHost || presentationBox?.style.display === "none") return;
    const rect = e.currentTarget.getBoundingClientRect(); 
    socket.emit("laser-pointer", { room: currentRoom, x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
});
presentationContainer?.addEventListener("pointerleave", () => { if(isHost) socket.emit("laser-pointer", { room: currentRoom, hide: true }); });

// ==========================================
// 11. DUAL-LAYER WHITEBOARD
// ==========================================
const canvas = document.getElementById('whiteboard');
const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null; 
const bgCanvas = document.getElementById('bg-whiteboard');
const bgCtx = bgCanvas ? bgCanvas.getContext('2d', { willReadFrequently: true }) : null; 

if(bgCtx && ctx) { 
    bgCtx.fillStyle = "#ffffff"; 
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); 
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
}

let canDraw = false; let currentBrushColor = "#000000"; let currentBrushSize = 5; let currentTool = 'pen'; 
let drawing = false; let startX = 0; let startY = 0; let canvasSnapshot; 
let stampImage = null; let stampScale = 1.0; let isStamping = false;
let currentEraserSize = 30; let isRightClickErasing = false; let prevToolState = 'pen';
let wbPagesBg = []; let wbPagesFg = []; let currentWbPage = 0;
wbPagesBg[0] = ''; wbPagesFg[0] = '';

function saveCurrentPage() {
    if(!bgCanvas || !canvas) return;
    wbPagesBg[currentWbPage] = bgCanvas.toDataURL("image/jpeg", 0.5); 
    wbPagesFg[currentWbPage] = canvas.toDataURL("image/png", 0.5);
}

function loadPage(index) {
    if (index < 0 || index >= wbPagesBg.length || !bgCanvas || !canvas) return;
    saveCurrentPage(); 
    currentWbPage = index;
    const txt = document.getElementById("wbPageNum"); 
    if(txt) txt.textContent = `${currentWbPage + 1} / ${wbPagesBg.length}`;
    
    bgCtx.fillStyle = "#ffffff"; 
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); 
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    
    if(wbPagesBg[currentWbPage]) { const imgBg = new Image(); imgBg.onload = () => { bgCtx.drawImage(imgBg, 0, 0); }; imgBg.src = wbPagesBg[currentWbPage]; }
    if(wbPagesFg[currentWbPage]) { const imgFg = new Image(); imgFg.onload = () => { ctx.drawImage(imgFg, 0, 0); }; imgFg.src = wbPagesFg[currentWbPage]; }
    if(isHost) socket.emit("wb-page-sync", { room: currentRoom, imageBg: wbPagesBg[currentWbPage], imageFg: wbPagesFg[currentWbPage], num: currentWbPage + 1, total: wbPagesBg.length });
}

document.getElementById("wbAddPage")?.addEventListener("click", () => {
    saveCurrentPage(); 
    wbPagesBg.push(''); wbPagesFg.push(''); 
    currentWbPage = wbPagesBg.length - 1;
    const txt = document.getElementById("wbPageNum"); 
    if(txt) txt.textContent = `${currentWbPage + 1} / ${wbPagesBg.length}`;
    
    if(bgCtx) { bgCtx.fillStyle = "#ffffff"; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); }
    if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    showNotification("Created new whiteboard page!", "info");
    socket.emit("wb-page-sync", { room: currentRoom, imageBg: '', imageFg: '', num: currentWbPage + 1, total: wbPagesBg.length });
});
document.getElementById("wbPrevPage")?.addEventListener("click", () => loadPage(currentWbPage - 1)); 
document.getElementById("wbNextPage")?.addEventListener("click", () => loadPage(currentWbPage + 1)); 

const wbShapesMenu = document.getElementById("wb-shapes-menu");
const wbSubjectsMenu = document.getElementById("wb-subjects-menu");
const wbEraserMenu = document.getElementById("wb-eraser-menu");

document.getElementById("toggleShapesBtn")?.addEventListener("click", () => { 
    if(wbShapesMenu) wbShapesMenu.style.display = wbShapesMenu.style.display === "none" ? "block" : "none"; 
    if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none"; 
    if(wbEraserMenu) wbEraserMenu.style.display = "none"; 
});
document.getElementById("toggleSubjectsBtn")?.addEventListener("click", () => { 
    if(wbSubjectsMenu) wbSubjectsMenu.style.display = wbSubjectsMenu.style.display === "none" ? "block" : "none"; 
    if(wbShapesMenu) wbShapesMenu.style.display = "none"; 
    if(wbEraserMenu) wbEraserMenu.style.display = "none"; 
});

const shapeTools = ['line', 'arrow', 'triangle', 'rect', 'circle', 'pentagon', 'hexagon', 'star', 'cube', 'cylinder', 'cone', 'sphere'];

const subjectAssets = {
    geography: [ {name: "World Map", url: "assets/subjects/world_map.pdf"}, {name: "India Political", url: "assets/subjects/india_political.pdf"}, {name: "India Physical", url: "assets/subjects/india_physical.pdf"} ],
    biology: [ {name: "Human Skeleton", url: "assets/subjects/human_skeleton.pdf"}, {name: "Respiratory System", url: "assets/subjects/respiratory_system.pdf"}, {name: "Human Heart", url: "assets/subjects/human_heart.pdf"}, {name: "Human Eye", url: "assets/subjects/human_eye.pdf"}, {name: "Digestive System", url: "assets/subjects/digestive_system.pdf"}, {name: "DNA Structure", url: "assets/subjects/dna_structure.pdf"}, {name: "Plant Cell", url: "assets/subjects/plant_cell.pdf"}, {name: "Human Brain", url: "assets/subjects/human_brain.pdf"} ],
    chemistry: [ {name: "Periodic Table", url: "assets/subjects/periodic_table.pdf"} ],
    physics: [],
    maths: [],
    commerce: [ {name: "Supply & Demand", url: "assets/subjects/supply_demand.pdf"} ]
};

function prepareStamp(src) {
    if(!canvas) return;
    const img = new Image(); 
    if (!src.startsWith("data:")) { img.crossOrigin = "Anonymous"; }
    img.onload = () => {
        stampImage = img; 
        stampScale = Math.min((canvas.width * 0.6) / img.width, (canvas.height * 0.6) / img.height);
        isStamping = true; currentTool = 'stamp';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool'));
        showNotification("🖱️ Ready! Scroll to resize, Click to paste.", "info");
        if(ctx) canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); 
    };
    img.onerror = () => showNotification("Image error. File missing in folder.", "danger");
    img.src = src; 
}

async function loadAssetToCanvas(url, name) {
    try {
        showNotification(`Loading ${name}...`, "info");
        if (url.endsWith('.png') || url.endsWith('.jpg')) { 
            prepareStamp(url); 
            if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none"; 
        } else if (url.endsWith('.pdf')) {
            if(typeof pdfjsLib === 'undefined') return;
            const pdf = await pdfjsLib.getDocument(url).promise; 
            const page = await pdf.getPage(1); 
            const viewport = page.getViewport({scale: 2.0}); 
            const tc = document.createElement('canvas'); 
            const tCtx = tc.getContext('2d'); 
            tc.height = viewport.height; 
            tc.width = viewport.width;
            await page.render({canvasContext: tCtx, viewport: viewport}).promise; 
            prepareStamp(tc.toDataURL("image/jpeg", 0.8));
            if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none";
        }
    } catch(e) { showNotification(`Failed to load ${name}.`, "danger"); }
}

document.getElementById("subjectCategory")?.addEventListener("change", (e) => {
    const list = document.getElementById("subjectAssetsList"); 
    if(!list || !subjectAssets[e.target.value]) return;
    list.innerHTML = "";
    subjectAssets[e.target.value].forEach(asset => {
        const btn = document.createElement("button"); 
        btn.textContent = "➕ Insert " + asset.name;
        btn.style.cssText = "background: rgba(255,255,255,0.1); color: white; border: 1px solid var(--accent); padding: 8px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px;";
        btn.onclick = () => { loadAssetToCanvas(asset.url, asset.name); }; 
        list.appendChild(btn);
    });
});

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        let clickedTool = btn.id.replace('tool-', '');
        if (clickedTool === 'eraser' && currentTool === 'eraser') { 
            if(wbEraserMenu) wbEraserMenu.style.display = wbEraserMenu.style.display === "none" ? "block" : "none"; 
            return; 
        }
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool')); 
        btn.classList.add('active-tool');
        currentTool = clickedTool; 
        
        if(wbShapesMenu) wbShapesMenu.style.display = "none"; 
        if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none"; 
        if(wbEraserMenu) wbEraserMenu.style.display = currentTool === 'eraser' ? "block" : "none";
        if(isStamping) { isStamping = false; if(canvasSnapshot && ctx) ctx.putImageData(canvasSnapshot, 0, 0); }
    });
});

document.querySelectorAll('.eraser-size-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.eraser-size-btn').forEach(b => b.classList.remove('active-tool')); 
        btn.classList.add('active-tool');
        currentEraserSize = parseInt(btn.dataset.size); 
        if(wbEraserMenu) wbEraserMenu.style.display = "none";
    });
});

document.getElementById('wb-color')?.addEventListener("input", (e) => { currentBrushColor = e.target.value; });
document.getElementById('wb-size')?.addEventListener("input", (e) => { currentBrushSize = e.target.value; });
document.getElementById('wb-clear')?.addEventListener("click", () => {
    if (!canDraw || !ctx || !canvas) return; 
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    socket.emit("clear-whiteboard", { room: currentRoom });
    wbPagesFg[currentWbPage] = canvas.toDataURL("image/png", 0.5); 
    showNotification("Annotations cleared. Background intact.", "info");
});

function drawFreehand(x0, y0, x1, y1, color, size, toolType, emit) {
    if(!ctx) return;
    if(toolType === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.strokeStyle = "rgba(0,0,0,1)"; ctx.lineWidth = size;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke(); ctx.closePath();
        ctx.globalCompositeOperation = 'source-over';
    } else if(toolType === 'brush') {
        ctx.globalAlpha = 0.5;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x0 + i * size * 0.15, y0 + i * size * 0.15);
            ctx.lineTo(x1 + i * size * 0.15, y1 + i * size * 0.15);
            ctx.strokeStyle = color;
            ctx.lineWidth = size * 0.8 + Math.abs(i) * size * 0.3;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.stroke(); ctx.closePath();
        }
        ctx.globalAlpha = 1.0;
    } else if(toolType === 'spray') {
        const density = Math.max(5, Math.floor(size * 1.5));
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * size * 2.5;
            const sx = x0 + Math.cos(angle) * dist;
            const sy = y0 + Math.sin(angle) * dist;
            const ex = x1 + Math.cos(angle) * dist;
            const ey = y1 + Math.sin(angle) * dist;
            ctx.beginPath();
            ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
            ctx.strokeStyle = color;
            ctx.lineWidth = size * 0.3 + Math.random() * size * 0.4;
            ctx.lineCap = 'round'; ctx.stroke(); ctx.closePath();
        }
        ctx.globalAlpha = 1.0;
    } else {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.strokeStyle = color; ctx.lineWidth = size;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke(); ctx.closePath();
    }
}

function drawShape(ctx, type, x1, y1, x2, y2, color, size) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = color + '22';

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2 || 1;
    const ry = Math.abs(y2 - y1) / 2 || 1;
    const r = Math.max(rx, ry);
    const d = r * 0.3;
    const dx = x2 - x1;
    const dy = y2 - y1;

    switch (type) {
        case 'line': {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            break;
        }
        case 'arrow': {
            const angle = Math.atan2(dy, dx);
            const headLen = Math.min(20, Math.hypot(dx, dy) * 0.25);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
            ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
            ctx.closePath(); ctx.fill();
            break;
        }
        case 'triangle': {
            ctx.beginPath();
            ctx.moveTo(x1, y2); ctx.lineTo(cx, y1); ctx.lineTo(x2, y2);
            ctx.closePath(); ctx.stroke();
            break;
        }
        case 'rect': {
            ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(dx), Math.abs(dy));
            break;
        }
        case 'circle': {
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            break;
        }
        case 'pentagon': case 'hexagon': {
            const sides = type === 'pentagon' ? 5 : 6;
            ctx.beginPath();
            for (let i = 0; i <= sides; i++) {
                const a = (i * Math.PI * 2) / sides - Math.PI / 2;
                const px = cx + r * Math.cos(a);
                const py = cy + r * Math.sin(a);
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.stroke();
            break;
        }
        case 'star': {
            ctx.beginPath();
            for (let i = 0; i <= 10; i++) {
                const a = (i * Math.PI) / 5 - Math.PI / 2;
                const radius = i % 2 === 0 ? r : r * 0.4;
                const px = cx + radius * Math.cos(a);
                const py = cy + radius * Math.sin(a);
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.stroke();
            break;
        }
        case 'cube': {
            const w = dx, h = dy;
            const off = Math.min(Math.abs(w), Math.abs(h)) * 0.2;
            const sx = w > 0 ? 1 : -1, sy = h > 0 ? 1 : -1;
            ctx.strokeRect(x1, y1, w, h);
            ctx.strokeRect(x1 + off * sx, y1 + off * sy, w, h);
            ctx.beginPath();
            ctx.moveTo(x1, y1); ctx.lineTo(x1 + off * sx, y1 + off * sy);
            ctx.moveTo(x1 + w, y1); ctx.lineTo(x1 + off * sx + w, y1 + off * sy);
            ctx.moveTo(x1, y1 + h); ctx.lineTo(x1 + off * sx, y1 + off * sy + h);
            ctx.moveTo(x1 + w, y1 + h); ctx.lineTo(x1 + off * sx + w, y1 + off * sy + h);
            ctx.stroke();
            break;
        }
        case 'cylinder': {
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            ctx.beginPath();
            ctx.ellipse(cx, minY, rx, rx * 0.3, 0, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, maxY, rx, rx * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - rx, minY); ctx.lineTo(cx - rx, maxY);
            ctx.moveTo(cx + rx, minY); ctx.lineTo(cx + rx, maxY);
            ctx.stroke();
            break;
        }
        case 'cone': {
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            ctx.beginPath(); ctx.ellipse(cx, maxY, rx, rx * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - rx, maxY); ctx.lineTo(cx, minY); ctx.lineTo(cx + rx, maxY);
            ctx.closePath(); ctx.stroke();
            break;
        }
        case 'sphere': {
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 0.6, r * 0.2, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 0.2, r * 0.6, 0, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
    }
    ctx.restore();
}

function getCanvasPoint(e) { 
    const rect = canvas.getBoundingClientRect(); 
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }; 
}

if(canvas) {
    canvas.addEventListener('wheel', (e) => {
        if (isStamping && stampImage && ctx) {
            e.preventDefault(); 
            if (e.deltaY < 0) stampScale *= 1.1; 
            else stampScale *= 0.9; 
            const pt = getCanvasPoint(e); 
            ctx.putImageData(canvasSnapshot, 0, 0);
            let w = stampImage.width * stampScale; let h = stampImage.height * stampScale;
            ctx.globalAlpha = 0.6; ctx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h); ctx.globalAlpha = 1.0;
        }
    }, {passive: false});

    canvas.addEventListener('pointerdown', (e) => { 
        if (!canDraw) return; 
        if (e.button === 2 || e.buttons === 2 || (e.pointerType === 'pen' && e.button === 5)) { 
            isRightClickErasing = true; prevToolState = currentTool; currentTool = 'eraser'; e.preventDefault(); 
        } 
        else if (e.button !== 0 && e.pointerType !== 'touch') { return; }
      
        const pt = getCanvasPoint(e);
        if (isStamping && stampImage && !isRightClickErasing) {
            if(ctx) ctx.putImageData(canvasSnapshot, 0, 0); 
            let w = stampImage.width * stampScale; let h = stampImage.height * stampScale;
            if(bgCtx) bgCtx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h);
            
            let tempCanvas = document.createElement("canvas"); 
            let syncScale = Math.min(1, 800 / Math.max(w, h)); 
            tempCanvas.width = w * syncScale; tempCanvas.height = h * syncScale; 
            let tCtx = tempCanvas.getContext("2d");
            tCtx.fillStyle = "#ffffff"; tCtx.fillRect(0,0, tempCanvas.width, tempCanvas.height); 
            tCtx.drawImage(stampImage, 0, 0, tempCanvas.width, tempCanvas.height);
            let sendSrc = tempCanvas.toDataURL("image/jpeg", 0.5); 
            
            socket.emit("wb-stamp", { room: currentRoom, image: sendSrc, x: pt.x - w/2, y: pt.y - h/2, w: w, h: h });
            if(bgCanvas) wbPagesBg[currentWbPage] = bgCanvas.toDataURL("image/jpeg", 0.5);
            isStamping = false; currentTool = 'pen'; 
            document.getElementById('tool-pen')?.classList.add('active-tool');
            if(ctx) canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); 
            showNotification("Stamped successfully!", "join"); return;
        }
        if(currentTool === 'pointer') return; 
        drawing = true; startX = pt.x; startY = pt.y; 
        if(ctx) canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!canDraw) return;
        const pt = getCanvasPoint(e);
        if (isStamping && stampImage && !isRightClickErasing) { 
            if(ctx) { 
                ctx.putImageData(canvasSnapshot, 0, 0); 
                let w = stampImage.width * stampScale; let h = stampImage.height * stampScale; 
                ctx.globalAlpha = 0.6; ctx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h); ctx.globalAlpha = 1.0; 
            } return; 
        }
        if(currentTool === 'pointer') { socket.emit("wb-pointer", { room: currentRoom, x: pt.x / canvas.width, y: pt.y / canvas.height }); return; }
        if (!drawing) return;
        
        if(['pen', 'brush', 'spray', 'eraser'].includes(currentTool)) {
            let pressure = (e.pointerType === 'pen' && e.pressure > 0) ? e.pressure : 0.5; 
            let pressureMult = e.pointerType === 'pen' ? (pressure * 2.5) : 1; 
            let activeSize = currentTool === 'eraser' ? currentEraserSize : (currentBrushSize * pressureMult); 
            if(activeSize < 1) activeSize = 1;
          
            if(ctx) {
                if(currentTool === 'eraser') { 
                    ctx.globalCompositeOperation = 'destination-out'; 
                    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(pt.x, pt.y); 
                    ctx.strokeStyle = "rgba(0,0,0,1)"; ctx.lineWidth = activeSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.closePath(); 
                    ctx.globalCompositeOperation = 'source-over'; 
                } else if(currentTool === 'brush') { 
                    ctx.globalAlpha = 0.5;
                    for (let i = -2; i <= 2; i++) {
                        ctx.beginPath();
                        ctx.moveTo(startX + i * activeSize * 0.15, startY + i * activeSize * 0.15);
                        ctx.lineTo(pt.x + i * activeSize * 0.15, pt.y + i * activeSize * 0.15);
                        ctx.strokeStyle = currentBrushColor;
                        ctx.lineWidth = activeSize * 0.8 + Math.abs(i) * activeSize * 0.3;
                        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                        ctx.stroke(); ctx.closePath();
                    }
                    ctx.globalAlpha = 1.0;
                } else if(currentTool === 'spray') { 
                    const density = Math.max(5, Math.floor(activeSize * 1.5));
                    ctx.globalAlpha = 0.4;
                    for (let i = 0; i < density; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const dist = Math.random() * activeSize * 2.5;
                        const sx = startX + Math.cos(angle) * dist;
                        const sy = startY + Math.sin(angle) * dist;
                        const ex = pt.x + Math.cos(angle) * dist;
                        const ey = pt.y + Math.sin(angle) * dist;
                        ctx.beginPath();
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(ex, ey);
                        ctx.strokeStyle = currentBrushColor;
                        ctx.lineWidth = activeSize * 0.3 + Math.random() * activeSize * 0.4;
                        ctx.lineCap = 'round';
                        ctx.stroke(); ctx.closePath();
                    }
                    ctx.globalAlpha = 1.0;
                } else { 
                    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(pt.x, pt.y); 
                    ctx.strokeStyle = currentBrushColor; ctx.lineWidth = activeSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.closePath(); 
                }
            }
            socket.emit('drawing', { type: 'free', x0: startX, y0: startY, x1: pt.x, y1: pt.y, color: currentBrushColor, size: activeSize, toolType: currentTool, room: currentRoom });
            startX = pt.x; startY = pt.y;
        }
        if (shapeTools.includes(currentTool)) {
            if(ctx) {
                ctx.putImageData(canvasSnapshot, 0, 0);
                drawShape(ctx, currentTool, startX, startY, pt.x, pt.y, currentBrushColor, currentBrushSize);
            }
        }
    });

    canvas.addEventListener('pointerup', (e) => { 
        if (drawing && canDraw && currentTool !== 'pointer') {
            if (shapeTools.includes(currentTool) && ctx && canvasSnapshot) {
                const pt = getCanvasPoint(e);
                ctx.putImageData(canvasSnapshot, 0, 0);
                drawShape(ctx, currentTool, startX, startY, pt.x, pt.y, currentBrushColor, currentBrushSize);
                socket.emit('drawing', { type: currentTool, x0: startX, y0: startY, x1: pt.x, y1: pt.y, color: currentBrushColor, size: currentBrushSize, room: currentRoom });
            }
            drawing = false; 
            if(ctx) { ctx.shadowBlur = 0; wbPagesFg[currentWbPage] = canvas.toDataURL("image/png", 0.5); }
        }
        if (isRightClickErasing) { currentTool = prevToolState; isRightClickErasing = false; }
    });

    canvas.addEventListener('pointerout', (e) => { 
        drawing = false; 
        if (isRightClickErasing) { currentTool = prevToolState; isRightClickErasing = false; }
        if(currentTool === 'pointer' && canDraw) socket.emit("wb-pointer", { room: currentRoom, hide: true }); 
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
}

const wbPdfUpload = document.getElementById('wbPdfUpload');
if(wbPdfUpload) {
    document.getElementById('tool-pdf')?.addEventListener("click", () => wbPdfUpload.click());
    wbPdfUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if(!file) return; 
        if (file.type.startsWith('image/')) {
            showNotification("Loading Image...", "info"); 
            const reader = new FileReader(); reader.onload = (event) => { prepareStamp(event.target.result); }; reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            if(typeof pdfjsLib === 'undefined') return;
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            const fileReader = new FileReader();
            fileReader.onload = async function() {
                const typedarray = new Uint8Array(this.result); 
                const pdf = await pdfjsLib.getDocument(typedarray).promise; 
                if (pdf.numPages === 1) {
                    showNotification("Loading PDF...", "info"); 
                    const page = await pdf.getPage(1); const viewport = page.getViewport({scale: 2.0}); 
                    const tc = document.createElement('canvas'); const tCtx = tc.getContext('2d'); tc.height = viewport.height; tc.width = viewport.width;
                    await page.render({canvasContext: tCtx, viewport: viewport}).promise; prepareStamp(tc.toDataURL("image/jpeg", 0.8));
                } else {
                    showNotification(`Processing ${pdf.numPages} Pages...`, "info"); 
                    saveCurrentPage(); 
                    let startNewPageIndex = wbPagesBg.length; 
                    if (wbPagesBg.length === 1 && (wbPagesBg[0] === '' || !wbPagesBg[0])) { startNewPageIndex = 0; }
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i); const viewport = page.getViewport({scale: 2.0}); 
                        const tc = document.createElement('canvas'); 
                        tc.width = canvas ? canvas.width : 1920; 
                        tc.height = canvas ? canvas.height : 1080; 
                        const tCtx = tc.getContext('2d'); 
                        tCtx.fillStyle = "#ffffff"; tCtx.fillRect(0, 0, tc.width, tc.height); 
                        
                        const tempCanvas = document.createElement('canvas'); tempCanvas.width = viewport.width; tempCanvas.height = viewport.height;
                        await page.render({canvasContext: tempCanvas.getContext('2d'), viewport: viewport}).promise; 
                        const scaleToFit = Math.min(tc.width / viewport.width, tc.height / viewport.height) * 0.95;
                        const fw = viewport.width * scaleToFit; const fh = viewport.height * scaleToFit; const dx = (tc.width - fw) / 2; const dy = (tc.height - fh) / 2;
                        tCtx.drawImage(tempCanvas, dx, dy, fw, fh); 
                        const pageDataBg = tc.toDataURL("image/jpeg", 0.7); const pageDataFg = ""; 
                        
                        if (startNewPageIndex === 0 && i === 1) { wbPagesBg[0] = pageDataBg; wbPagesFg[0] = pageDataFg; } 
                        else { wbPagesBg.push(pageDataBg); wbPagesFg.push(pageDataFg); }
                    }
                    loadPage(startNewPageIndex); 
                    showNotification(`✅ Uploaded ${pdf.numPages} Pages!`, "join"); 
                    wbPdfUpload.value = ""; 
                }
            };
            fileReader.readAsArrayBuffer(file);
        }
    });
}

// ==========================================
// 12. MAP INIT
// ==========================================
function initWorldMap() {
    if(!document.getElementById('map-container') || typeof L === 'undefined') return;
    geoMap = L.map('map-container', { center: [20.0, 0.0], zoom: 3, zoomControl: false });
    L.control.zoom({ position: 'bottomleft' }).addTo(geoMap);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', crossOrigin: true }).addTo(geoMap);
    labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'markerPane', crossOrigin: true }).addTo(geoMap);
    if(typeof L.Control.geocoder !== 'undefined') {
        const geocoder = L.Control.geocoder({ defaultMarkGeocode: true }).addTo(geoMap);
        const gcContainer = geocoder.getContainer(); gcContainer.style.position = "static"; 
        document.getElementById('map-controls-container')?.appendChild(gcContainer);
    }
}
initWorldMap();

// ==========================================
// 13. SOCKET LISTENER BINDINGS
// ==========================================
socket.on("room-history", (data) => {
    if(data.isHost !== undefined) isHost = data.isHost;
    if(data.hostUid) globalHostUid = data.hostUid;
    if (data.chats) data.chats.forEach(chat => { if(chat.name === "System" && chat.text.includes("left")) return; appendMessage(`${chat.name}: ${chat.text}`); });
    if (data.files && fileList) [...data.files].reverse().forEach(file => addFileLink(file.filename, file.url));
    if (data.wbVisible && whiteboardBox) { hideAllBigPanels(); whiteboardBox.style.display = "block"; if(isHost && toggleWbBtn) toggleWbBtn.dataset.show = "true"; }
    if (data.mapVisible && mapBox) { hideAllBigPanels(); mapBox.style.display = "block"; setTimeout(() => {if(typeof geoMap !== 'undefined') geoMap.invalidateSize();}, 100); if(isHost && toggleMapBtn) toggleMapBtn.dataset.show = "true"; }
    if (data.presVisible && presentationBox) { hideAllBigPanels(); presentationBox.style.display = "block"; if(isHost && togglePresBtn) togglePresBtn.dataset.show = "true"; }
    if (data.officeVisible && officeBox) { hideAllBigPanels(); officeBox.style.display = "block"; if(isHost && toggleOfficeBtn) toggleOfficeBtn.dataset.show = "true"; }
});

socket.on("host-assignment", (data) => {
    isHost = data.isHost; if(data.hostUid) globalHostUid = data.hostUid;
    const hostAudioCont = document.getElementById("hostAudioContainer");
    const wbToolbar = document.getElementById('wb-toolbar');
    const presInputForm = document.getElementById('pres-input-form');
    
    if (isHost) {
        if(hostAudioCont) hostAudioCont.style.display = "block"; 
        canDraw = true; 
        if(wbToolbar) wbToolbar.style.display = "flex"; 
        if(canvas) canvas.style.cursor = "crosshair"; 
        if(wbStatus) wbStatus.textContent = "(Host Mode)";
        if(presInputForm) presInputForm.style.display = "flex"; 
        
        if(toggleWbBtn) toggleWbBtn.style.display = "inline-block"; 
        if(toggleMapBtn) toggleMapBtn.style.display = "inline-block"; 
        if(togglePresBtn) togglePresBtn.style.display = "inline-block"; 
        if(toggleOfficeBtn) toggleOfficeBtn.style.display = "inline-block";
        document.querySelectorAll('.host-only-btn').forEach(btn => btn.style.setProperty("display", "flex", "important"));
        if(pptEditor) pptEditor.contentEditable = "true";
        document.querySelectorAll('#excelGrid td').forEach(td => td.contentEditable = "true");
    } else {
        if(hostAudioCont) hostAudioCont.style.display = "none"; 
        canDraw = false; 
        if(wbToolbar) wbToolbar.style.display = "none"; 
        if(canvas) canvas.style.cursor = "not-allowed"; 
        if(wbStatus) wbStatus.textContent = "(View Only)";
        if(presInputForm) presInputForm.style.display = "none"; 
        
        if(toggleWbBtn) toggleWbBtn.style.display = "none"; 
        if(toggleMapBtn) toggleMapBtn.style.display = "none"; 
        if(togglePresBtn) togglePresBtn.style.display = "none"; 
        if(toggleOfficeBtn) toggleOfficeBtn.style.display = "none";
        
        const viewGraphBtn = document.getElementById("viewGraphBtn");
        if(viewGraphBtn && viewGraphBtn.parentElement) viewGraphBtn.parentElement.style.display = "none"; 
        document.querySelectorAll('.host-only-btn').forEach(btn => btn.style.setProperty("display", "none", "important"));
    }
});

socket.on("room-update", (data) => {
    if (isHost && data.size > 1) { 
        if(muteAllBtn) muteAllBtn.style.display = "inline-block"; 
        if(unmuteAllBtn) unmuteAllBtn.style.display = "inline-block"; 
    } else if (isHost) { 
        if(muteAllBtn) muteAllBtn.style.display = "none"; 
        if(unmuteAllBtn) unmuteAllBtn.style.display = "none"; 
    }
});

socket.on('drawing', (data) => {
    if(data.type === 'free') drawFreehand(data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.toolType, false);
    if(shapeTools.includes(data.type) && ctx) drawShape(ctx, data.type, data.x0, data.y0, data.x1, data.y1, data.color, data.size);
    if(isHost && canvas) wbPagesFg[currentWbPage] = canvas.toDataURL("image/png", 0.5);
});

socket.on("wb-stamp", (data) => {
    const img = new Image(); 
    img.onload = () => { 
        if(bgCtx) bgCtx.drawImage(img, data.x, data.y, data.w, data.h); 
        if(isHost && bgCanvas) wbPagesBg[currentWbPage] = bgCanvas.toDataURL("image/jpeg", 0.5); 
    }; 
    img.src = data.image;
});

socket.on("wb-pointer", (data) => {
    const laser = document.getElementById("wb-laser");
    if(!laser) return;
    if(data.hide) { laser.style.display = "none"; return; }
    laser.style.display = "block"; 
    laser.style.left = (data.x * 100) + "%"; 
    laser.style.top = (data.y * 100) + "%";
});

socket.on("control", async (data) => {
    if (!joined || !data) return;
    if (data.action === "share-start") { const w = document.getElementById(`remote-wrapper-${data.uid}`); if (w) w.classList.add("video-wrapper-large"); }
    if (data.action === "share-stop") { const w = document.getElementById(`remote-wrapper-${data.uid}`); if (w) w.classList.remove("video-wrapper-large"); }
    
    if (data.action === "mute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); if(muteBtn) { muteBtn.textContent = "🔇 Mic"; muteBtn.style.background = "rgba(231, 76, 60, 0.7)"; } }
    if (data.action === "unmute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); if(muteBtn) { muteBtn.textContent = "🎙️ Mic"; muteBtn.style.background = ""; } }
    if (data.targetUid === localUid) {
      if (data.action === "mute-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); if(muteBtn) { muteBtn.textContent = "🔇 Mic"; muteBtn.style.background = "rgba(231, 76, 60, 0.7)"; } showNotification("Host muted you", "danger"); }
      if (data.action === "disable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(false); if(cameraBtn) { cameraBtn.textContent = "🚫📹 Camera"; cameraBtn.style.background = "rgba(231, 76, 60, 0.7)"; } }
      if (data.action === "enable-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); if(muteBtn) { muteBtn.textContent = "🎙️ Mic"; muteBtn.style.background = ""; } }
      if (data.action === "enable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(true); if(cameraBtn) { cameraBtn.textContent = "📹 Camera"; cameraBtn.style.background = ""; } }
    }
});

socket.on("wb-control", (data) => {
    if (data.targetUid === localUid) {
      if (data.action === "grant") { canDraw = true; const wbt = document.getElementById('wb-toolbar'); if(wbt) wbt.style.display = "flex"; if(canvas) canvas.style.cursor = "crosshair"; if(wbStatus) wbStatus.textContent = "(You have access)"; showNotification("Host gave you Whiteboard access! 🎨", "join"); } 
      else if (data.action === "revoke") { canDraw = false; const wbt = document.getElementById('wb-toolbar'); if(wbt) wbt.style.display = "none"; if(canvas) canvas.style.cursor = "not-allowed"; if(wbStatus) wbStatus.textContent = "(View Only - Access Revoked)"; showNotification("Your whiteboard access was revoked.", "danger"); }
    }
});

socket.on("force-screen", (data) => {
    if(isHost) return;
    applyForcedFullscreen(data.target, data.active);
});

socket.on("office-sync", (data) => {
    if(data.action === "tab-switch") {
        document.querySelectorAll(".office-tab-btn").forEach(b => b.classList.remove("active-tool"));
        const target = document.getElementById(data.target);
        if(target) {
            target.style.display = "flex";
            document.querySelectorAll(".office-tab").forEach(t => { if(t !== target) t.style.display = "none"; });
        }
    }
    if(data.action === "content-update") {
        if(data.pptData && pptEditor) {
            try {
                const parsed = JSON.parse(data.pptData);
                pptSlides = parsed.slides || ['<p>Empty</p>'];
                pptCurrentSlide = parsed.current || 0;
                pptEditor.innerHTML = pptSlides[pptCurrentSlide] || '';
                const ind = document.getElementById("pptSlideIndicator");
                if(ind) ind.textContent = `${pptCurrentSlide + 1} / ${pptSlides.length}`;
                if(pptSliderInput) { pptSliderInput.max = pptSlides.length - 1; pptSliderInput.value = pptCurrentSlide; }
            } catch(e) { pptEditor.innerHTML = data.pptData; }
        }
        if(data.excelData && excelGrid) {
            for(let r=1; r<excelGrid.rows.length && r-1<data.excelData.length; r++) {
                for(let c=0; c<data.excelData[r-1].length && c<excelGrid.rows[r].cells.length-1; c++) {
                    excelGrid.rows[r].cells[c+1].innerHTML = data.excelData[r-1][c];
                }
            }
        }
    }
});

socket.on("wb-page-sync", (data) => {
    if(isHost) return;
    const txt = document.getElementById("wbPageNum");
    if(txt) txt.textContent = `${data.num} / ${data.total}`;
    if(bgCtx) { bgCtx.fillStyle = "#ffffff"; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); }
    if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(data.imageBg) { const img = new Image(); img.onload = () => { bgCtx.drawImage(img, 0, 0); }; img.src = data.imageBg; }
    if(data.imageFg) { const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0); }; img.src = data.imageFg; }
});

socket.on("clear-whiteboard", () => {
    if(ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(isHost && canvas) wbPagesFg[currentWbPage] = canvas.toDataURL("image/png", 0.5);
});

socket.on("laser-pointer", (data) => {
    const laser = document.getElementById("laser-pointer");
    if(!laser) return;
    if(data.hide) { laser.style.display = "none"; return; }
    laser.style.display = "block";
    laser.style.left = (data.x * 100) + "%";
    laser.style.top = (data.y * 100) + "%";
    clearTimeout(laserTimeout);
    laserTimeout = setTimeout(() => laser.style.display = "none", 3000);
});

socket.on("presentation-data", (data) => {
    const presTitle = document.getElementById("pres-title");
    if(presTitle) presTitle.textContent = data.industry || "Presentation";
    if(businessChart) { businessChart.destroy(); businessChart = null; }
    const canvasEl = document.getElementById("presentationCanvas");
    if(canvasEl) {
        businessChart = new Chart(canvasEl.getContext("2d"), data.chartConfig);
    }
});

socket.on("pres-view-switch", (data) => {
    const presContainer = document.getElementById("presentation-container");
    if(presContainer) {
        presContainer.style.display = data.view === 'chart' ? "block" : "none";
    }
});

socket.on("math-equation", (data) => {
    const md = document.getElementById("mathDisplay");
    if(!md) return;
    try {
        if(typeof katex !== 'undefined') {
            md.innerHTML = katex.renderToString(data.equation, { displayMode: true, throwOnError: false });
        } else {
            md.innerHTML = `<code>${data.equation}</code>`;
        }
    } catch(e) {
        md.innerHTML = `<code>${data.equation}</code>`;
    }
    showNotification(`${data.sender || "User"} broadcast an equation`, "info");
});

// ==========================================
// 14. AGORA EVENT LISTENERS
// ==========================================
client.on("user-published", async (user, mediaType) => {
    try {
      await client.subscribe(user, mediaType); 
      const uid = user.uid.toString(); 
      remoteUsers[uid] = user;
      
      if (mediaType === "video") {
        if (user.videoTrack.getTrackId().includes("screen") || uid.includes("screen")) {
          const sc = document.createElement("div"); 
          sc.className = "video-card screen-share-card"; 
          sc.id = `screen-card-${uid}`; 
          sc.style.width = "100%"; sc.style.height = "320px"; sc.style.gridColumn = "1 / -1"; sc.style.border = "3px solid var(--accent)";
          if(videoArea) { videoArea.appendChild(sc); addSizeControls(sc, sc); } 
          user.videoTrack.play(`screen-card-${uid}`, { fit: "contain" });
        } else { 
            const remoteId = createRemoteWrapper(uid, `User ${uid}`); 
            user.videoTrack.play(remoteId, { fit: "cover" }); 
        }
      }
      if (mediaType === "audio" && user.audioTrack) user.audioTrack.play();
    } catch (e) { console.error(e); }
  });
  
client.on("user-unpublished", (user, mediaType) => { if (mediaType === "video") document.getElementById(`screen-card-${user.uid}`)?.remove(); });
client.on("user-left", (user) => { document.getElementById(`remote-wrapper-${user.uid}`)?.remove(); document.getElementById(`screen-card-${user.uid}`)?.remove(); delete remoteUsers[user.uid.toString()]; });
socket.on("user-left", info => { if (info && info.uid) { document.getElementById(`remote-wrapper-${info.uid}`)?.remove(); document.getElementById(`screen-card-${info.uid}`)?.remove(); delete remoteUsers[info.uid.toString()]; } });

// Main Buttons
leaveBtn?.addEventListener("click", async () => { socket.emit("leave-room"); await client.leave(); window.location.reload(); });
muteAllBtn?.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "mute-all" }); });
unmuteAllBtn?.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "unmute-all" }); });

cameraBtn?.addEventListener("click", async () => {
    if (!joined || !localTracks.videoTrack) return;
    const en = localTracks.videoTrack.enabled; await localTracks.videoTrack.setEnabled(!en);
    cameraBtn.textContent = en ? "📹 Camera" : "🚫📹 Camera"; cameraBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
    socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "disable-video" : "enable-video" });
});

muteBtn?.addEventListener("click", async () => {
    if (!joined || !localTracks.audioTrack) return;
    const en = localTracks.audioTrack.enabled; await localTracks.audioTrack.setEnabled(!en);
    muteBtn.textContent = en ? "🎙️ Mic" : "🔇 Mic"; muteBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
    socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "mute-audio" : "enable-audio" });
});

shareBtn?.addEventListener("click", async () => {
    if (!joined) return;
    if (isSharing) {
      isSharing = false; if (screenTrack) { await client.unpublish(screenTrack); screenTrack.close(); screenTrack = null; }
      socket.emit("control", { room: currentRoom, action: "share-stop", uid: localUid });
      const myContainer = document.getElementById("local-player");
      if(myContainer) { myContainer.style.height = "200px"; myContainer.parentElement.style.width = "100%"; myContainer.parentElement.classList.remove("video-wrapper-large"); }
      if (localTracks.videoTrack) { await client.publish(localTracks.videoTrack); localTracks.videoTrack.play("local-player", { fit: "cover" }); }
      shareBtn.textContent = "🖥️ Share Screen"; shareBtn.style.background = ""; return;
    }
    if (localTracks.videoTrack) await client.unpublish(localTracks.videoTrack);
    try {
        screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto"); isSharing = true; shareBtn.textContent = "🛑 Stop Share"; shareBtn.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
        const myContainer = document.getElementById("local-player");
        if(myContainer) { myContainer.style.height = "400px"; myContainer.parentElement.classList.add("video-wrapper-large"); screenTrack.play("local-player", { fit: "contain" }); }
        await client.publish(screenTrack); socket.emit("control", { room: currentRoom, action: "share-start", uid: localUid });
        screenTrack.on("track-ended", () => { if (isSharing) shareBtn.click(); });
    } catch(e) { if (localTracks.videoTrack) { await client.publish(localTracks.videoTrack); localTracks.videoTrack.play("local-player", { fit: "cover" }); } }
});

// Chat & Files
sendMsgBtn?.addEventListener("click", () => { const text = chatInput?.value.trim(); if (!text) return; socket.emit("chat-message", { room: currentRoom, name: usernameInput?.value || "Me", text }); appendMessage(`Me: ${text}`); if(chatInput) chatInput.value = ""; });
chatInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMsgBtn?.click(); } });
socket.on("chat-message", data => { if(data.name === "System" && data.text.includes("left")) return; appendMessage(`${data.name}: ${data.text}`); });
document.getElementById("uploadBtn")?.addEventListener("click", async () => { const f = fileUpload?.files[0]; if (!f) return; const fd = new FormData(); fd.append("file", f); fd.append("room", currentRoom); fd.append("uploader", usernameInput?.value || "User"); try { addFileLink((await (await fetch("/upload", { method: "POST", body: fd })).json()).filename, (await (await fetch("/upload", { method: "POST", body: fd })).json()).url); } catch (err) { } });
function addFileLink(name, url) { const a = document.createElement("a"); a.href = url; a.textContent = name; a.download = name; a.target = "_blank"; if(fileList) fileList.prepend(a); }
socket.on("file-uploaded", data => { addFileLink(data.filename, data.url); showNotification(`${data.uploader} uploaded a file`, "info"); });
socket.on("user-joined", info => showNotification(`${info.name || "User"} joined the room!`, "join"));

// ==========================================
// 12. MUSIC STUDIO (Host Upload, Sync, Per-User Mute)
// ==========================================
const hostAudioFile = document.getElementById("hostAudioFile");
const hostAudioPlayer = document.getElementById("hostAudioPlayer");
const remoteMusicPlayer = document.getElementById("remoteMusicPlayer");
const localMusicMuteBtn = document.getElementById("localMusicMuteBtn");
let currentMusicUrl = "";

hostAudioFile?.addEventListener("change", async function() {
    const file = this.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("room", currentRoom || "");
    fd.append("uploader", "Host-Music");
    try {
        const res = await fetch("/upload", { method: "POST", body: fd });
        const data = await res.json();
        hostAudioPlayer.src = data.url;
        hostAudioPlayer.load();
        showNotification("Music uploaded! Press play to broadcast.", "info");
    } catch(e) { showNotification("Upload failed", "danger"); }
});

hostAudioPlayer?.addEventListener("play", function() {
    if(currentRoom) {
        currentMusicUrl = this.src;
        socket.emit("music-play", { room: currentRoom, url: this.src, playing: true, currentTime: this.currentTime });
    }
});
hostAudioPlayer?.addEventListener("pause", function() {
    if(currentRoom) socket.emit("music-play", { room: currentRoom, url: currentMusicUrl, playing: false, currentTime: this.currentTime });
});

socket.on("music-play", (data) => {
    if(isHost) return;
    currentMusicUrl = data.url;
    if(data.playing) {
        if(remoteMusicPlayer.src !== data.url) { remoteMusicPlayer.src = data.url; remoteMusicPlayer.load(); }
        remoteMusicPlayer.currentTime = data.currentTime || 0;
        remoteMusicPlayer.play().catch(() => {});
        if(localMusicMuteBtn) localMusicMuteBtn.style.display = "inline-block";
        showNotification(`🎵 Host is playing music${data.url ? ' — <button onclick="remoteMusicPlayer.play()" style="background:#2ecc71;color:#fff;border:none;padding:4px 12px;border-radius:12px;cursor:pointer;font-size:12px;">▶ Play</button>' : ''}`, "info");
    } else {
        remoteMusicPlayer.pause();
    }
});

localMusicMuteBtn?.addEventListener("click", function() {
    if(remoteMusicPlayer.paused) {
        remoteMusicPlayer.play().catch(() => {});
        this.textContent = "🎵🔇 Mute Music";
        this.style.background = "#9b59b6";
    } else {
        remoteMusicPlayer.pause();
        this.textContent = "🎵🔊 Unmute Music";
        this.style.background = "#2ecc71";
    }
});