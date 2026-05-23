import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAPL2Eh2y33mrcguoziAvP8LoPt8Anu3U",
  authDomain: "study-together-613b7.firebaseapp.com",
  projectId: "study-together-613b7",
  storageBucket: "study-together-613b7.firebasestorage.app",
  messagingSenderId: "685441753047",
  appId: "1:685441753047:web:c51e387726e9ee0700f592",
  measurementId: "G-Y59SWKY3ES"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const APP_ID = "3fd771b87f804bc59f50e485662afaa7";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

let localTracks = [];
let screenTrack = null;

const joinBtn = document.getElementById("joinBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const leaveBtn = document.getElementById("leaveBtn");
const shareBtn = document.getElementById("shareBtn");
const sendBtn = document.getElementById("sendBtn");

const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");

let micMuted = false;
let cameraOff = false;
let currentUsername = "";
let currentRoom = "";

// JOIN ROOM
joinBtn.onclick = async () => {
    currentRoom = document.getElementById("room").value;
    currentUsername = document.getElementById("username").value;

    if(currentRoom === "" || currentUsername === ""){
        alert("Enter Name and Room ID");
        return;
    }

    await client.join(APP_ID, currentRoom, null, null);

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    const player = document.createElement("div");
    player.className = "video-box";
    player.innerHTML = `
        <p>${currentUsername}</p>
        <div id="local-player" class="video"></div>
    `;
    document.getElementById("videos").appendChild(player);

    localTracks[1].play("local-player");
    await client.publish(localTracks);

    loadMessages();
};

// REMOTE USER HANDLING
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if(mediaType === "video"){
        let player = document.getElementById(user.uid);
        if(!player){
            const remotePlayer = document.createElement("div");
            remotePlayer.className = "video-box";
            remotePlayer.innerHTML = `
                <p>User ${user.uid}</p>
                <div id="${user.uid}" class="video"></div>
            `;
            document.getElementById("videos").appendChild(remotePlayer);
        }
        user.videoTrack.play(String(user.uid));
    }

    if(mediaType === "audio"){
        user.audioTrack.play();
    }
});

// MUTE MIC
muteBtn.onclick = async () => {
    if(!localTracks.length) return;
    micMuted = !micMuted;
    await localTracks[0].setEnabled(!micMuted);
    muteBtn.innerText = micMuted ? "Unmute" : "Mute";
};

// TOGGLE CAMERA
cameraBtn.onclick = async () => {
    if(!localTracks.length) return;
    cameraOff = !cameraOff;
    await localTracks[1].setEnabled(!cameraOff);
    cameraBtn.innerText = cameraOff ? "Camera On" : "Camera Off";
};

// LEAVE ROOM
leaveBtn.onclick = async () => {
    for(let track of localTracks){
        track.stop();
        track.close();
    }
    if(screenTrack){
        await client.unpublish(screenTrack);
        screenTrack.close();
        screenTrack = null;
    }
    await client.leave();
    document.getElementById("videos").innerHTML = "";
    alert("You left the room");
};

// SEND MESSAGE
sendBtn.onclick = async () => {
    const text = messageInput.value;
    if(text === "") return;
    await addDoc(collection(db, "messages"), {
        room: currentRoom,
        username: currentUsername,
        text: text,
        time: Date.now()
    });
    messageInput.value = "";
};

// LOAD MESSAGES
function loadMessages(){
    const q = query(collection(db, "messages"), orderBy("time"));
    onSnapshot(q, (snapshot) => {
        messages.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            if(data.room === currentRoom){
                const msg = document.createElement("div");
                msg.className = "message";
                msg.innerHTML = `<b>${data.username}:</b> ${data.text}`;
                messages.appendChild(msg);
            }
        });
        messages.scrollTop = messages.scrollHeight;
    });
}

// SCREEN SHARE FIXED
shareBtn.onclick = async () => {
    try {
        if (!screenTrack) {
            // Stop camera video before starting screen share
            if (localTracks[1]) {
                await client.unpublish(localTracks[1]);
            }

            // Create screen track
            screenTrack = await AgoraRTC.createScreenVideoTrack();

            const screenPlayer = document.createElement("div");
            screenPlayer.id = "screen-share";
            screenPlayer.className = "video";
            document.getElementById("videos").appendChild(screenPlayer);

            screenTrack.play("screen-share");
            await client.publish(screenTrack);

            // When user stops sharing
            screenTrack.on("track-ended", async () => {
                await client.unpublish(screenTrack);
                screenTrack.close();
                screenTrack = null;

                const div = document.getElementById("screen-share");
                if(div) div.remove();

                // Re-publish camera track again
                if (localTracks[1]) {
                    await client.publish(localTracks[1]);
                }
            });
        } else {
            // Stop screen share manually
            await client.unpublish(screenTrack);
            screenTrack.close();
            screenTrack = null;

            const div = document.getElementById("screen-share");
            if(div) div.remove();

            // Re-publish camera track again
            if (localTracks[1]) {
                await client.publish(localTracks[1]);
            }
        }
    } catch (err) {
        console.error(err);
        alert(err.message);
    }
};
