const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const socket = io();

let localTracks = { audioTrack: null, videoTrack: null };
let localUid = null;
let joined = false;
let currentRoom = null;
let screenTrack = null;
let isHost = false; 
let globalHostUid = null; 
let isSharing = false; 
const remoteUsers = {}; 
let currentMusicUrl = null;

// ==========================================
// 1. UI Elements Initialization
// ==========================================
const joinBtn = document.getElementById("joinBtn");
const videoArea = document.getElementById("video-area");

function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 500); }, 4000);
}

function appendMessage(text) {
  const messages = document.getElementById("messages");
  if(!messages) return;
  const d = document.createElement("div"); d.textContent = text;
  messages.appendChild(d); messages.scrollTop = messages.scrollHeight;
}

function addSizeControls(targetWrapper, elementToFullscreen) {
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "local-controls";
  if(targetWrapper.id !== 'map-box') {
      const enlargeBtn = document.createElement("button"); enlargeBtn.className = "icon-btn"; enlargeBtn.innerHTML = "➕";
      enlargeBtn.onclick = () => { targetWrapper.classList.remove("video-wrapper-small"); targetWrapper.classList.toggle("video-wrapper-large"); };
      const shrinkBtn = document.createElement("button"); shrinkBtn.className = "icon-btn"; shrinkBtn.innerHTML = "➖";
      shrinkBtn.onclick = () => { targetWrapper.classList.remove("video-wrapper-large"); targetWrapper.classList.toggle("video-wrapper-small"); };
      controlsDiv.appendChild(enlargeBtn); controlsDiv.appendChild(shrinkBtn);
  }
  if(targetWrapper.id !== 'map-box') {
      const maxBtn = document.createElement("button"); maxBtn.className = "icon-btn"; maxBtn.innerHTML = "🖥️";
      maxBtn.onclick = () => { if (!document.fullscreenElement) { targetWrapper.requestFullscreen().catch(e => e); } else { document.exitFullscreen(); } };
      controlsDiv.appendChild(maxBtn);
  }
  targetWrapper.appendChild(controlsDiv);
}

// Ensure Panels have Fullscreen capability
const whiteboardBox = document.getElementById("whiteboard-box");
const mapBox = document.getElementById("map-box");
const presentationBox = document.getElementById("presentation-box");
const officeBox = document.getElementById("office-box");
if(whiteboardBox) addSizeControls(whiteboardBox, whiteboardBox);
if(mapBox) addSizeControls(mapBox, mapBox);
if(presentationBox) addSizeControls(presentationBox, presentationBox);
if(officeBox) addSizeControls(officeBox, officeBox);

// ==========================================
// 2. Map Fullscreen Setup
// ==========================================
document.getElementById("mapFullscreenBtn")?.addEventListener("click", () => {
    const mapCont = document.getElementById("map-container");
    if (!document.fullscreenElement) { mapCont.requestFullscreen().catch(e => e); } 
    else { document.exitFullscreen(); }
});

// ==========================================
// 3. Main Panel Toggling
// ==========================================
function hideAllBigPanels() {
    if(whiteboardBox) whiteboardBox.style.display = "none";
    if(mapBox) mapBox.style.display = "none";
    if(presentationBox) presentationBox.style.display = "none";
    if(officeBox) officeBox.style.display = "none";
    
    const tWb = document.getElementById("toggleWbBtn");
    const tMap = document.getElementById("toggleMapBtn");
    const tPres = document.getElementById("togglePresBtn");
    const tOffice = document.getElementById("toggleOfficeBtn");
    
    if(tWb) { tWb.dataset.show = "false"; tWb.style.background = "linear-gradient(135deg, #3498db, #2980b9)"; }
    if(tMap) { tMap.dataset.show = "false"; tMap.style.background = "linear-gradient(135deg, #27ae60, #2ecc71)"; }
    if(tPres) { tPres.dataset.show = "false"; tPres.style.background = "linear-gradient(135deg, #f1c40f, #f39c12)"; }
    if(tOffice) { tOffice.dataset.show = "false"; tOffice.style.background = "linear-gradient(135deg, #c0392b, #e74c3c)"; }
}

document.getElementById("togglePresBtn")?.addEventListener("click", function() { const isShowing = this.dataset.show === "true"; socket.emit("pres-toggle", { room: currentRoom, show: !isShowing }); });
document.getElementById("toggleWbBtn")?.addEventListener("click", function() { const isShowing = this.dataset.show === "true"; socket.emit("wb-toggle", { room: currentRoom, show: !isShowing }); });
document.getElementById("toggleMapBtn")?.addEventListener("click", function() { const isShowing = this.dataset.show === "true"; socket.emit("map-toggle", { room: currentRoom, show: !isShowing }); });
document.getElementById("toggleOfficeBtn")?.addEventListener("click", function() { const isShowing = this.dataset.show === "true"; socket.emit("office-toggle", { room: currentRoom, show: !isShowing }); });

socket.on("pres-toggle", (data) => {
  if(data.show) { hideAllBigPanels(); if(presentationBox) presentationBox.style.display = "block"; if(isHost){ const btn = document.getElementById("togglePresBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } } 
  else { if(presentationBox) presentationBox.style.display = "none"; if(isHost){ const btn = document.getElementById("togglePresBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #f1c40f, #f39c12)";} } }
});

socket.on("wb-toggle", (data) => {
  if (data.show) { hideAllBigPanels(); if(whiteboardBox) whiteboardBox.style.display = "block"; if(isHost){ const btn = document.getElementById("toggleWbBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } } 
  else { if(whiteboardBox) whiteboardBox.style.display = "none"; if(isHost){ const btn = document.getElementById("toggleWbBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #3498db, #2980b9)";} } }
});

socket.on("map-toggle", (data) => {
  if (data.show) { hideAllBigPanels(); if(mapBox) mapBox.style.display = "block"; setTimeout(() => { if(typeof geoMap !== 'undefined') geoMap.invalidateSize(); }, 100); if(isHost){ const btn = document.getElementById("toggleMapBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } } 
  else { if(mapBox) mapBox.style.display = "none"; if(isHost){ const btn = document.getElementById("toggleMapBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #27ae60, #2ecc71)";} } }
});

socket.on("office-toggle", (data) => {
  if (data.show) { hideAllBigPanels(); if(officeBox) officeBox.style.display = "block"; if(isHost){ const btn = document.getElementById("toggleOfficeBtn"); if(btn){btn.dataset.show="true"; btn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } } 
  else { if(officeBox) officeBox.style.display = "none"; if(isHost){ const btn = document.getElementById("toggleOfficeBtn"); if(btn){btn.dataset.show="false"; btn.style.background="linear-gradient(135deg, #c0392b, #e74c3c)";} } }
});

// ==========================================
// 4. Hamburger Menu Logic
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
    const title = document.getElementById("convTitleText");
    try {
        if(title) title.textContent = "🔄 Fetching Live...";
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        liveExchangeRates = data.rates;
        if(title) title.textContent = "🔄 Live Currency";
    } catch(e) {
        if(title) title.textContent = "🔄 Currency (Offline)";
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
    const type = convType.value; const val = parseFloat(convInput.value) || 0;
    const from = convFrom.value; const to = convTo.value;
    
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

toggleConvBtn?.addEventListener("click", () => { 
    if(convModal) {
        convModal.style.display = convModal.style.display === "none" || convModal.style.display === "" ? "block" : "none"; 
        if(convModal.style.display === "block") populateConvDropdowns(); 
    }
});

convType?.addEventListener("change", populateConvDropdowns);
convInput?.addEventListener("input", calculateConversion);
convFrom?.addEventListener("change", calculateConversion);
convTo?.addEventListener("change", calculateConversion);

document.getElementById("closeConvBtn")?.addEventListener("pointerdown", (e) => { e.stopPropagation(); if(convModal) convModal.style.display = "none"; });

let isConvDragging = false; let convStartX, convStartY, convInitialX, convInitialY;
document.getElementById("converter-header")?.addEventListener("pointerdown", (e) => { 
    if(e.target === document.getElementById("closeConvBtn")) return;
    isConvDragging = true; convStartX = e.clientX; convStartY = e.clientY; 
    const rect = convModal.getBoundingClientRect(); convInitialX = rect.left; convInitialY = rect.top; 
    convModal.style.right = "auto"; convModal.style.left = convInitialX + "px"; convModal.style.top = convInitialY + "px"; 
});
document.addEventListener("pointermove", (e) => { if(!isConvDragging || !convModal) return; convModal.style.left = (convInitialX + e.clientX - convStartX) + "px"; convModal.style.top = (convInitialY + e.clientY - convStartY) + "px"; });
document.addEventListener("pointerup", () => isConvDragging = false);

// ==========================================
// 6. CALCULATOR
// ==========================================
const calcModal = document.getElementById("calc-modal");
const toggleCalcBtn = document.getElementById("toggleCalcBtn");
const calcDisplay = document.getElementById("calc-display");

toggleCalcBtn?.addEventListener("click", () => { if(calcModal) calcModal.style.display = calcModal.style.display === "none" || calcModal.style.display === "" ? "block" : "none"; });
window.calcAppend = (val) => { if(calcDisplay) calcDisplay.value += val; };
window.calcClear = () => { if(calcDisplay) calcDisplay.value = ""; };
window.calcCalculate = () => { if(calcDisplay) { try { calcDisplay.value = eval(calcDisplay.value); } catch(e) { calcDisplay.value = "Error"; setTimeout(calcClear, 1000); } } };

document.addEventListener("keydown", (e) => {
    if (calcModal && calcModal.style.display === "block") {
        const key = e.key;
        if (/^[0-9\.\+\-\*\/]$/.test(key)) calcAppend(key);
        else if (key === "Enter" || key === "=") { e.preventDefault(); calcCalculate(); } 
        else if (key === "Escape" || key === "Clear" || key === "Delete") calcClear();
        else if (key === "Backspace" && calcDisplay) calcDisplay.value = calcDisplay.value.slice(0, -1);
    }
});

document.getElementById("closeCalcBtn")?.addEventListener("pointerdown", (e) => { e.stopPropagation(); if(calcModal) calcModal.style.display = "none"; });

let isCalcDragging = false; let calcInitialXCalc, calcInitialYCalc;
document.getElementById("calc-header")?.addEventListener("pointerdown", (e) => { 
    if(e.target === document.getElementById("closeCalcBtn")) return;
    isCalcDragging = true; calcStartX = e.clientX; calcStartY = e.clientY; 
    const rect = calcModal.getBoundingClientRect(); calcInitialXCalc = rect.left; calcInitialYCalc = rect.top; 
    calcModal.style.right = "auto"; calcModal.style.left = calcInitialXCalc + "px"; calcModal.style.top = calcInitialYCalc + "px"; 
});
document.addEventListener("pointermove", (e) => { if(!isCalcDragging || !calcModal) return; calcModal.style.left = (calcInitialXCalc + e.clientX - calcStartX) + "px"; calcModal.style.top = (calcInitialYCalc + e.clientY - calcStartY) + "px"; });
document.addEventListener("pointerup", () => isCalcDragging = false);

// ==========================================
// 7. VYDEX OFFICE LOGIC
// ==========================================
const officeTabs = document.querySelectorAll(".office-tab");
const officeTabBtns = document.querySelectorAll(".office-tab-btn");
const wordEditor = document.getElementById("wordEditor");
const excelGrid = document.getElementById("excelGrid");
const pptEditor = document.getElementById("pptEditor");
const officeSyncToggle = document.getElementById("officeSyncToggle");
let isOfficeSyncing = false;

if(excelGrid) {
    let rowsHtml = "";
    for(let r=1; r<=10; r++) {
        let row = `<tr><td style="background:#e0e0e0; font-weight:bold; width:40px; text-align:center;">${r}</td>`;
        for(let c=0; c<5; c++) row += `<td contenteditable="false"></td>`;
        row += `</tr>`; rowsHtml += row;
    }
    excelGrid.innerHTML += rowsHtml;
}

officeTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        officeTabBtns.forEach(b => b.classList.remove("active-tool"));
        btn.classList.add("active-tool");
        officeTabs.forEach(t => t.style.display = "none");
        document.getElementById(btn.dataset.target).style.display = "block";
        if(isHost && isOfficeSyncing) socket.emit("office-sync", { room: currentRoom, action: "tab-switch", target: btn.dataset.target });
    });
});

officeSyncToggle?.addEventListener("change", (e) => {
    isOfficeSyncing = e.target.checked;
    if(wordEditor) wordEditor.contentEditable = isOfficeSyncing ? "true" : "false";
    if(pptEditor) pptEditor.contentEditable = isOfficeSyncing ? "true" : "false";
    document.querySelectorAll('#excelGrid td[contenteditable]').forEach(td => td.contentEditable = isOfficeSyncing ? "true" : "false");
    const wordToolbar = document.getElementById("office-word")?.firstElementChild;
    if(wordToolbar) wordToolbar.style.display = isOfficeSyncing ? "flex" : "none";
    if(isOfficeSyncing) emitOfficeData();
});

function emitOfficeData() {
    if(!isHost || !isOfficeSyncing) return;
    socket.emit("office-sync", {
        room: currentRoom, action: "content-update",
        wordData: wordEditor?.innerHTML || "", pptData: pptEditor?.innerHTML || "",
        excelData: excelGrid ? Array.from(excelGrid.rows).slice(1).map(r => Array.from(r.cells).slice(1).map(c => c.innerHTML)) : []
    });
}

wordEditor?.addEventListener("input", emitOfficeData);
pptEditor?.addEventListener("input", emitOfficeData);
excelGrid?.addEventListener("input", emitOfficeData);

document.getElementById("officeDownloadBtn")?.addEventListener("click", () => {
    let activeTab = Array.from(officeTabs).find(t => t.style.display === "block")?.id;
    let content = "", ext = "", mime = "";
    if(activeTab === 'office-word') { content = wordEditor?.innerText || ""; ext = "txt"; mime = "text/plain"; }
    if(activeTab === 'office-ppt') { content = pptEditor?.innerText || ""; ext = "txt"; mime = "text/plain"; }
    if(activeTab === 'office-excel' && excelGrid) {
        content = Array.from(excelGrid.rows).map(r => Array.from(r.cells).map(c => c.innerText).join(",")).join("\n"); ext = "csv"; mime = "text/csv";
    }
    const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `VYDEX_Document.${ext}`; a.click();
});

// ==========================================
// 8. FORCED LOCKED FULLSCREEN & PiP
// ==========================================
function applyForcedFullscreen(targetId, isActive) {
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    if (isActive) {
        document.body.classList.add("no-scroll"); targetEl.classList.add("locked-fullscreen");
        if (!isHost && globalHostUid) {
            const hostWrapper = document.getElementById(`remote-wrapper-${globalHostUid}`);
            if (hostWrapper) hostWrapper.classList.add("host-pip");
        }
        showNotification("🔒 Host locked screen in Broadcast Mode.", "danger");
    } else {
        document.body.classList.remove("no-scroll"); targetEl.classList.remove("locked-fullscreen");
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
    e.target.dataset.forced = !isForced ? "true" : "false"; e.target.textContent = !isForced ? "🔓 Unlock Audience" : "🔒 Force Fullscreen"; e.target.style.background = !isForced ? "#2ecc71" : "#e74c3c";
});

document.getElementById("officeForceFsBtn")?.addEventListener("click", (e) => {
    const isForced = e.target.dataset.forced === "true";
    socket.emit("force-screen", { room: currentRoom, target: "office-box", active: !isForced });
    e.target.dataset.forced = !isForced ? "true" : "false"; e.target.textContent = !isForced ? "🔓 Unlock Audience" : "🔒 Force Fullscreen"; e.target.style.background = !isForced ? "#2ecc71" : "#e74c3c";
});

socket.on("force-screen", (data) => { if (!isHost) applyForcedFullscreen(data.target, data.active); });
socket.on("office-sync", (data) => {
    if(data.action === "tab-switch") {
        officeTabBtns.forEach(b => b.classList.remove("active-tool"));
        const tar = document.querySelector(`[data-target='${data.target}']`);
        if(tar) tar.classList.add("active-tool");
        officeTabs.forEach(t => t.style.display = "none");
        const panel = document.getElementById(data.target);
        if(panel) panel.style.display = "block";
    }
    if(data.action === "content-update" && !isHost) {
        if(wordEditor) wordEditor.innerHTML = data.wordData;
        if(pptEditor) pptEditor.innerHTML = data.pptData;
        if(excelGrid) {
            const rows = Array.from(excelGrid.rows).slice(1);
            data.excelData.forEach((rData, rIdx) => {
                if(rows[rIdx]) {
                    const cells = Array.from(rows[rIdx].cells).slice(1);
                    rData.forEach((cData, cIdx) => { if(cells[cIdx] && cells[cIdx].innerHTML !== cData) cells[cIdx].innerHTML = cData; });
                }
            });
        }
    }
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
    if(!formulaLibrary) return; formulaLibrary.innerHTML = "";
    if(!formulas[category]) return;
    formulas[category].forEach(f => {
        const btn = document.createElement("button"); btn.textContent = f.name; btn.style.cssText = "background: rgba(255,255,255,0.1); color: white; border: 1px solid var(--accent); padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;";
        btn.onclick = () => { if(mathInput) mathInput.value = f.eq; currentFormulaDesc = f.desc; if(mathExplanationInput) mathExplanationInput.textContent = "ℹ️ " + f.desc; };
        formulaLibrary.appendChild(btn);
    });
}
document.getElementById("mathCategory")?.addEventListener("change", (e) => loadFormulas(e.target.value));
loadFormulas("algebra"); 

document.getElementById("openMathBtn")?.addEventListener("click", () => { if(mathModal) mathModal.style.display = "block"; });
document.getElementById("closeMathBtn")?.addEventListener("click", () => { if(mathModal) mathModal.style.display = "none"; });
document.getElementById("broadcastMathBtn")?.addEventListener("click", () => {
    const eq = mathInput?.value.trim(); if(!eq) return;
    try { katex.renderToString(eq); socket.emit("math-equation", { room: currentRoom, equation: eq, desc: currentFormulaDesc, sender: usernameInput?.value || "User" }); if(mathInput) mathInput.value = ""; if(mathExplanationInput) mathExplanationInput.textContent = ""; } 
    catch(e) { showNotification("Invalid LaTeX Formula!", "danger"); }
});
socket.on("math-equation", (data) => {
    if(mathModal) mathModal.style.display = "block";
    try {
        const html = katex.renderToString(data.equation, { throwOnError: false, displayMode: true });
        const md = document.getElementById("mathDisplay");
        if(md) md.innerHTML = `<div style="font-size:13px; color:var(--primary); margin-bottom:10px;">Shared by: ${data.sender}</div>${html}<div style="font-size:14px; color:#555; margin-top:15px; border-top:1px dashed #ccc; padding-top:10px;"><b>ℹ️ Explanation:</b> ${data.desc}</div>`;
        showNotification("New Math Formula Shared!", "info");
    } catch(e) {}
});

// ==========================================
// 10. PRESENTATION LOGIC
// ==========================================
document.getElementById("presMode")?.addEventListener("change", (e) => {
    const cIn = document.getElementById("companyInputs"); const pIn = document.getElementById("productInputs");
    if(e.target.value === "company") { if(cIn) cIn.style.display = "flex"; if(pIn) pIn.style.display = "none"; } 
    else { if(cIn) cIn.style.display = "none"; if(pIn) pIn.style.display = "flex"; }
});

document.getElementById("generateGraphBtn")?.addEventListener("click", () => {
    const industry = document.getElementById("presIndustry")?.value || "Business";
    const currency = document.getElementById("presCurrency")?.value || "$";
    const mode = document.getElementById("presMode")?.value || "company";
    const growth = parseFloat(document.getElementById("presGrowth")?.value) || 10;
    
    let labels = []; let revenues = []; let unitsArr = []; let currentRevenue = 1000; let currentUnits = 100; let unitPrice = 50;
    for(let y = 2024; y <= 2029; y++) {
        labels.push(y.toString());
        if(mode === "company") { revenues.push(Math.round(currentRevenue)); currentRevenue += (currentRevenue * (growth / 100)); } 
        else { revenues.push(Math.round(unitPrice * currentUnits)); currentUnits += (currentUnits * (growth / 100)); }
    }

    const chartConfig = {
        type: 'line', data: { labels: labels, datasets: [{ label: `${industry} Projected Growth (${currency})`, data: revenues, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.2)', borderWidth: 3, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false }
    };
    let tableHTML = `<tr><th>Year</th><th>Revenue (${currency})</th></tr>`;
    for(let i=0; i<labels.length; i++) tableHTML += `<tr><td>${labels[i]}</td><td><strong style="color:var(--primary)">${currency}${revenues[i].toLocaleString()}</strong></td></tr>`;

    socket.emit("presentation-data", { room: currentRoom, chartConfig, industry, tableHTML, view: 'chart' });
});

document.getElementById("viewGraphBtn")?.addEventListener("click", () => { socket.emit("pres-view-switch", {room: currentRoom, view: 'chart'}); });
document.getElementById("viewExcelBtn")?.addEventListener("click", () => { socket.emit("pres-view-switch", {room: currentRoom, view: 'excel'}); });
socket.on("pres-view-switch", (data) => {
    const exc = document.getElementById("excel-container"); const can = document.getElementById("presentationCanvas");
    if(data.view === 'chart') { if(exc) exc.style.display = "none"; if(can) can.style.display = "block"; } else { if(can) can.style.display = "none"; if(exc) exc.style.display = "block"; }
});

socket.on("presentation-data", (data) => {
    const pt = document.getElementById("pres-title"); if(pt) pt.textContent = `${data.industry} Growth Projection`;
    const et = document.getElementById("excelTable"); if(et) et.innerHTML = data.tableHTML;
    const vgb = document.getElementById("viewGraphBtn"); if(isHost && vgb && vgb.parentElement) vgb.parentElement.style.display = "flex";
    const can = document.getElementById("presentationCanvas");
    if(can) {
        const ctxChart = can.getContext('2d'); if(businessChart) businessChart.destroy();
        businessChart = new Chart(ctxChart, data.chartConfig);
    }
});

let laserTimeout;
document.getElementById("presentation-container")?.addEventListener("pointermove", (e) => {
    if(!isHost || presentationBox?.style.display === "none") return;
    const rect = e.currentTarget.getBoundingClientRect(); socket.emit("laser-pointer", { room: currentRoom, x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
});
document.getElementById("presentation-container")?.addEventListener("pointerleave", () => { if(isHost) socket.emit("laser-pointer", { room: currentRoom, hide: true }); });
socket.on("laser-pointer", (data) => {
    const lp = document.getElementById("laser-pointer"); if(!lp) return;
    if(data.hide) { lp.style.display = "none"; return; }
    lp.style.display = "block"; lp.style.left = (data.x * 100) + "%"; lp.style.top = (data.y * 100) + "%";
    clearTimeout(laserTimeout); laserTimeout = setTimeout(() => { lp.style.display = "none"; }, 2000);
});

// ==========================================
// 11. DUAL-LAYER WHITEBOARD
// ==========================================
const canvas = document.getElementById('whiteboard');
const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null; 
const bgCanvas = document.getElementById('bg-whiteboard');
const bgCtx = bgCanvas ? bgCanvas.getContext('2d', { willReadFrequently: true }) : null; 

if(bgCtx && ctx) { bgCtx.fillStyle = "#ffffff"; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); ctx.clearRect(0, 0, canvas.width, canvas.height); }

let canDraw = false; let currentBrushColor = "#000000"; let currentBrushSize = 5; let currentTool = 'pen'; 
let drawing = false; let startX = 0; let startY = 0; let canvasSnapshot; 
let stampImage = null; let stampScale = 1.0; let isStamping = false;
let currentEraserSize = 30; let isRightClickErasing = false; let prevToolState = 'pen';
let wbPagesBg = []; let wbPagesFg = []; let currentWbPage = 0;
wbPagesBg[0] = ''; wbPagesFg[0] = '';

function saveCurrentPage() {
    if(!bgCanvas || !canvas) return;
    wbPagesBg[currentWbPage] = bgCanvas.toDataURL("image/jpeg", 0.5); wbPagesFg[currentWbPage] = canvas.toDataURL("image/png", 0.5);
}

function loadPage(index) {
    if (index < 0 || index >= wbPagesBg.length || !bgCanvas || !canvas) return;
    saveCurrentPage(); currentWbPage = index;
    const txt = document.getElementById("wbPageNum"); if(txt) txt.textContent = `${currentWbPage + 1} / ${wbPagesBg.length}`;
    bgCtx.fillStyle = "#ffffff"; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); ctx.clearRect(0, 0, canvas.width, canvas.height); 
    if(wbPagesBg[currentWbPage]) { const imgBg = new Image(); imgBg.onload = () => { bgCtx.drawImage(imgBg, 0, 0); }; imgBg.src = wbPagesBg[currentWbPage]; }
    if(wbPagesFg[currentWbPage]) { const imgFg = new Image(); imgFg.onload = () => { ctx.drawImage(imgFg, 0, 0); }; imgFg.src = wbPagesFg[currentWbPage]; }
    if(isHost) socket.emit("wb-page-sync", { room: currentRoom, imageBg: wbPagesBg[currentWbPage], imageFg: wbPagesFg[currentWbPage], num: currentWbPage + 1, total: wbPagesBg.length });
}

document.getElementById("wbAddPage")?.addEventListener("click", () => {
    saveCurrentPage(); wbPagesBg.push(''); wbPagesFg.push(''); currentWbPage = wbPagesBg.length - 1;
    const txt = document.getElementById("wbPageNum"); if(txt) txt.textContent = `${currentWbPage + 1} / ${wbPagesBg.length}`;
    if(bgCtx) { bgCtx.fillStyle = "#ffffff"; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); }
    if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    showNotification("Created new whiteboard page!", "info");
    socket.emit("wb-page-sync", { room: currentRoom, imageBg: '', imageFg: '', num: currentWbPage + 1, total: wbPagesBg.length });
});
document.getElementById("wbPrevPage")?.addEventListener("click", () => loadPage(currentWbPage - 1)); 
document.getElementById("wbNextPage")?.addEventListener("click", () => loadPage(currentWbPage + 1)); 

socket.on("wb-page-sync", (data) => {
    const txt = document.getElementById("wbPageNum"); if(txt) txt.textContent = `${data.num} / ${data.total}`;
    if(bgCtx) { bgCtx.fillStyle = "#ffffff"; bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height); }
    if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(data.imageBg) { const imgBg = new Image(); imgBg.onload = () => { bgCtx?.drawImage(imgBg, 0, 0); }; imgBg.src = data.imageBg; }
    if(data.imageFg) { const imgFg = new Image(); imgFg.onload = () => { ctx?.drawImage(imgFg, 0, 0); }; imgFg.src = data.imageFg; }
});

const wbShapesMenu = document.getElementById("wb-shapes-menu");
const wbSubjectsMenu = document.getElementById("wb-subjects-menu");
const wbEraserMenu = document.getElementById("wb-eraser-menu");

document.getElementById("toggleShapesBtn")?.addEventListener("click", () => { if(wbShapesMenu) wbShapesMenu.style.display = wbShapesMenu.style.display === "none" ? "block" : "none"; if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none"; if(wbEraserMenu) wbEraserMenu.style.display = "none"; });
document.getElementById("toggleSubjectsBtn")?.addEventListener("click", () => { if(wbSubjectsMenu) wbSubjectsMenu.style.display = wbSubjectsMenu.style.display === "none" ? "block" : "none"; if(wbShapesMenu) wbShapesMenu.style.display = "none"; if(wbEraserMenu) wbEraserMenu.style.display = "none"; });

const subjectAssets = {
    geography: [ {name: "World Map", url: "assets/subjects/world_map.pdf"}, {name: "India Political", url: "assets/subjects/india_political.pdf"}, {name: "India Physical", url: "assets/subjects/india_physical.pdf"} ],
    biology: [ {name: "Human Skeleton", url: "assets/subjects/human_skeleton.pdf"}, {name: "Respiratory System", url: "assets/subjects/respiratory_system.pdf"}, {name: "Human Heart", url: "assets/subjects/human_heart.pdf"} ],
    chemistry: [ {name: "Periodic Table", url: "assets/subjects/periodic_table.pdf"} ],
    physics: [ {name: "Electric Circuit", url: "assets/subjects/electric_circuit.pdf"} ],
    maths: [ {name: "Graph Paper", url: "assets/subjects/graph_paper.pdf"} ],
    commerce: [ {name: "Supply & Demand", url: "assets/subjects/supply_demand.pdf"} ]
};

function prepareStamp(src) {
    if(!canvas) return;
    const img = new Image(); if (!src.startsWith("data:")) { img.crossOrigin = "Anonymous"; }
    img.onload = () => {
        stampImage = img; stampScale = Math.min((canvas.width * 0.6) / img.width, (canvas.height * 0.6) / img.height);
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
        if (url.endsWith('.png') || url.endsWith('.jpg')) { prepareStamp(url); if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none"; } 
        else if (url.endsWith('.pdf')) {
            if(typeof pdfjsLib === 'undefined') return;
            const pdf = await pdfjsLib.getDocument(url).promise; const page = await pdf.getPage(1); const viewport = page.getViewport({scale: 2.0}); 
            const tc = document.createElement('canvas'); const tCtx = tc.getContext('2d'); tc.height = viewport.height; tc.width = viewport.width;
            await page.render({canvasContext: tCtx, viewport: viewport}).promise; prepareStamp(tc.toDataURL("image/jpeg", 0.8));
            if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none";
        }
    } catch(e) { showNotification(`Failed to load ${name}.`, "danger"); }
}

document.getElementById("subjectCategory")?.addEventListener("change", (e) => {
    const list = document.getElementById("subjectAssetsList"); if(!list || !subjectAssets[e.target.value]) return;
    list.innerHTML = "";
    subjectAssets[e.target.value].forEach(asset => {
        const btn = document.createElement("button"); btn.textContent = "➕ Insert " + asset.name;
        btn.style.cssText = "background: rgba(255,255,255,0.1); color: white; border: 1px solid var(--accent); padding: 8px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px;";
        btn.onclick = () => { loadAssetToCanvas(asset.url, asset.name); }; list.appendChild(btn);
    });
});

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        let clickedTool = btn.id.replace('tool-', '');
        if (clickedTool === 'eraser' && currentTool === 'eraser') { if(wbEraserMenu) wbEraserMenu.style.display = wbEraserMenu.style.display === "none" ? "block" : "none"; return; }
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool')); btn.classList.add('active-tool');
        currentTool = clickedTool; 
        if(wbShapesMenu) wbShapesMenu.style.display = "none"; if(wbSubjectsMenu) wbSubjectsMenu.style.display = "none"; if(wbEraserMenu) wbEraserMenu.style.display = currentTool === 'eraser' ? "block" : "none";
        if(isStamping) { isStamping = false; if(canvasSnapshot && ctx) ctx.putImageData(canvasSnapshot, 0, 0); }
    });
});

document.querySelectorAll('.eraser-size-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.eraser-size-btn').forEach(b => b.classList.remove('active-tool')); btn.classList.add('active-tool');
        currentEraserSize = parseInt(btn.dataset.size); if(wbEraserMenu) wbEraserMenu.style.display = "none";
    });
});

document.getElementById('wb-color')?.addEventListener("input", (e) => { currentBrushColor = e.target.value; });
document.getElementById('wb-size')?.addEventListener("input", (e) => { currentBrushSize = e.target.value; });
document.getElementById('wb-clear')?.addEventListener("click", () => {
    if (!canDraw || !ctx || !canvas) return; 
    ctx.clearRect(0, 0, canvas.width, canvas.height); socket.emit("clear-whiteboard", { room: currentRoom });
    wbPagesFg[currentWbPage] = canvas.toDataURL("image/png", 0.5); showNotification("Annotations cleared. Background intact.", "info");
});
socket.on("clear-whiteboard", () => { if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); });

function getCanvasPoint(e) { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }; }

if(canvas) {
    canvas.addEventListener('wheel', (e) => {
        if (isStamping && stampImage && ctx) {
            e.preventDefault(); if (e.deltaY < 0) stampScale *= 1.1; else stampScale *= 0.9; 
            const pt = getCanvasPoint(e); ctx.putImageData(canvasSnapshot, 0, 0);
            let w = stampImage.width * stampScale; let h = stampImage.height * stampScale;
            ctx.globalAlpha = 0.6; ctx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h); ctx.globalAlpha = 1.0;
        }
    }, {passive: false});

    canvas.addEventListener('pointerdown', (e) => { 
      if (!canDraw) return; 
      if (e.button === 2 || e.buttons === 2 || (e.pointerType === 'pen' && e.button === 5)) { isRightClickErasing = true; prevToolState = currentTool; currentTool = 'eraser'; e.preventDefault(); } 
      else if (e.button !== 0 && e.pointerType !== 'touch') { return; }
      
      const pt = getCanvasPoint(e);
      if (isStamping && stampImage && !isRightClickErasing) {
          if(ctx) ctx.putImageData(canvasSnapshot, 0, 0); let w = stampImage.width * stampScale; let h = stampImage.height * stampScale;
          if(bgCtx) bgCtx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h);
          let tempCanvas = document.createElement("canvas"); let syncScale = Math.min(1, 800 / Math.max(w, h)); tempCanvas.width = w * syncScale; tempCanvas.height = h * syncScale; let tCtx = tempCanvas.getContext("2d");
          tCtx.fillStyle = "#ffffff"; tCtx.fillRect(0,0, tempCanvas.width, tempCanvas.height); tCtx.drawImage(stampImage, 0, 0, tempCanvas.width, tempCanvas.height);
          let sendSrc = tempCanvas.toDataURL("image/jpeg", 0.5); 
          socket.emit("wb-stamp", { room: currentRoom, image: sendSrc, x: pt.x - w/2, y: pt.y - h/2, w: w, h: h });
          if(bgCanvas) wbPagesBg[currentWbPage] = bgCanvas.toDataURL("image/jpeg", 0.5);
          isStamping = false; currentTool = 'pen'; document.getElementById('tool-pen')?.classList.add('active-tool');
          if(ctx) canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); showNotification("Stamped successfully!", "join"); return;
      }
      if(currentTool === 'pointer') return; 
      drawing = true; startX = pt.x; startY = pt.y; if(ctx) canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!canDraw) return;
      const pt = getCanvasPoint(e);
      if (isStamping && stampImage && !isRightClickErasing) { 
          if(ctx) { ctx.putImageData(canvasSnapshot, 0, 0); let w = stampImage.width * stampScale; let h = stampImage.height * stampScale; ctx.globalAlpha = 0.6; ctx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h); ctx.globalAlpha = 1.0; } return; 
      }
      if(currentTool === 'pointer') { socket.emit("wb-pointer", { room: currentRoom, x: pt.x / canvas.width, y: pt.y / canvas.height }); return; }
      if (!drawing) return;
      if(['pen', 'brush', 'spray', 'eraser'].includes(currentTool)) {
          let pressure = (e.pointerType === 'pen' && e.pressure > 0) ? e.pressure : 0.5; let pressureMult = e.pointerType === 'pen' ? (pressure * 2.5) : 1; 
          let activeSize = currentTool === 'eraser' ? currentEraserSize : (currentBrushSize * pressureMult); if(activeSize < 1) activeSize = 1;
          
          if(ctx) {
              if(currentTool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(pt.x, pt.y); ctx.strokeStyle = "rgba(0,0,0,1)"; ctx.lineWidth = activeSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.closePath(); ctx.globalCompositeOperation = 'source-over'; } 
              else { ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(pt.x, pt.y); ctx.strokeStyle = currentBrushColor; ctx.lineWidth = activeSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.closePath(); }
          }
          socket.emit('drawing', { type: 'free', x0: startX, y0: startY, x1: pt.x, y1: pt.y, color: currentBrushColor, size: activeSize, toolType: currentTool, room: currentRoom });
          startX = pt.x; startY = pt.y;
      }
    });

    canvas.addEventListener('pointerup', (e) => { 
      if (drawing && canDraw && currentTool !== 'pointer' && currentTool !== 'fill') {
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

// ==========================================
// 12. MAP INIT
// ==========================================
function initWorldMap() {
  if(!document.getElementById('map-container') || typeof L === 'undefined') return;
  geoMap = L.map('map-container', { center: [20.0, 0.0], zoom: 3, zoomControl: false });
  L.control.zoom({ position: 'bottomleft' }).addTo(geoMap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', crossOrigin: true }).addTo(geoMap);
  labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'markerPane', crossOrigin: true }).addTo(geoMap);
  const geocoder = L.Control.geocoder({ defaultMarkGeocode: true }).addTo(geoMap);
  const gcContainer = geocoder.getContainer(); gcContainer.style.position = "static"; 
  document.getElementById('map-controls-container')?.appendChild(gcContainer);
}
initWorldMap();

// ==========================================
// 13. AGORA WEBRTC CORE (Restored)
// ==========================================
function createLocalCard(name) {
  let el = document.getElementById("local-player"); if (el) return "local-player";
  const localContainer = document.createElement("div"); localContainer.className = "video-card"; localContainer.id = "local-player";
  localContainer.style.width = "100%"; localContainer.style.height = "200px"; localContainer.style.position = "relative";
  const label = document.createElement("div"); label.style.position = "absolute"; label.style.top = "6px"; label.style.left = "6px"; label.style.padding = "4px 8px"; label.style.background = "rgba(0,0,0,0.5)"; label.style.color = "#fff"; label.style.borderRadius = "6px"; label.style.fontSize = "13px"; label.style.zIndex = "10"; label.textContent = `${name} (You)`;
  localContainer.appendChild(label); 
  if(videoArea) { videoArea.prepend(localContainer); addSizeControls(localContainer, localContainer); }
  return "local-player";
}

function createRemoteWrapper(uid, labelText) {
  let wrapper = document.getElementById(`remote-wrapper-${uid}`); if (wrapper) return `remote-${uid}`;
  wrapper = document.createElement("div"); wrapper.id = `remote-wrapper-${uid}`; wrapper.style.display = "flex"; wrapper.style.flexDirection = "column"; wrapper.style.alignItems = "center"; wrapper.style.gap = "6px"; wrapper.style.width = "100%"; 
  const card = document.createElement("div"); card.className = "video-card"; card.id = `remote-${uid}`; card.style.width = "100%"; card.style.height = "200px"; card.style.position = "relative";
  const labelDiv = document.createElement("div"); labelDiv.style.position = "absolute"; labelDiv.style.top = "6px"; labelDiv.style.left = "6px"; labelDiv.style.padding = "4px 8px"; labelDiv.style.background = "rgba(0,0,0,0.5)"; labelDiv.style.color = "#fff"; labelDiv.style.borderRadius = "6px"; labelDiv.style.fontSize = "13px"; labelDiv.style.zIndex = "10"; labelDiv.textContent = labelText || `User ${uid}`; card.appendChild(labelDiv);
  const controlsDiv = document.createElement("div"); controlsDiv.style.display = "flex"; controlsDiv.style.gap = "5px"; controlsDiv.style.justifyContent = "center"; controlsDiv.style.width = "100%";
  const muteRemoteBtn = document.createElement("button"); muteRemoteBtn.className = "small-btn host-only-btn"; muteRemoteBtn.style.display = isHost ? "inline-block" : "none"; muteRemoteBtn.textContent = "🎙️❌"; muteRemoteBtn.title = "Mute User"; muteRemoteBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "mute-audio" });
  const camOffBtn = document.createElement("button"); camOffBtn.className = "small-btn host-only-btn"; camOffBtn.style.display = isHost ? "inline-block" : "none"; camOffBtn.textContent = "📹❌"; camOffBtn.title = "Disable Camera"; camOffBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "disable-video" });
  const wbBtn = document.createElement("button"); wbBtn.className = "small-btn host-only-btn"; wbBtn.style.display = isHost ? "inline-block" : "none"; wbBtn.textContent = "🖍️ WB"; wbBtn.dataset.access = "false"; wbBtn.style.background = "var(--primary)";
  wbBtn.onclick = () => { const isGranting = wbBtn.dataset.access === "false"; socket.emit("wb-control", { room: currentRoom, targetUid: uid.toString(), action: isGranting ? "grant" : "revoke" }); wbBtn.dataset.access = isGranting ? "true" : "false"; wbBtn.textContent = isGranting ? "🚫🖍️ WB" : "🖍️ WB"; wbBtn.style.background = isGranting ? "var(--danger)" : "var(--primary)"; };
  controlsDiv.appendChild(muteRemoteBtn); controlsDiv.appendChild(camOffBtn); controlsDiv.appendChild(wbBtn); 
  wrapper.appendChild(card); wrapper.appendChild(controlsDiv); 
  if(videoArea) { videoArea.appendChild(wrapper); addSizeControls(wrapper, card); }
  return `remote-${uid}`;
}

joinBtn?.addEventListener("click", async () => {
  if (joined) return;
  const userName = usernameInput?.value.trim(); const roomId = roomInput?.value.trim(); if (!userName || !roomId) { alert("Enter both Name and Room ID"); return; }
  try {
    const uid = await client.join(APP_ID, roomId, null, userName); localUid = uid.toString();
    try { const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(); localTracks.audioTrack = microphoneTrack; localTracks.videoTrack = cameraTrack; await client.publish([microphoneTrack, cameraTrack]); } catch (mediaErr) { showNotification("Camera/Mic busy. Joined as viewer.", "info"); }
    joined = true; currentRoom = roomId; if(joinSection) joinSection.classList.add("form-out");
    setTimeout(() => {
      if(joinSection) joinSection.style.display = "none"; if(workspace) { workspace.classList.remove("hidden"); workspace.classList.add("workspace-active"); }
      setTimeout(() => { if(typeof geoMap !== 'undefined') geoMap.invalidateSize(); const localId = createLocalCard(userName); if (localTracks.videoTrack) localTracks.videoTrack.play(localId, { fit: "cover" }); }, 300);
    }, 500); 
    socket.emit("join-room", { room: roomId, uid: localUid, name: userName });
    showNotification(`You joined room ${roomId}`, "join"); appendMessage(`System: You joined room ${roomId}`);
  } catch (err) { showNotification("Join failed!", "danger"); }
});

client.on("user-published", async (user, mediaType) => {
  try {
    await client.subscribe(user, mediaType); const uid = user.uid.toString(); remoteUsers[uid] = user;
    if (mediaType === "video") {
      if (user.videoTrack.getTrackId().includes("screen") || uid.includes("screen")) {
        const sc = document.createElement("div"); sc.className = "video-card screen-share-card"; sc.id = `screen-card-${uid}`; sc.style.width = "100%"; sc.style.height = "320px"; sc.style.gridColumn = "1 / -1"; sc.style.border = "3px solid var(--accent)";
        if(videoArea) { videoArea.appendChild(sc); addSizeControls(sc, sc); } user.videoTrack.play(`screen-card-${uid}`, { fit: "contain" });
      } else { const remoteId = createRemoteWrapper(uid, `User ${uid}`); user.videoTrack.play(remoteId, { fit: "cover" }); }
    }
    if (mediaType === "audio" && user.audioTrack) user.audioTrack.play();
  } catch (e) { console.error(e); }
});

client.on("user-unpublished", (user, mediaType) => { if (mediaType === "video") document.getElementById(`screen-card-${user.uid}`)?.remove(); });
client.on("user-left", (user) => { document.getElementById(`remote-wrapper-${user.uid}`)?.remove(); document.getElementById(`screen-card-${user.uid}`)?.remove(); delete remoteUsers[user.uid.toString()]; });
socket.on("user-left", info => { if (info && info.uid) { document.getElementById(`remote-wrapper-${info.uid}`)?.remove(); document.getElementById(`screen-card-${info.uid}`)?.remove(); delete remoteUsers[info.uid.toString()]; } });

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
    if (data.action === "grant") { canDraw = true; const wbt = document.getElementById('wb-toolbar'); if(wbt) wbt.style.display = "flex"; if(canvas) canvas.style.cursor = "crosshair"; const wbs = document.getElementById("wb-status"); if(wbs) wbs.textContent = "(You have access)"; showNotification("Host gave you Whiteboard access! 🎨", "join"); } 
    else if (data.action === "revoke") { canDraw = false; const wbt = document.getElementById('wb-toolbar'); if(wbt) wbt.style.display = "none"; if(canvas) canvas.style.cursor = "not-allowed"; const wbs = document.getElementById("wb-status"); if(wbs) wbs.textContent = "(View Only - Access Revoked)"; showNotification("Your whiteboard access was revoked.", "danger"); }
  }
});

sendMsgBtn?.addEventListener("click", () => { const text = chatInput?.value.trim(); if (!text) return; socket.emit("chat-message", { room: currentRoom, name: usernameInput?.value || "Me", text }); appendMessage(`Me: ${text}`); if(chatInput) chatInput.value = ""; });
chatInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMsgBtn?.click(); } });
socket.on("chat-message", data => { if(data.name === "System" && data.text.includes("left")) return; appendMessage(`${data.name}: ${data.text}`); });
document.getElementById("uploadBtn")?.addEventListener("click", async () => { const f = fileUpload?.files[0]; if (!f) return; const fd = new FormData(); fd.append("file", f); fd.append("room", currentRoom); fd.append("uploader", usernameInput?.value || "User"); try { addFileLink((await (await fetch("/upload", { method: "POST", body: fd })).json()).filename, (await (await fetch("/upload", { method: "POST", body: fd })).json()).url); } catch (err) { } });
function addFileLink(name, url) { const a = document.createElement("a"); a.href = url; a.textContent = name; a.download = name; a.target = "_blank"; if(fileList) fileList.prepend(a); }
socket.on("file-uploaded", data => { addFileLink(data.filename, data.url); showNotification(`${data.uploader} uploaded a file`, "info"); });
socket.on("user-joined", info => showNotification(`${info.name || "User"} joined the room!`, "join"));