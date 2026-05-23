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

const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

let localTracks = [];
let screenTrack = null;
let remoteUsers = {}; // { uid: audioTrack }

const joinBtn = document.getElementById("joinBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const leaveBtn = document.getElementById("leaveBtn");
const shareBtn = document.getElementById("shareBtn");
const sendBtn = document.getElementById("sendBtn");
const muteAllBtn = document.getElementById("muteAllBtn");
const sendFileBtn = document.getElementById("sendFileBtn");
const fileInput = document.getElementById("fileInput");

const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");

let micMuted = false;
let cameraOff = false;
let currentUsername = "";
let currentRoom = "";

/* Helper to escape username to avoid injection */
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"'`=\/]/g, function (s) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}

/* Create remote player UI and attach handlers (idempotent) */
function createRemotePlayerIfNeeded(user) {
  if (!user || !user.uid) return;
  const uid = user.uid;
  let player = document.getElementById("user-" + uid);

  if (!player) {
    const remotePlayer = document.createElement("div");
    remotePlayer.className = "video-box";
    remotePlayer.id = "user-" + uid;

    remotePlayer.innerHTML = `
      <p>User ${uid}</p>
      <video id="video-${uid}" class="video" autoplay playsinline controls></video>
      <button id="fs-${uid}">Fullscreen</button>
      <button id="mute-${uid}">Mute User</button>
    `;
    document.getElementById("videos").appendChild(remotePlayer);
    player = remotePlayer;
  }

  // Fullscreen handler
  const fsBtn = document.getElementById("fs-" + uid);
  if (fsBtn) {
    fsBtn.style.display = "block";
    fsBtn.onclick = () => {
      const videoElement = document.getElementById("video-" + uid);
      if (!videoElement) return;
      if (videoElement.requestFullscreen) videoElement.requestFullscreen();
      else if (videoElement.webkitRequestFullscreen) videoElement.webkitRequestFullscreen();
      else if (videoElement.msRequestFullscreen) videoElement.msRequestFullscreen();
    };
  }

  // Mute/unmute handler
  const muteBtnRemote = document.getElementById("mute-" + uid);
  if (muteBtnRemote) {
    muteBtnRemote.style.display = "block";
    muteBtnRemote.onclick = null;
    let muted = false;
    muteBtnRemote.onclick = () => {
      muted = !muted;
      const audioTrack = remoteUsers[uid];
      if (muted) {
        try { audioTrack && audioTrack.stop(); } catch (e) { console.warn(e); }
        muteBtnRemote.innerText = "Unmute User";
      } else {
        try { audioTrack && audioTrack.play(); } catch (e) { console.warn(e); }
        muteBtnRemote.innerText = "Mute User";
      }
    };
  }
}

/* JOIN ROOM */
joinBtn.onclick = async () => {
  currentRoom = document.getElementById("room").value.trim();
  currentUsername = document.getElementById("username").value.trim();

  if (!currentRoom || !currentUsername) {
    alert("Please enter your name and a room ID.");
    return;
  }

  try {
    await client.join(APP_ID, currentRoom, null, null);

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    const player = document.createElement("div");
    player.className = "video-box";
    player.innerHTML = `
      <p>${currentUsername}</p>
      <video id="local-player" class="video" autoplay playsinline controls></video>
    `;
    document.getElementById("videos").appendChild(player);

    localTracks[1].play("local-player");
    await client.publish(localTracks);

    // Create UI for already-published remote users so new joiner sees buttons
    try {
      const existing = client.remoteUsers || [];
      for (const u of existing) {
        createRemotePlayerIfNeeded(u);
        try {
          if (u.hasVideo) await client.subscribe(u, "video");
          if (u.hasAudio) await client.subscribe(u, "audio");
        } catch (e) { console.warn("subscribe existing user error", e); }

        if (u.videoTrack) {
          try { u.videoTrack.play("video-" + u.uid); } catch (e) {}
        }
        if (u.audioTrack) {
          remoteUsers[u.uid] = u.audioTrack;
          try { u.audioTrack.play(); } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("Error handling existing remoteUsers:", e);
    }

    loadMessages();
  } catch (err) {
    console.error("Join error:", err);
    alert("Failed to join the room: " + (err.message || err));
  }
};

/* REMOTE USER PUBLISHED */
client.on("user-published", async (user, mediaType) => {
  try {
    await client.subscribe(user, mediaType);
  } catch (err) {
    console.error("Subscribe error:", err);
    return;
  }

  createRemotePlayerIfNeeded(user);

  if (mediaType === "video") {
    if (user.videoTrack) {
      try { user.videoTrack.play("video-" + user.uid); } catch (e) {}
    }
  }

  if (mediaType === "audio") {
    if (user.audioTrack) {
      remoteUsers[user.uid] = user.audioTrack;
      try { user.audioTrack.play(); } catch (e) {}
    }
  }

  if (user.audioTrack && !remoteUsers[user.uid]) {
    remoteUsers[user.uid] = user.audioTrack;
  }
});

/* REMOTE USER UNPUBLISHED / LEFT */
client.on("user-unpublished", (user, mediaType) => {
  if (mediaType === "video") {
    const el = document.getElementById("user-" + user.uid);
    if (el) el.remove();
  }
  if (mediaType === "audio") {
    if (remoteUsers[user.uid]) delete remoteUsers[user.uid];
    const muteBtn = document.getElementById("mute-" + user.uid);
    if (muteBtn) muteBtn.remove();
  }
});

client.on("user-left", (user) => {
  const el = document.getElementById("user-" + user.uid);
  if (el) el.remove();
  if (remoteUsers[user.uid]) delete remoteUsers[user.uid];
});

/* GLOBAL MUTE ALL */
muteAllBtn.onclick = () => {
  for (const uid in remoteUsers) {
    try { remoteUsers[uid].stop(); } catch (e) {}
    const btn = document.getElementById("mute-" + uid);
    if (btn) btn.innerText = "Unmute User";
  }
};

/* LOCAL CONTROLS */
muteBtn.onclick = async () => {
  if (!localTracks.length) return;
  micMuted = !micMuted;
  try {
    await localTracks[0].setEnabled(!micMuted);
    muteBtn.innerText = micMuted ? "Unmute" : "Mute";
  } catch (err) {
    console.error("Mic toggle error:", err);
    alert("Microphone toggle failed: " + (err.message || err));
  }
};

cameraBtn.onclick = async () => {
  if (!localTracks.length) return;
  cameraOff = !cameraOff;
  try {
    await localTracks[1].setEnabled(!cameraOff);
    cameraBtn.innerText = cameraOff ? "Camera On" : "Camera Off";
  } catch (err) {
    console.error("Camera toggle error:", err);
    alert("Camera toggle failed: " + (err.message || err));
  }
};

/* LEAVE ROOM */
leaveBtn.onclick = async () => {
  try {
    for (let track of localTracks) {
      try { track.stop(); } catch (e) {}
      try { track.close(); } catch (e) {}
    }
    localTracks = [];

    if (screenTrack) {
      try { await client.unpublish(screenTrack); } catch (e) {}
      try { screenTrack.close(); } catch (e) {}
      screenTrack = null;
    }

    await client.leave();
    document.getElementById("videos").innerHTML = "";
    alert("You have left the room.");
  } catch (err) {
    console.error("Leave error:", err);
    alert("Error leaving the room: " + (err.message || err));
  }
};

/* SEND CHAT MESSAGE */
sendBtn.onclick = async () => {
  const text = messageInput.value.trim();
  if (!text) return;
  try {
    await addDoc(collection(db, "messages"), {
      room: currentRoom,
      username: currentUsername,
      text: text,
      time: Date.now()
    });
    messageInput.value = "";
  } catch (err) {
    console.error("Send message error:", err);
    alert("Failed to send message: " + (err.message || err));
  }
};

/* SHARE DOCUMENT (robust with progress + immediate local append + diagnostics) */
if (sendFileBtn) {
  sendFileBtn.onclick = async () => {
    try {
      // Diagnostics: ensure DOM elements and room info exist
      console.log("sendFileBtn exists:", !!sendFileBtn);
      console.log("fileInput exists:", !!fileInput);
      console.log("messages element exists:", !!messages);
      console.log("currentRoom, currentUsername:", currentRoom, currentUsername);

      if (!currentRoom || !currentUsername) {
        alert("Please join a room first before sharing documents.");
        return;
      }

      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        alert("Please select a file first.");
        return;
      }

      console.log("Starting upload:", file.name);

      const storageRef = ref(storage, `shared/${Date.now()}-${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          console.log(`Upload ${percent}%`);
        },
        (error) => {
          console.error("Upload failed:", error);
          // Detect likely CORS / network issues and provide a helpful console hint
          if (error && error.message && error.message.toLowerCase().includes("cors")) {
            console.warn("CORS issue detected. Ensure your storage bucket CORS is configured and storageBucket is correct.");
          }
          alert("Upload failed: " + (error.message || error));
        },
        async () => {
          try {
            console.log("Upload finished, getting URL...");
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("File URL:", url);

            const messageText = `📎 <a href="${url}" target="_blank" rel="noopener noreferrer">${file.name}</a>`;

            // write to Firestore
            const docRef = await addDoc(collection(db, "messages"), {
              room: currentRoom,
              username: currentUsername,
              text: messageText,
              time: Date.now()
            });
            console.log("Firestore write success, id:", docRef.id);

            // immediate local append so user sees it right away
            const localMsg = document.createElement("div");
            localMsg.className = "message";
            localMsg.innerHTML = `<b>${escapeHtml(currentUsername)}:</b> ${messageText}`;
            messages.appendChild(localMsg);
            messages.scrollTop = messages.scrollHeight;

            fileInput.value = "";
            alert("Document shared successfully.");
          } catch (err) {
            console.error("Post-upload error:", err);
            // If getDownloadURL or addDoc fails, log hint about permissions/CORS
            if (err && err.message && (err.message.toLowerCase().includes("cors") || err.message.toLowerCase().includes("permission"))) {
              console.warn("Possible CORS or permission issue. Check storage bucket CORS and rules.");
            }
            alert("Failed to share document: " + (err.message || err));
          }
        }
      );
    } catch (err) {
      console.error("Share handler error:", err);
      alert("Something went wrong while sharing the document: " + (err.message || err));
    }
  };
} else {
  console.warn("sendFileBtn not found. Ensure <button id='sendFileBtn'> exists in HTML.");
}

/* LOAD MESSAGES realtime */
function loadMessages() {
  const q = query(collection(db, "messages"), orderBy("time"));
  onSnapshot(q, (snapshot) => {
    messages.innerHTML = "";
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.room === currentRoom) {
        const msg = document.createElement("div");
        msg.className = "message";
        msg.innerHTML = `<b>${escapeHtml(data.username)}:</b> ${data.text}`;
        messages.appendChild(msg);
      }
    });
    messages.scrollTop = messages.scrollHeight;
  }, (err) => {
    console.error("Messages snapshot error:", err);
    alert("Failed to load messages: " + (err.message || err));
  });
}

/* SCREEN SHARE handling */
shareBtn.onclick = async () => {
  try {
    if (!screenTrack) {
      if (localTracks[1]) {
        try { await client.unpublish(localTracks[1]); } catch (e) {}
      }

      screenTrack = await AgoraRTC.createScreenVideoTrack();

      const screenPlayer = document.createElement("video");
      screenPlayer.id = "screen-share";
      screenPlayer.className = "video";
      screenPlayer.autoplay = true;
      screenPlayer.playsInline = true;
      screenPlayer.controls = true;
      document.getElementById("videos").appendChild(screenPlayer);

      screenTrack.play("screen-share");
      await client.publish(screenTrack);

      screenTrack.on("track-ended", async () => {
        try { await client.unpublish(screenTrack); } catch (e) {}
        try { screenTrack.close(); } catch (e) {}
        screenTrack = null;
        const div = document.getElementById("screen-share");
        if (div) div.remove();

        if (localTracks[1]) {
          try { await client.publish(localTracks[1]); } catch (e) {}
        }
      });
    } else {
      try { await client.unpublish(screenTrack); } catch (e) {}
      try { screenTrack.close(); } catch (e) {}
      screenTrack = null;
      const div = document.getElementById("screen-share");
      if (div) div.remove();

      if (localTracks[1]) {
        try { await client.publish(localTracks[1]); } catch (e) {}
      }
    }
  } catch (err) {
    console.error("Screen share error:", err);
    alert("Screen share failed: " + (err.message || err));
  }
};
// ----existing Agora / chat code----
// Chat message send
// Agora client setup
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

let joined = false;
let localAudioTrack, localVideoTrack;

// Join Room
document.getElementById('joinBtn').addEventListener('click', async () => {
  if (joined) {
    alert("Already joined the room!");
    return;
  }

  const roomId = document.getElementById('room').value.trim();
  const userName = document.getElementById('username').value.trim();

  if (!roomId || !userName) {
    alert("Please enter both Name and Room ID!");
    return;
  }

  try {
    const appId = "3fd771b87f804bc59f50e485662afaa7";
    const token = null; // अगर certificate enable नहीं है
    const uid = userName;

    await client.join(appId, roomId, token, uid);

    // ✅ Mic और Camera track बनाओ
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localVideoTrack = await AgoraRTC.createCameraVideoTrack();

    // ✅ Publish करो
    await client.publish([localAudioTrack, localVideoTrack]);

    joined = true;

    // UI दिखाओ
    const controls = document.getElementById('controls');
    const chat = document.getElementById('chat-container');
    controls.classList.remove('hidden');
    chat.classList.remove('hidden');
    controls.classList.add('fade-in');
    chat.classList.add('fade-in');

  } catch (err) {
    alert("Failed to join room: " + err);
  }
});

// Leave Room
document.getElementById('leaveBtn').addEventListener('click', async () => {
  try {
    // ✅ Tracks बंद करो
    if (localAudioTrack) localAudioTrack.close();
    if (localVideoTrack) localVideoTrack.close();

    await client.leave();
    joined = false;

    document.getElementById('controls').classList.add('hidden');
    document.getElementById('chat-container').classList.add('hidden');

    alert("You have left the room.");
  } catch (err) {
    alert("Error leaving room: " + err);
  }
});
