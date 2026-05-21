const APP_ID = "3fd771b87f804bc59f50e485662afaa7";
const sendBtn = document.getElementById("sendBtn");

const messageInput = document.getElementById("messageInput");

const messages = document.getElementById("messages");

const client = AgoraRTC.createClient({
    mode: "rtc",
    codec: "vp8"
});

let localTracks = [];

const joinBtn = document.getElementById("joinBtn");
const muteBtn = document.getElementById("muteBtn");

const cameraBtn = document.getElementById("cameraBtn");

const leaveBtn = document.getElementById("leaveBtn");

let micMuted = false;

let cameraOff = false;

joinBtn.onclick = async () => {

    const roomId = document.getElementById("room").value;

    const username = document.getElementById("username").value;

    if(roomId === "" || username === ""){
        alert("Enter Name and Room ID");
        return;
    }

    await client.join(APP_ID, roomId, null, null);

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

    const player = document.createElement("div");

    player.className = "video-box";

    player.innerHTML = `
        <p>${username}</p>
        <div id="local-player" style="width:300px;height:220px;"></div>
    `;

    document.getElementById("videos").appendChild(player);

    localTracks[1].play("local-player");

    await client.publish(localTracks);

};

client.on("user-published", async (user, mediaType) => {

    await client.subscribe(user, mediaType);

    if(mediaType === "video"){

        const remotePlayer = document.createElement("div");

        remotePlayer.className = "video-box";

        remotePlayer.innerHTML = `
            <p>User</p>
            <div id="${user.uid}" style="width:300px;height:220px;"></div>
        `;

        document.getElementById("videos").appendChild(remotePlayer);

        user.videoTrack.play(String(user.uid));

    }

    if(mediaType === "audio"){
        user.audioTrack.play();
    }

});
muteBtn.onclick = async () => {

    if(!localTracks.length) return;

    micMuted = !micMuted;

    await localTracks[0].setEnabled(!micMuted);

    muteBtn.innerText = micMuted ? "Unmute" : "Mute";

};
muteBtn.onclick = async () => {

    if(!localTracks.length) return;

    micMuted = !micMuted;

    await localTracks[0].setEnabled(!micMuted);

    muteBtn.innerText = micMuted ? "Unmute" : "Mute";

};
leaveBtn.onclick = async () => {

    for(let track of localTracks){

        track.stop();

        track.close();

    }

    await client.leave();

    document.getElementById("videos").innerHTML = "";

    alert("You left the room");

};
cameraBtn.onclick = async () => {

    if(!localTracks.length) return;

    cameraOff = !cameraOff;

    if(cameraOff){

        await localTracks[1].setMuted(true);

        cameraBtn.innerText = "Camera On";

    } else {

        await localTracks[1].setMuted(false);

        cameraBtn.innerText = "Camera Off";

    }

};
sendBtn.onclick = () => {

    const text = messageInput.value;

    if(text === "") return;

    const msg = document.createElement("div");

    msg.className = "message";

    msg.innerHTML = `
        <b>You:</b> ${text}
    `;

    messages.appendChild(msg);

    messageInput.value = "";

    messages.scrollTop = messages.scrollHeight;

};