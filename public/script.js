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
let currentMusicUrl = null;

// DOM Elements
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
const localMusicMuteBtn = document.getElementById("localMusicMuteBtn"); 

const toggleWbBtn = document.getElementById("toggleWbBtn"); 
const toggleMapBtn = document.getElementById("toggleMapBtn"); 
const togglePresBtn = document.getElementById("togglePresBtn"); 
const openMathBtn = document.getElementById("openMathBtn"); 
const toggleCalcBtn = document.getElementById("toggleCalcBtn"); 

// ==========================================
// 🚀 NAYA: Hamburger Click-Outside Closing Logic
// ==========================================
const controlRowInner = document.getElementById("controlRowInner");
const hamburgerBtn = document.getElementById("hamburgerBtn");
const topAnchor = document.getElementById("top-anchor");

const observer = new IntersectionObserver((entries) => {
    if(!joined) return;
    if (!entries[0].isIntersecting) {
        hamburgerBtn.style.setProperty("display", "block", "important");
        controlRowInner.classList.add("vertical-controls-mode", "hide-vertical");
    } else {
        hamburgerBtn.style.setProperty("display", "none", "important");
        controlRowInner.classList.remove("vertical-controls-mode", "hide-vertical");
    }
}, { threshold: 0 });

if(topAnchor) observer.observe(topAnchor);

hamburgerBtn.addEventListener("click", (e) => {
    e.stopPropagation(); 
    controlRowInner.classList.toggle("hide-vertical");
});

document.addEventListener("click", (e) => {
    if (hamburgerBtn.style.display === "block" && !controlRowInner.classList.contains("hide-vertical")) {
        if (!controlRowInner.contains(e.target) && e.target !== hamburgerBtn) {
            controlRowInner.classList.add("hide-vertical");
        }
    }
});
// ==========================================

const sendMsgBtn = document.getElementById("sendMsg");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const uploadBtn = document.getElementById("uploadBtn");
const fileUpload = document.getElementById("fileUpload");
const fileList = document.getElementById("fileList");

// Draggable Personal Calculator
const calcModal = document.getElementById("calc-modal");
const calcDisplay = document.getElementById("calc-display");
const calcHeader = document.getElementById("calc-header");

toggleCalcBtn.addEventListener("click", () => {
    calcModal.style.display = calcModal.style.display === "none" || calcModal.style.display === "" ? "block" : "none";
});
window.calcAppend = (val) => { calcDisplay.value += val; };
window.calcClear = () => { calcDisplay.value = ""; };
window.calcCalculate = () => { 
    try { calcDisplay.value = eval(calcDisplay.value); } 
    catch(e) { calcDisplay.value = "Error"; setTimeout(calcClear, 1000); } 
};

// Keyboard Numpad Listeners
document.addEventListener("keydown", (e) => {
    if (calcModal.style.display === "block") {
        const key = e.key;
        if (/^[0-9\.\+\-\*\/]$/.test(key)) {
            calcAppend(key);
        } else if (key === "Enter" || key === "=") {
            e.preventDefault();
            calcCalculate();
        } else if (key === "Escape" || key === "Clear" || key === "Delete") {
            calcClear();
        } else if (key === "Backspace") {
            calcDisplay.value = calcDisplay.value.slice(0, -1);
        }
    }
});

let isCalcDragging = false;
let calcStartX, calcStartY, calcInitialX, calcInitialY;
calcHeader.addEventListener("mousedown", (e) => {
    isCalcDragging = true;
    calcStartX = e.clientX; calcStartY = e.clientY;
    const rect = calcModal.getBoundingClientRect();
    calcInitialX = rect.left; calcInitialY = rect.top;
    calcModal.style.right = "auto"; 
    calcModal.style.left = calcInitialX + "px";
    calcModal.style.top = calcInitialY + "px";
});
document.addEventListener("mousemove", (e) => {
    if(!isCalcDragging) return;
    calcModal.style.left = (calcInitialX + e.clientX - calcStartX) + "px";
    calcModal.style.top = (calcInitialY + e.clientY - calcStartY) + "px";
});
document.addEventListener("mouseup", () => isCalcDragging = false);

// Math Modal
const mathModal = document.getElementById("math-modal");
const mathInput = document.getElementById("mathInput");
const mathExplanationInput = document.getElementById("mathExplanationInput");
const broadcastMathBtn = document.getElementById("broadcastMathBtn");
const closeMathBtn = document.getElementById("closeMathBtn");
const mathDisplay = document.getElementById("mathDisplay");
const mathCategory = document.getElementById("mathCategory");
const formulaLibrary = document.getElementById("formulaLibrary");

// Presentation & Graph
const presentationBox = document.getElementById("presentation-box");
const presInputForm = document.getElementById("pres-input-form");
const generateGraphBtn = document.getElementById("generateGraphBtn");
const presTitle = document.getElementById("pres-title");
const presentationContainer = document.getElementById("presentation-container");
const laserPointer = document.getElementById("laser-pointer");
const presMode = document.getElementById("presMode");
const companyInputs = document.getElementById("companyInputs");
const productInputs = document.getElementById("productInputs");
const presCurrency = document.getElementById("presCurrency");
const viewGraphBtn = document.getElementById("viewGraphBtn");
const viewExcelBtn = document.getElementById("viewExcelBtn");
const canvasElem = document.getElementById("presentationCanvas");
const excelContainer = document.getElementById("excel-container");
const excelTable = document.getElementById("excelTable");
let businessChart = null;
let currentChartData = null;

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
const ctx = canvas.getContext('2d', { willReadFrequently: true }); 
const wbStatus = document.getElementById('wb-status');

ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);

let canDraw = false; 
let currentBrushColor = "#000000";
let currentBrushSize = 5;
let currentTool = 'pen'; 
let drawing = false;
let startX = 0; let startY = 0;
let canvasSnapshot; 

let stampImage = null;
let stampScale = 1.0;
let isStamping = false;

// Multiple Whiteboards
let wbPages = []; 
let currentWbPage = 0;
const wbPrevPageBtn = document.getElementById("wbPrevPage");
const wbNextPageBtn = document.getElementById("wbNextPage");
const wbAddPageBtn = document.getElementById("wbAddPage");
const wbPageNumText = document.getElementById("wbPageNum");

function saveCurrentPage() {
    wbPages[currentWbPage] = canvas.toDataURL("image/jpeg", 0.5); 
}
function loadPage(index) {
    if (index < 0 || index >= wbPages.length) return;
    saveCurrentPage();
    currentWbPage = index;
    wbPageNumText.textContent = `${currentWbPage + 1} / ${wbPages.length}`;
    
    const imgSrc = wbPages[currentWbPage];
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); 
    if(imgSrc) {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0); };
        img.src = imgSrc;
    }
    if(isHost) socket.emit("wb-page-sync", { room: currentRoom, image: imgSrc, num: currentWbPage + 1, total: wbPages.length });
}

if(wbAddPageBtn) {
    wbAddPageBtn.addEventListener("click", () => {
        saveCurrentPage();
        wbPages.push(''); 
        currentWbPage = wbPages.length - 1;
        wbPageNumText.textContent = `${currentWbPage + 1} / ${wbPages.length}`;
        
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        showNotification("Created new whiteboard page!", "info");
        socket.emit("wb-page-sync", { room: currentRoom, image: '', num: currentWbPage + 1, total: wbPages.length });
    });
}
if(wbPrevPageBtn) { wbPrevPageBtn.addEventListener("click", () => loadPage(currentWbPage - 1)); }
if(wbNextPageBtn) { wbNextPageBtn.addEventListener("click", () => loadPage(currentWbPage + 1)); }

socket.on("wb-page-sync", (data) => {
    wbPageNumText.textContent = `${data.num} / ${data.total}`;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(data.image) {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0); };
        img.src = data.image;
    }
});


pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

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
  const d = document.createElement("div"); d.textContent = text;
  messages.appendChild(d); messages.scrollTop = messages.scrollHeight;
}

function addSizeControls(targetWrapper, elementToFullscreen) {
  const controlsDiv = document.createElement("div");
  controlsDiv.className = "local-controls";
  // Enlarge/Shrink hidden for map box explicitly to prevent duplicate fullscreen buttons
  if(targetWrapper !== mapBox) {
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
      controlsDiv.appendChild(enlargeBtn); controlsDiv.appendChild(shrinkBtn);
  }
  
  // Custom Map Fullscreen handled separately below
  if(targetWrapper !== mapBox) {
      const maxBtn = document.createElement("button");
      maxBtn.className = "icon-btn"; maxBtn.innerHTML = "🖥️";
      maxBtn.onclick = () => {
        if (!document.fullscreenElement) { elementToFullscreen.requestFullscreen().catch(e => e); } 
        else { document.exitFullscreen(); }
      };
      controlsDiv.appendChild(maxBtn);
  }
  
  targetWrapper.appendChild(controlsDiv);
}

addSizeControls(whiteboardBox, whiteboardBox);
addSizeControls(mapBox, mapBox); 
addSizeControls(presentationBox, presentationBox); 

// Map specific Fullscreen button
document.getElementById("mapFullscreenBtn")?.addEventListener("click", () => {
    const mapCont = document.getElementById("map-container");
    if (!document.fullscreenElement) { mapCont.requestFullscreen().catch(e => e); } 
    else { document.exitFullscreen(); }
});

function hideAllBigPanels() {
    whiteboardBox.style.display = "none";
    mapBox.style.display = "none";
    presentationBox.style.display = "none";
    toggleWbBtn.dataset.show = "false"; toggleWbBtn.style.background = "linear-gradient(135deg, #3498db, #2980b9)";
    toggleMapBtn.dataset.show = "false"; toggleMapBtn.style.background = "linear-gradient(135deg, #27ae60, #2ecc71)";
    togglePresBtn.dataset.show = "false"; togglePresBtn.style.background = "linear-gradient(135deg, #f1c40f, #f39c12)";
}

togglePresBtn.addEventListener("click", () => {
  const isShowing = togglePresBtn.dataset.show === "true";
  socket.emit("pres-toggle", { room: currentRoom, show: !isShowing });
});

toggleWbBtn.addEventListener("click", () => {
  const isShowing = toggleWbBtn.dataset.show === "true";
  socket.emit("wb-toggle", { room: currentRoom, show: !isShowing });
});

toggleMapBtn.addEventListener("click", () => {
  const isShowing = toggleMapBtn.dataset.show === "true";
  socket.emit("map-toggle", { room: currentRoom, show: !isShowing });
});

socket.on("pres-toggle", (data) => {
  if(data.show) { hideAllBigPanels(); presentationBox.style.display = "block"; if(isHost){togglePresBtn.dataset.show="true"; togglePresBtn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } 
  else { presentationBox.style.display = "none"; if(isHost){togglePresBtn.dataset.show="false"; togglePresBtn.style.background="linear-gradient(135deg, #f1c40f, #f39c12)";} }
});

socket.on("wb-toggle", (data) => {
  if (data.show) { hideAllBigPanels(); whiteboardBox.style.display = "block"; if(isHost){toggleWbBtn.dataset.show="true"; toggleWbBtn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } 
  else { whiteboardBox.style.display = "none"; if(isHost){toggleWbBtn.dataset.show="false"; toggleWbBtn.style.background="linear-gradient(135deg, #3498db, #2980b9)";} }
});

socket.on("map-toggle", (data) => {
  if (data.show) { hideAllBigPanels(); mapBox.style.display = "block"; setTimeout(() => { if(geoMap) geoMap.invalidateSize(); }, 100); if(isHost){toggleMapBtn.dataset.show="true"; toggleMapBtn.style.background="linear-gradient(135deg, #e74c3c, #c0392b)";} } 
  else { mapBox.style.display = "none"; if(isHost){toggleMapBtn.dataset.show="false"; toggleMapBtn.style.background="linear-gradient(135deg, #27ae60, #2ecc71)";} }
});

// ---------- MATH FORMULA LIBRARY LOGIC ----------
const formulas = {
    algebra: [ {name: "Quadratic", eq: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", desc: "Roots of a quadratic eq."}, {name: "Logarithm", eq: "\\log_b(xy) = \\log_b(x) + \\log_b(y)", desc: "Log product rule."}, {name: "Binomial", eq: "(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^k", desc: "Binomial theorem expansion."} ],
    calculus: [ {name: "Derivative", eq: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}", desc: "First principle of derivatives."}, {name: "Integral", eq: "\\int x^n dx = \\frac{x^{n+1}}{n+1} + C", desc: "Power rule for integration."}, {name: "Limits (e)", eq: "\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x = e", desc: "Euler's number limit."} ],
    trigonometry: [ {name: "Pythagorean ID", eq: "\\sin^2\\theta + \\cos^2\\theta = 1", desc: "Fundamental trig identity."}, {name: "Sine Rule", eq: "\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}", desc: "Triangle sine rule."} ],
    physics: [ {name: "Force", eq: "F = ma", desc: "Newton's 2nd Law. F=Force, m=Mass, a=Acceleration."}, {name: "Mass-Energy", eq: "E = mc^2", desc: "Einstein's Equation."}, {name: "Gravity", eq: "F = G \\frac{m_1 m_2}{r^2}", desc: "Newton's Law of Gravitation."} ],
    financial: [ {name: "Compound Int.", eq: "A = P\\left(1 + \\frac{r}{n}\\right)^{nt}", desc: "A=Final, P=Principal, r=Rate, n=Freq, t=Time."}, {name: "ROI", eq: "ROI = \\frac{\\text{Net Profit}}{\\text{Cost}} \\times 100", desc: "Return on Investment."} ],
    statistics: [ {name: "Mean", eq: "\\mu = \\frac{\\sum x_i}{N}", desc: "Population Mean."}, {name: "Std Deviation", eq: "\\sigma = \\sqrt{\\frac{\\sum (x_i - \\mu)^2}{N}}", desc: "Standard Deviation."} ]
};

let currentFormulaDesc = "";
function loadFormulas(category) {
    formulaLibrary.innerHTML = "";
    formulas[category].forEach(f => {
        const btn = document.createElement("button"); btn.textContent = f.name;
        btn.style.cssText = "background: rgba(255,255,255,0.1); color: white; border: 1px solid var(--accent); padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;";
        btn.onclick = () => { mathInput.value = f.eq; currentFormulaDesc = f.desc; mathExplanationInput.textContent = "ℹ️ " + f.desc; };
        formulaLibrary.appendChild(btn);
    });
}
mathCategory.addEventListener("change", (e) => loadFormulas(e.target.value));
loadFormulas("algebra"); 

mathInput.addEventListener("input", () => { currentFormulaDesc = "Custom User Equation"; mathExplanationInput.textContent = ""; });
openMathBtn.addEventListener("click", () => mathModal.style.display = "block");
closeMathBtn.addEventListener("click", () => mathModal.style.display = "none");
broadcastMathBtn.addEventListener("click", () => {
    const eq = mathInput.value.trim(); if(!eq) return;
    try { katex.renderToString(eq); socket.emit("math-equation", { room: currentRoom, equation: eq, desc: currentFormulaDesc, sender: usernameInput.value || "User" }); mathInput.value = ""; mathExplanationInput.textContent = ""; } 
    catch(e) { showNotification("Invalid LaTeX Formula!", "danger"); }
});

socket.on("math-equation", (data) => {
    mathModal.style.display = "block";
    try {
        const html = katex.renderToString(data.equation, { throwOnError: false, displayMode: true });
        mathDisplay.innerHTML = `<div style="font-size:13px; color:var(--primary); margin-bottom:10px;">Shared by: ${data.sender}</div>${html}<div style="font-size:14px; color:#555; margin-top:15px; border-top:1px dashed #ccc; padding-top:10px;"><b>ℹ️ Explanation:</b> ${data.desc}</div>`;
        showNotification("New Math Formula Shared!", "info");
    } catch(e) {}
});

// ---------- PRESENTATION LOGIC ----------
presMode.addEventListener("change", (e) => {
    if(e.target.value === "company") { companyInputs.style.display = "flex"; productInputs.style.display = "none"; } 
    else { companyInputs.style.display = "none"; productInputs.style.display = "flex"; }
});

generateGraphBtn.addEventListener("click", () => {
    const industry = document.getElementById("presIndustry").value || (presMode.value==='company'?"Business":"Product");
    const currency = presCurrency.value;
    const mode = presMode.value;
    const growth = parseFloat(document.getElementById("presGrowth").value) || 10;
    
    let baseYear = parseInt(document.getElementById("presBaseYear").value) || new Date().getFullYear();
    let endYear = parseInt(document.getElementById("presEndYear").value) || baseYear + 5;
    if(baseYear < 2001) baseYear = 2001; if(baseYear > 2500) baseYear = 2500;
    if(endYear < 2001) endYear = 2001; if(endYear > 2500) endYear = 2500;
    if(endYear < baseYear) endYear = baseYear + 5;

    let labels = []; let revenues = []; let unitsArr = [];
    let currentRevenue = 0; let currentUnits = 0; let unitPrice = 0;

    if(mode === "company") {
        currentRevenue = parseFloat(document.getElementById("presBaseValue").value) || 1000;
        for(let y = baseYear; y <= endYear; y++) {
            labels.push(y.toString()); revenues.push(Math.round(currentRevenue)); currentRevenue += (currentRevenue * (growth / 100));
        }
    } else {
        unitPrice = parseFloat(document.getElementById("presUnitPrice").value) || 50;
        currentUnits = parseFloat(document.getElementById("presUnitsSold").value) || 100;
        for(let y = baseYear; y <= endYear; y++) {
            labels.push(y.toString());
            let rev = unitPrice * currentUnits; revenues.push(Math.round(rev)); unitsArr.push(Math.round(currentUnits));
            currentUnits += (currentUnits * (growth / 100)); 
        }
    }

    const chartConfig = {
        type: 'line',
        data: { labels: labels, datasets: [{ label: `${industry} Projected Growth (${currency})`, data: revenues, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.2)', borderWidth: 3, fill: true, tension: 0.4, pointBackgroundColor: '#e74c3c', pointRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 16 } } } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 14 } } }, x: { ticks: { font: { size: 14 } } } } }
    };
    
    let tableHTML = `<tr><th>Year</th>`;
    if(mode === "product") tableHTML += `<th>Units Sold</th><th>Unit Price</th>`;
    tableHTML += `<th>Revenue (${currency})</th></tr>`;
    for(let i=0; i<labels.length; i++) {
        tableHTML += `<tr><td>${labels[i]}</td>`;
        if(mode === "product") tableHTML += `<td>${unitsArr[i].toLocaleString()}</td><td>${currency}${unitPrice.toLocaleString()}</td>`;
        tableHTML += `<td><strong style="color:var(--primary)">${currency}${revenues[i].toLocaleString()}</strong></td></tr>`;
    }

    socket.emit("presentation-data", { room: currentRoom, chartConfig, industry, tableHTML, view: 'chart' });
});

viewGraphBtn.addEventListener("click", () => { socket.emit("pres-view-switch", {room: currentRoom, view: 'chart'}); });
viewExcelBtn.addEventListener("click", () => { socket.emit("pres-view-switch", {room: currentRoom, view: 'excel'}); });

socket.on("pres-view-switch", (data) => {
    if(data.view === 'chart') { excelContainer.style.display = "none"; canvasElem.style.display = "block"; } 
    else { canvasElem.style.display = "none"; excelContainer.style.display = "block"; }
});

socket.on("presentation-data", (data) => {
    currentChartData = data; presTitle.textContent = `${data.industry} Growth Projection`; excelTable.innerHTML = data.tableHTML;
    if(isHost) viewGraphBtn.parentElement.style.display = "flex";
    const ctxChart = canvasElem.getContext('2d');
    if(businessChart) businessChart.destroy();
    businessChart = new Chart(ctxChart, data.chartConfig);
    if(data.view === 'chart') { excelContainer.style.display = "none"; canvasElem.style.display = "block"; } else { canvasElem.style.display = "none"; excelContainer.style.display = "block"; }
});

let laserTimeout;
presentationContainer.addEventListener("mousemove", (e) => {
    if(!isHost || presentationBox.style.display === "none") return;
    const rect = presentationContainer.getBoundingClientRect();
    socket.emit("laser-pointer", { room: currentRoom, x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
});
presentationContainer.addEventListener("mouseleave", () => { if(isHost) socket.emit("laser-pointer", { room: currentRoom, hide: true }); });
socket.on("laser-pointer", (data) => {
    if(data.hide) { laserPointer.style.display = "none"; return; }
    laserPointer.style.display = "block"; laserPointer.style.left = (data.x * 100) + "%"; laserPointer.style.top = (data.y * 100) + "%";
    clearTimeout(laserTimeout); laserTimeout = setTimeout(() => { laserPointer.style.display = "none"; }, 2000);
});

// ---------- ADVANCED PRO WHITEBOARD ----------

const toggleShapesBtn = document.getElementById("toggleShapesBtn");
const wbShapesMenu = document.getElementById("wb-shapes-menu");
const toggleSubjectsBtn = document.getElementById("toggleSubjectsBtn");
const wbSubjectsMenu = document.getElementById("wb-subjects-menu");

toggleShapesBtn.addEventListener("click", () => {
    wbShapesMenu.style.display = wbShapesMenu.style.display === "none" ? "block" : "none";
    wbSubjectsMenu.style.display = "none"; 
});

toggleSubjectsBtn.addEventListener("click", () => {
    wbSubjectsMenu.style.display = wbSubjectsMenu.style.display === "none" ? "block" : "none";
    wbShapesMenu.style.display = "none";
});

const subjectAssets = {
    geography: [
        {name: "World Map", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/World_map_-_low_resolution.svg/1024px-World_map_-_low_resolution.svg.png"},
        {name: "India Political", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/India_political_map_en.svg/800px-India_political_map_en.svg.png"},
        {name: "India Physical", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/India_relief_map.svg/800px-India_relief_map.svg.png"}
    ],
    biology: [
        {name: "Human Skeleton", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Human_skeleton_front_en.svg/600px-Human_skeleton_front_en.svg.png"},
        {name: "Respiratory System", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Respiratory_system_complete_en.svg/600px-Respiratory_system_complete_en.svg.png"},
        {name: "Human Heart", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/800px-Diagram_of_the_human_heart_%28cropped%29.svg.png"},
        {name: "Plant Cell", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Plant_cell_structure_svg.svg/800px-Plant_cell_structure_svg.svg.png"}
    ],
    chemistry: [ {name: "Periodic Table", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Periodic_table_large.svg/1024px-Periodic_table_large.svg.png"} ],
    physics: [ {name: "Electric Circuit", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Simple_circuit.svg/600px-Simple_circuit.svg.png"} ],
    maths: [ {name: "Graph Paper", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Graph_paper_mm_A4.svg/800px-Graph_paper_mm_A4.svg.png"} ],
    commerce: [ {name: "Supply & Demand", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Supply-and-demand.svg/800px-Supply-and-demand.svg.png"} ]
};

const subjectCategory = document.getElementById("subjectCategory");
const subjectAssetsList = document.getElementById("subjectAssetsList");

// ==========================================
// 🚀 NAYA: FOOLPROOF MULTI-PROXY ASSET FETCHER (No Server Restart Needed)
// ==========================================
function prepareStamp(src) {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Crucial for canvas
    
    img.onload = () => {
        stampImage = img;
        stampScale = Math.min((canvas.width * 0.6) / img.width, (canvas.height * 0.6) / img.height);
        
        isStamping = true;
        currentTool = 'stamp';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool'));
        
        showNotification("🖱️ Ready! Click on board to paste.", "info");
        canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); 
    };
    img.onerror = () => showNotification("Image error. CORS block hit.", "danger");
    img.src = src; 
}

async function loadAssetToCanvas(url, name) {
    showNotification(`Downloading ${name}...`, "info");
    
    // Auto-fallback dual proxy system!
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(url)}`
    ];

    for (let proxy of proxies) {
        try {
            // Using image directly without base64 to avoid string size issues
            prepareStamp(proxy);
            wbSubjectsMenu.style.display = "none";
            return; 
        } catch(e) {
            console.warn("Proxy failed, trying next...");
        }
    }
    showNotification(`Failed to load ${name}. All proxies blocked.`, "danger");
}
// ==========================================

function loadSubjectAssets(cat) {
    subjectAssetsList.innerHTML = "";
    subjectAssets[cat].forEach(asset => {
        const btn = document.createElement("button");
        btn.textContent = "➕ Insert " + asset.name;
        btn.style.cssText = "background: rgba(255,255,255,0.1); color: white; border: 1px solid var(--accent); padding: 8px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px;";
        btn.onclick = () => {
            loadAssetToCanvas(asset.url, asset.name);
            wbSubjectsMenu.style.display = "none";
        };
        subjectAssetsList.appendChild(btn);
    });
}
subjectCategory.addEventListener("change", (e) => loadSubjectAssets(e.target.value));
loadSubjectAssets("geography");

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active-tool'));
        btn.classList.add('active-tool');
        currentTool = btn.id.replace('tool-', ''); 
        wbShapesMenu.style.display = "none"; 
        
        if(isStamping) {
            isStamping = false;
            if(canvasSnapshot) ctx.putImageData(canvasSnapshot, 0, 0); 
        }
    });
});

document.getElementById('wb-color').addEventListener("input", (e) => { currentBrushColor = e.target.value; });
document.getElementById('wb-size').addEventListener("input", (e) => { currentBrushSize = e.target.value; });
document.getElementById('wb-clear').addEventListener("click", () => {
  if (!canDraw) return; 
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); 
  socket.emit("clear-whiteboard", { room: currentRoom });
  wbPages[currentWbPage] = canvas.toDataURL("image/jpeg", 0.5);
});
socket.on("clear-whiteboard", () => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
});

function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

canvas.addEventListener('wheel', (e) => {
    if (isStamping && stampImage) {
        e.preventDefault(); 
        if (e.deltaY < 0) stampScale *= 1.1; 
        else stampScale *= 0.9; 
        
        const pt = getCanvasPoint(e);
        ctx.putImageData(canvasSnapshot, 0, 0);
        let w = stampImage.width * stampScale;
        let h = stampImage.height * stampScale;
        ctx.globalAlpha = 0.6;
        ctx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h);
        ctx.globalAlpha = 1.0;
    }
}, {passive: false});

function floodFill(startX, startY, fillColorHex, emit=false) {
    const hex = fillColorHex.replace('#','');
    const fillR = parseInt(hex.substring(0,2), 16); const fillG = parseInt(hex.substring(2,4), 16); const fillB = parseInt(hex.substring(4,6), 16); const fillA = 255;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data; const width = canvas.width; const height = canvas.height;
    const sx = Math.floor(startX); const sy = Math.floor(startY);
    if(sx < 0 || sx >= width || sy < 0 || sy >= height) return;
    const startPos = (sy * width + sx) * 4;
    const startR = data[startPos]; const startG = data[startPos + 1]; const startB = data[startPos + 2]; const startA = data[startPos + 3];
    if (startR === fillR && startG === fillG && startB === fillB && startA === fillA) return; 

    const matchColor = (pos) => { return data[pos] === startR && data[pos+1] === startG && data[pos+2] === startB && data[pos+3] === startA; };
    const colorPixel = (pos) => { data[pos] = fillR; data[pos+1] = fillG; data[pos+2] = fillB; data[pos+3] = fillA; };
    const pixelStack = [[sx, sy]];

    while (pixelStack.length) {
        const newPos = pixelStack.pop();
        const x = newPos[0]; let y = newPos[1];
        let pixelPos = (y * width + x) * 4;
        while (y-- >= 0 && matchColor(pixelPos)) { pixelPos -= width * 4; }
        pixelPos += width * 4; ++y;
        let reachLeft = false; let reachRight = false;
        while (y++ < height - 1 && matchColor(pixelPos)) {
            colorPixel(pixelPos);
            if (x > 0) { if (matchColor(pixelPos - 4)) { if (!reachLeft) { pixelStack.push([x - 1, y]); reachLeft = true; } } else if (reachLeft) { reachLeft = false; } }
            if (x < width - 1) { if (matchColor(pixelPos + 4)) { if (!reachRight) { pixelStack.push([x + 1, y]); reachRight = true; } } else if (reachRight) { reachRight = false; } }
            pixelPos += width * 4;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    if(emit) socket.emit("wb-fill", {room: currentRoom, x: sx, y: sy, color: fillColorHex});
}

socket.on("wb-fill", (data) => floodFill(data.x, data.y, data.color, false));

function drawFreehand(x0, y0, x1, y1, color, size, toolType, emit = false) {
  if(toolType === 'eraser') {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = size * 3; ctx.lineCap = 'round'; 
      ctx.shadowBlur = 0; ctx.stroke(); ctx.closePath();
  } 
  else if (toolType === 'spray') {
      ctx.fillStyle = color;
      for (let i = 0; i < size * 2; i++) {
          const offsetX = x1 + (Math.random() * size - size/2); const offsetY = y1 + (Math.random() * size - size/2);
          ctx.fillRect(offsetX, offsetY, 2, 2);
      }
  }
  else {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if(toolType === 'brush') { ctx.shadowBlur = size * 1.5; ctx.shadowColor = color; } 
      else { ctx.shadowBlur = 0; }
      ctx.stroke(); ctx.closePath();
  }
  if (emit) socket.emit('drawing', { type: 'free', x0, y0, x1, y1, color, size, toolType: toolType, room: currentRoom });
}

function drawShapeObj(x0, y0, x1, y1, type, color, size, emit = false) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowBlur = 0;
  let w = x1 - x0; let h = y1 - y0;

  if(type === 'line') { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
  else if(type === 'arrow') {
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      let angle = Math.atan2(y1-y0, x1-x0);
      ctx.lineTo(x1 - size*3 * Math.cos(angle - Math.PI/6), y1 - size*3 * Math.sin(angle - Math.PI/6));
      ctx.moveTo(x1, y1); ctx.lineTo(x1 - size*3 * Math.cos(angle + Math.PI/6), y1 - size*3 * Math.sin(angle + Math.PI/6));
  }
  else if(type === 'rect') { ctx.rect(x0, y0, w, h); }
  else if(type === 'circle') { let r = Math.sqrt(Math.pow(w, 2) + Math.pow(h, 2)); ctx.arc(x0, y0, r, 0, 2*Math.PI); }
  else if(type === 'triangle') { ctx.moveTo(x0 + w/2, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath(); }
  else if(type === 'pentagon' || type === 'hexagon' || type === 'star') {
      let r = Math.sqrt(w*w + h*h); let sides = type === 'pentagon' ? 5 : (type === 'hexagon' ? 6 : 5); let step = (Math.PI * 2) / sides;
      for(let i=0; i<=sides; i++) {
          let cx = x0 + r * Math.cos(i * step - Math.PI/2); let cy = y0 + r * Math.sin(i * step - Math.PI/2);
          if(type === 'star' && i<sides) {
              let ix = x0 + (r/2.5) * Math.cos((i+0.5) * step - Math.PI/2); let iy = y0 + (r/2.5) * Math.sin((i+0.5) * step - Math.PI/2);
              if(i===0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy); ctx.lineTo(ix, iy);
          } else { if(i===0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy); }
      }
      ctx.closePath();
  }
  else if(type === 'cube') {
      let d = Math.min(Math.abs(w), Math.abs(h)) * 0.4; 
      ctx.rect(x0, y0+d, w-d, h-d); ctx.moveTo(x0+d, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1-d); ctx.lineTo(x0+d, y1-d); ctx.closePath();
      ctx.moveTo(x0, y0+d); ctx.lineTo(x0+d, y0); ctx.moveTo(x1-d, y0+d); ctx.lineTo(x1, y0); ctx.moveTo(x1-d, y1); ctx.lineTo(x1, y1-d); ctx.moveTo(x0, y1); ctx.lineTo(x0+d, y1-d);
  }
  else if(type === 'cylinder') {
      let rX = Math.abs(w/2), rY = Math.abs(h * 0.15); 
      ctx.ellipse(x0 + w/2, y0 + rY, rX, rY, 0, 0, 2 * Math.PI); ctx.moveTo(x0, y1 - rY); ctx.ellipse(x0 + w/2, y1 - rY, rX, rY, 0, 0, Math.PI);
      ctx.moveTo(x0, y0 + rY); ctx.lineTo(x0, y1 - rY); ctx.moveTo(x1, y0 + rY); ctx.lineTo(x1, y1 - rY);
  }
  else if(type === 'cone') {
      let rX = Math.abs(w/2), rY = Math.abs(h * 0.15);
      ctx.ellipse(x0 + w/2, y1 - rY, rX, rY, 0, 0, 2 * Math.PI); ctx.moveTo(x0 + w/2, y0); ctx.lineTo(x0, y1 - rY); ctx.moveTo(x0 + w/2, y0); ctx.lineTo(x1, y1 - rY);
  }
  else if(type === 'sphere') {
      let r = Math.sqrt(w*w + h*h); ctx.arc(x0, y0, r, 0, 2*Math.PI); ctx.moveTo(x0-r, y0); ctx.ellipse(x0, y0, r, r*0.3, 0, 0, 2*Math.PI); 
  }
  
  ctx.stroke(); 
  if (emit) socket.emit('drawing', { type: type, x0, y0, x1, y1, color, size, room: currentRoom });
}

const wbLaser = document.getElementById("wb-laser");
let wbLaserTimeout;

canvas.addEventListener('mousedown', (e) => { 
  if (!canDraw) return; 
  const pt = getCanvasPoint(e);

  if (isStamping && stampImage) {
      ctx.putImageData(canvasSnapshot, 0, 0); 
      let w = stampImage.width * stampScale;
      let h = stampImage.height * stampScale;
      ctx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h);
      
      let tempCanvas = document.createElement("canvas");
      let syncScale = Math.min(1, 800 / Math.max(w, h)); 
      tempCanvas.width = w * syncScale; 
      tempCanvas.height = h * syncScale;
      let tCtx = tempCanvas.getContext("2d");
      tCtx.fillStyle = "#ffffff"; tCtx.fillRect(0,0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(stampImage, 0, 0, tempCanvas.width, tempCanvas.height);
      
      let sendSrc = tempCanvas.toDataURL("image/jpeg", 0.5); 
      socket.emit("wb-stamp", { room: currentRoom, image: sendSrc, x: pt.x - w/2, y: pt.y - h/2, w: w, h: h });

      wbPages[currentWbPage] = canvas.toDataURL("image/jpeg", 0.5);
      
      isStamping = false;
      currentTool = 'pen';
      document.getElementById('tool-pen').classList.add('active-tool');
      canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      showNotification("Stamped successfully!", "join");
      return;
  }

  if(currentTool === 'pointer') return; 
  if(currentTool === 'fill') { floodFill(pt.x, pt.y, currentBrushColor, true); return; }
  drawing = true; startX = pt.x; startY = pt.y; 
  canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
});

canvas.addEventListener('mousemove', (e) => {
  if (!canDraw) return;
  const pt = getCanvasPoint(e);

  if (isStamping && stampImage) {
      ctx.putImageData(canvasSnapshot, 0, 0);
      let w = stampImage.width * stampScale;
      let h = stampImage.height * stampScale;
      ctx.globalAlpha = 0.6; 
      ctx.drawImage(stampImage, pt.x - w/2, pt.y - h/2, w, h);
      ctx.globalAlpha = 1.0;
      return;
  }

  if(currentTool === 'pointer') {
      socket.emit("wb-pointer", { room: currentRoom, x: pt.x / canvas.width, y: pt.y / canvas.height }); return;
  }
  if (!drawing || currentTool === 'fill') return;

  if(['pen', 'brush', 'spray', 'eraser'].includes(currentTool)) {
      drawFreehand(startX, startY, pt.x, pt.y, currentBrushColor, currentBrushSize, currentTool, true);
      startX = pt.x; startY = pt.y;
  } else {
      ctx.putImageData(canvasSnapshot, 0, 0);
      drawShapeObj(startX, startY, pt.x, pt.y, currentTool, currentBrushColor, currentBrushSize, false);
  }
});

canvas.addEventListener('mouseup', (e) => { 
  if (!drawing || !canDraw || currentTool === 'pointer' || currentTool === 'fill') return; 
  drawing = false; 
  const pt = getCanvasPoint(e);
  if(!['pen', 'brush', 'spray', 'eraser'].includes(currentTool)) { drawShapeObj(startX, startY, pt.x, pt.y, currentTool, currentBrushColor, currentBrushSize, true); }
  ctx.shadowBlur = 0; 
  wbPages[currentWbPage] = canvas.toDataURL("image/jpeg", 0.5);
});

canvas.addEventListener('mouseout', () => { drawing = false; if(currentTool === 'pointer' && canDraw) socket.emit("wb-pointer", { room: currentRoom, hide: true }); });

socket.on('drawing', (data) => {
  if(data.type === 'free') drawFreehand(data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.toolType, false);
  else drawShapeObj(data.x0, data.y0, data.x1, data.y1, data.type, data.color, data.size, false);
  
  if(isHost) wbPages[currentWbPage] = canvas.toDataURL("image/jpeg", 0.5);
});

socket.on("wb-stamp", (data) => {
    const img = new Image();
    img.onload = () => { 
        ctx.drawImage(img, data.x, data.y, data.w, data.h); 
        if(isHost) wbPages[currentWbPage] = canvas.toDataURL("image/jpeg", 0.5);
    };
    img.src = data.image;
});

socket.on("wb-pointer", (data) => {
    if(data.hide) { wbLaser.style.display = "none"; return; }
    wbLaser.style.display = "block"; wbLaser.style.left = (data.x * 100) + "%"; wbLaser.style.top = (data.y * 100) + "%";
    clearTimeout(wbLaserTimeout); wbLaserTimeout = setTimeout(() => { wbLaser.style.display = "none"; }, 2000);
});

// PDF Rendering
document.getElementById('tool-pdf').addEventListener("click", () => document.getElementById('wbPdfUpload').click());
document.getElementById('wbPdfUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if(!file) return; showNotification("Loading File...", "info");
  
  if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => { prepareStamp(event.target.result); };
      reader.readAsDataURL(file);
  } else if (file.type === 'application/pdf') {
      const fileReader = new FileReader();
      fileReader.onload = async function() {
          const typedarray = new Uint8Array(this.result); const pdf = await pdfjsLib.getDocument(typedarray).promise; const page = await pdf.getPage(1); 
          const viewport = page.getViewport({scale: 2.0}); 
          const tc = document.createElement('canvas'); const tCtx = tc.getContext('2d'); tc.height = viewport.height; tc.width = viewport.width;
          await page.render({canvasContext: tCtx, viewport: viewport}).promise; 
          prepareStamp(tc.toDataURL("image/jpeg", 0.8));
      };
      fileReader.readAsArrayBuffer(file);
  }
});

// ==========================================
// 🚀 NAYA: Map Layout Fixing (Search & Maximize)
// ==========================================
function initWorldMap() {
  geoMap = L.map('map-container', { center: [20.0, 0.0], zoom: 3, zoomControl: false });
  L.control.zoom({ position: 'bottomleft' }).addTo(geoMap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', crossOrigin: true }).addTo(geoMap);
  labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'markerPane', crossOrigin: true }).addTo(geoMap);
  
  // Create search geocoder
  const geocoder = L.Control.geocoder({ defaultMarkGeocode: true }).addTo(geoMap);
  
  // Move geocoder to exactly below the screenshot button
  const gcContainer = geocoder.getContainer();
  // Ensure it does not have leaflet absolute positioning messing it up
  gcContainer.style.position = "static"; 
  document.getElementById('map-controls-container').appendChild(gcContainer);
}
initWorldMap();
document.getElementById("toggleLabelsBtn")?.addEventListener("click", function() {
  labelsVisible = !labelsVisible;
  if (labelsVisible) { geoMap.addLayer(labelsLayer); this.style.background = "var(--primary)"; } 
  else { geoMap.removeLayer(labelsLayer); this.style.background = "var(--danger)"; }
});


// ---------- VIDEO UI HELPERS ----------
function createLocalCard(name) {
  let el = document.getElementById("local-player"); if (el) return el;
  const localContainer = document.createElement("div"); localContainer.className = "video-card"; localContainer.id = "local-player";
  localContainer.style.width = "100%"; localContainer.style.height = "200px"; localContainer.style.position = "relative";
  const label = document.createElement("div"); label.style.position = "absolute"; label.style.top = "6px"; label.style.left = "6px"; label.style.padding = "4px 8px"; label.style.background = "rgba(0,0,0,0.5)"; label.style.color = "#fff"; label.style.borderRadius = "6px"; label.style.fontSize = "13px"; label.style.zIndex = "10"; label.textContent = `${name} (You)`;
  localContainer.appendChild(label); addSizeControls(localContainer, localContainer); videoArea.prepend(localContainer); return localContainer;
}

function createRemoteWrapper(uid, labelText) {
  let wrapper = document.getElementById(`remote-wrapper-${uid}`); if (wrapper) return wrapper;
  wrapper = document.createElement("div"); wrapper.id = `remote-wrapper-${uid}`; wrapper.style.display = "flex"; wrapper.style.flexDirection = "column"; wrapper.style.alignItems = "center"; wrapper.style.gap = "6px"; wrapper.style.width = "100%"; 
  const card = document.createElement("div"); card.className = "video-card"; card.id = `remote-${uid}`; card.style.width = "100%"; card.style.height = "200px"; card.style.position = "relative";
  const labelDiv = document.createElement("div"); labelDiv.style.position = "absolute"; labelDiv.style.top = "6px"; labelDiv.style.left = "6px"; labelDiv.style.padding = "4px 8px"; labelDiv.style.background = "rgba(0,0,0,0.5)"; labelDiv.style.color = "#fff"; labelDiv.style.borderRadius = "6px"; labelDiv.style.fontSize = "13px"; labelDiv.style.zIndex = "10"; labelDiv.textContent = labelText || `User ${uid}`; card.appendChild(labelDiv);
  const controlsDiv = document.createElement("div"); controlsDiv.style.display = "flex"; controlsDiv.style.gap = "5px"; controlsDiv.style.justifyContent = "center"; controlsDiv.style.width = "100%";
  const muteRemoteBtn = document.createElement("button"); muteRemoteBtn.className = "small-btn host-only-btn"; muteRemoteBtn.style.display = isHost ? "inline-block" : "none"; muteRemoteBtn.textContent = "🎙️❌"; muteRemoteBtn.title = "Mute User"; muteRemoteBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "mute-audio" });
  const camOffBtn = document.createElement("button"); camOffBtn.className = "small-btn host-only-btn"; camOffBtn.style.display = isHost ? "inline-block" : "none"; camOffBtn.textContent = "📹❌"; camOffBtn.title = "Disable Camera"; camOffBtn.onclick = () => socket.emit("control", { room: currentRoom, targetUid: uid.toString(), action: "disable-video" });
  const wbBtn = document.createElement("button"); wbBtn.className = "small-btn host-only-btn"; wbBtn.style.display = isHost ? "inline-block" : "none"; wbBtn.textContent = "🖍️ WB"; wbBtn.dataset.access = "false"; wbBtn.style.background = "var(--primary)";
  wbBtn.onclick = () => { const isGranting = wbBtn.dataset.access === "false"; socket.emit("wb-control", { room: currentRoom, targetUid: uid.toString(), action: isGranting ? "grant" : "revoke" }); wbBtn.dataset.access = isGranting ? "true" : "false"; wbBtn.textContent = isGranting ? "🚫🖍️ WB" : "🖍️ WB"; wbBtn.style.background = isGranting ? "var(--danger)" : "var(--primary)"; };
  controlsDiv.appendChild(muteRemoteBtn); controlsDiv.appendChild(camOffBtn); controlsDiv.appendChild(wbBtn); 
  wrapper.appendChild(card); wrapper.appendChild(controlsDiv); addSizeControls(wrapper, card); videoArea.appendChild(wrapper); return wrapper;
}

// ---------- JOIN LOGIC ----------
joinBtn.addEventListener("click", async () => {
  if (joined) return;
  try { remoteMusicPlayer.volume = 0; let playPromise = remoteMusicPlayer.play(); if (playPromise !== undefined) { playPromise.then(() => { remoteMusicPlayer.pause(); remoteMusicPlayer.volume = 1; }).catch(e => e); } } catch(e) {}
  const userName = usernameInput.value.trim(); const roomId = roomInput.value.trim(); if (!userName || !roomId) { alert("Enter both Name and Room ID"); return; }

  try {
    const uid = await client.join(APP_ID, roomId, null, userName); localUid = uid.toString();
    try { const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(); localTracks.audioTrack = microphoneTrack; localTracks.videoTrack = cameraTrack; await client.publish([microphoneTrack, cameraTrack]); } catch (mediaErr) { showNotification("Camera/Mic busy. Joined as viewer.", "info"); }
    joined = true; currentRoom = roomId; joinSection.classList.add("form-out");
    setTimeout(() => {
      joinSection.style.display = "none"; workspace.classList.remove("hidden"); workspace.classList.add("workspace-active"); 
      setTimeout(() => { if(geoMap) geoMap.invalidateSize(); const localContainer = createLocalCard(userName); if (localTracks.videoTrack) localTracks.videoTrack.play(localContainer, { fit: "cover" }); }, 300);
    }, 500); 
    socket.emit("join-room", { room: roomId, uid: localUid, name: userName });
    showNotification(`You joined room ${roomId}`, "join"); appendMessage(`System: You joined room ${roomId}`);
  } catch (err) { showNotification("Join failed!", "danger"); }
});

// ---------- SOCKET RECEIVERS ----------
socket.on("room-history", (data) => {
  if (data.chats) data.chats.forEach(chat => { if(chat.name === "System" && chat.text.includes("left")) return; appendMessage(`${chat.name}: ${chat.text}`); });
  if (data.files) [...data.files].reverse().forEach(file => addFileLink(file.filename, file.url));
  
  if (data.wbVisible) { hideAllBigPanels(); whiteboardBox.style.display = "block"; if(isHost) toggleWbBtn.dataset.show = "true"; }
  if (data.mapVisible) { hideAllBigPanels(); mapBox.style.display = "block"; setTimeout(() => geoMap.invalidateSize(), 100); if(isHost) toggleMapBtn.dataset.show = "true"; }
  if (data.presVisible) { hideAllBigPanels(); presentationBox.style.display = "block"; if(isHost) togglePresBtn.dataset.show = "true"; }
  
  if (data.chartData) { 
      currentChartData = data.chartData; presTitle.textContent = `${data.chartData.industry} Growth Projection`; excelTable.innerHTML = data.chartData.tableHTML;
      const ctxChart = document.getElementById('presentationCanvas').getContext('2d'); 
      if(businessChart) businessChart.destroy(); businessChart = new Chart(ctxChart, data.chartData.chartConfig); 
      if(data.chartData.view === 'chart') { excelContainer.style.display = "none"; canvasElem.style.display = "block"; } else { canvasElem.style.display = "none"; excelContainer.style.display = "block"; }
  }
});

socket.on("host-assignment", (data) => {
  isHost = data.isHost;
  if (isHost) {
    hostAudioContainer.style.display = "block"; canDraw = true; document.getElementById('wb-toolbar').style.display = "flex"; canvas.style.cursor = "crosshair"; wbStatus.textContent = "(Host Mode)";
    presInputForm.style.display = "flex"; toggleWbBtn.style.display = "inline-block"; toggleMapBtn.style.display = "inline-block"; togglePresBtn.style.display = "inline-block"; 
    document.querySelectorAll('.host-only-btn').forEach(btn => btn.style.display = "inline-block");
  } else {
    hostAudioContainer.style.display = "none"; canDraw = false; document.getElementById('wb-toolbar').style.display = "none"; canvas.style.cursor = "not-allowed"; wbStatus.textContent = "(View Only)";
    presInputForm.style.display = "none"; toggleWbBtn.style.display = "none"; toggleMapBtn.style.display = "none"; togglePresBtn.style.display = "none";
    viewGraphBtn.parentElement.style.display = "none";
  }
});

socket.on("room-update", (data) => {
  if (isHost && data.size > 1) { muteAllBtn.style.display = "inline-block"; unmuteAllBtn.style.display = "inline-block"; } 
  else if (isHost) { muteAllBtn.style.display = "none"; unmuteAllBtn.style.display = "none"; }
});

// MUSIC & REMOTE VIDEO
document.getElementById("hostAudioFile").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return; const fd = new FormData(); fd.append("file", file); fd.append("room", currentRoom || ""); fd.append("uploader", "Host-Music");
  try { currentMusicUrl = (await (await fetch("/upload", { method: "POST", body: fd })).json()).url; hostAudioPlayer.src = currentMusicUrl; showNotification("Music ready", "join"); } catch (err) {}
});
hostAudioPlayer.addEventListener("play", () => { if (!joined || !isHost || !currentMusicUrl) return; socket.emit("control", { room: currentRoom, action: "music-play", url: currentMusicUrl, time: hostAudioPlayer.currentTime }); });
hostAudioPlayer.addEventListener("pause", () => { if (!joined || !isHost) return; socket.emit("control", { room: currentRoom, action: "music-pause" }); });
hostAudioPlayer.addEventListener("seeked", () => { if (!joined || !isHost || !currentMusicUrl) return; socket.emit("control", { room: currentRoom, action: "music-seek", time: hostAudioPlayer.currentTime }); });

client.on("user-published", async (user, mediaType) => {
  try {
    await client.subscribe(user, mediaType); const uid = user.uid.toString(); remoteUsers[uid] = user;
    if (mediaType === "video") {
      if (user.videoTrack.getTrackId().includes("screen") || uid.includes("screen")) {
        const sc = document.createElement("div"); sc.className = "video-card screen-share-card"; sc.id = `screen-card-${uid}`;
        sc.style.width = "100%"; sc.style.height = "320px"; sc.style.gridColumn = "1 / -1"; sc.style.border = "3px solid var(--accent)";
        addSizeControls(sc, sc); videoArea.appendChild(sc); user.videoTrack.play(sc);
      } else { createRemoteWrapper(uid, `User ${uid}`); user.videoTrack.play(document.getElementById(`remote-${uid}`)); }
    }
    if (mediaType === "audio" && user.audioTrack) user.audioTrack.play();
  } catch (e) { console.error(e); }
});

client.on("user-unpublished", (user, mediaType) => { if (mediaType === "video") document.getElementById(`screen-card-${user.uid}`)?.remove(); });
client.on("user-left", (user) => removeRemoteUser(user.uid.toString()));
socket.on("user-left", info => { if (info && info.uid) removeRemoteUser(info.uid.toString(), info.name); });
function removeRemoteUser(uid, name = null) { document.getElementById(`remote-wrapper-${uid}`)?.remove(); document.getElementById(`screen-card-${uid}`)?.remove(); delete remoteUsers[uid]; }

// LOCAL & GLOBAL CONTROLS
leaveBtn.addEventListener("click", async () => { socket.emit("leave-room"); await client.leave(); window.location.reload(); });
muteAllBtn.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "mute-all" }); });
unmuteAllBtn.addEventListener("click", () => { if (joined && isHost) socket.emit("control", { room: currentRoom, action: "unmute-all" }); });

cameraBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.videoTrack) return;
  const en = localTracks.videoTrack.enabled; await localTracks.videoTrack.setEnabled(!en);
  cameraBtn.textContent = en ? "📹 Camera" : "🚫📹 Camera"; cameraBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "disable-video" : "enable-video" });
});
muteBtn.addEventListener("click", async () => {
  if (!joined || !localTracks.audioTrack) return;
  const en = localTracks.audioTrack.enabled; await localTracks.audioTrack.setEnabled(!en);
  muteBtn.textContent = en ? "🎙️ Mic" : "🔇 Mic"; muteBtn.style.background = en ? "" : "rgba(231, 76, 60, 0.7)"; 
  socket.emit("control", { room: currentRoom, targetUid: localUid, action: en ? "mute-audio" : "enable-audio" });
});

shareBtn.addEventListener("click", async () => {
  if (!joined) return;
  if (isSharing) {
    isSharing = false; if (screenTrack) { await client.unpublish(screenTrack); screenTrack.close(); screenTrack = null; }
    socket.emit("control", { room: currentRoom, action: "share-stop", uid: localUid });
    const myContainer = document.getElementById("local-player");
    if(myContainer) { myContainer.style.height = "200px"; myContainer.parentElement.style.width = "100%"; myContainer.parentElement.classList.remove("video-wrapper-large"); }
    if (localTracks.videoTrack) { await client.publish(localTracks.videoTrack); localTracks.videoTrack.play(myContainer); }
    shareBtn.textContent = "🖥️ Share Screen"; shareBtn.style.background = ""; return;
  }
  if (localTracks.videoTrack) await client.unpublish(localTracks.videoTrack);
  try {
      screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto"); isSharing = true; shareBtn.textContent = "🛑 Stop Share"; shareBtn.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
      const myContainer = document.getElementById("local-player");
      if(myContainer) { myContainer.style.height = "400px"; myContainer.parentElement.classList.add("video-wrapper-large"); screenTrack.play(myContainer); }
      await client.publish(screenTrack); socket.emit("control", { room: currentRoom, action: "share-start", uid: localUid });
      screenTrack.on("track-ended", () => { if (isSharing) shareBtn.click(); });
  } catch(e) { if (localTracks.videoTrack) { await client.publish(localTracks.videoTrack); localTracks.videoTrack.play(document.getElementById("local-player")); } }
});

socket.on("control", async (data) => {
  if (!joined || !data) return;
  if (data.action === "share-start") { const w = document.getElementById(`remote-wrapper-${data.uid}`); if (w) w.classList.add("video-wrapper-large"); }
  if (data.action === "share-stop") { const w = document.getElementById(`remote-wrapper-${data.uid}`); if (w) w.classList.remove("video-wrapper-large"); }
  
  if (data.action === "music-play" && !isHost) { 
      remoteMusicPlayer.src = data.url; 
      remoteMusicPlayer.currentTime = data.time || 0; 
      
      let listenBtn = document.getElementById("listenMusicBtn");
      if(!listenBtn) {
          listenBtn = document.createElement("button");
          listenBtn.id = "listenMusicBtn";
          listenBtn.innerHTML = "🎵 Host is playing music! Click to Listen";
          listenBtn.style.cssText = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999999; background: #2ecc71; color: white; padding: 15px 30px; border: 2px solid white; border-radius: 50px; font-size: 16px; font-weight: bold; cursor: pointer; animation: pulseMusic 1.5s infinite;";
          document.body.appendChild(listenBtn);
          
          listenBtn.onclick = () => {
              remoteMusicPlayer.play().then(() => {
                  listenBtn.style.display = "none";
                  localMusicMuteBtn.style.display = "inline-block";
              }).catch(e => {
                  alert("Tap anywhere on the screen first to allow audio.");
              });
          };
      } else {
          listenBtn.style.display = "block";
      }
  }

  if (data.action === "music-pause" && !isHost) remoteMusicPlayer.pause();
  if (data.action === "music-seek" && !isHost) remoteMusicPlayer.currentTime = data.time || 0;
  if (data.action === "mute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); muteBtn.textContent = "🔇 Mic"; muteBtn.style.background = "rgba(231, 76, 60, 0.7)"; }
  if (data.action === "unmute-all" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); muteBtn.textContent = "🎙️ Mic"; muteBtn.style.background = ""; }
  if (data.targetUid === localUid) {
    if (data.action === "mute-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(false); muteBtn.textContent = "🔇 Mic"; muteBtn.style.background = "rgba(231, 76, 60, 0.7)"; showNotification("Host muted you", "danger"); }
    if (data.action === "disable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(false); cameraBtn.textContent = "🚫📹 Camera"; cameraBtn.style.background = "rgba(231, 76, 60, 0.7)"; }
    if (data.action === "enable-audio" && localTracks.audioTrack) { await localTracks.audioTrack.setEnabled(true); muteBtn.textContent = "🎙️ Mic"; muteBtn.style.background = ""; }
    if (data.action === "enable-video" && localTracks.videoTrack) { await localTracks.videoTrack.setEnabled(true); cameraBtn.textContent = "📹 Camera"; cameraBtn.style.background = ""; }
  }
});

socket.on("wb-control", (data) => {
  if (data.targetUid === localUid) {
    if (data.action === "grant") { canDraw = true; document.getElementById('wb-toolbar').style.display = "flex"; canvas.style.cursor = "crosshair"; wbStatus.textContent = "(You have access)"; showNotification("Host gave you Whiteboard access! 🎨", "join"); } 
    else if (data.action === "revoke") { canDraw = false; document.getElementById('wb-toolbar').style.display = "none"; canvas.style.cursor = "not-allowed"; wbStatus.textContent = "(View Only - Access Revoked)"; showNotification("Your whiteboard access was revoked.", "danger"); }
  }
});

// CHAT & FILES
sendMsgBtn.addEventListener("click", () => { const text = chatInput.value.trim(); if (!text) return; socket.emit("chat-message", { room: currentRoom, name: usernameInput.value || "Me", text }); appendMessage(`Me: ${text}`); chatInput.value = ""; });
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMsgBtn.click(); } });
socket.on("chat-message", data => { if(data.name === "System" && data.text.includes("left")) return; appendMessage(`${data.name}: ${data.text}`); });
document.getElementById("uploadBtn").addEventListener("click", async () => { const f = fileUpload.files[0]; if (!f) return; const fd = new FormData(); fd.append("file", f); fd.append("room", currentRoom); fd.append("uploader", usernameInput.value || "User"); try { addFileLink((await (await fetch("/upload", { method: "POST", body: fd })).json()).filename, (await (await fetch("/upload", { method: "POST", body: fd })).json()).url); } catch (err) { } });
function addFileLink(name, url) { const a = document.createElement("a"); a.href = url; a.textContent = name; a.download = name; a.target = "_blank"; fileList.prepend(a); }
socket.on("file-uploaded", data => { addFileLink(data.filename, data.url); showNotification(`${data.uploader} uploaded a file`, "info"); });
socket.on("user-joined", info => showNotification(`${info.name || "User"} joined the room!`, "join"));