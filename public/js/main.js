// UI wiring for Multi-User, Lobby System, and Host Controls

import { createSignaling } from "./signaling.js";
import * as peer from "./peer.js";

const $ = (id) => document.getElementById(id);

export function log(text, cls = "") {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  if (cls) li.className = cls;
  $("log").appendChild(li);
  li.scrollIntoView({ block: "end" });
  console.log(text);
}

export function showState(name, value) {
  const el = { signaling: "sigState", connection: "connState" }[name];
  if (el) $(el).textContent = value;
}

let myRole = "student"; // "host" or "student"
let myId = null;
let participants = new Map(); // id -> { name, role }

// ---------- signaling adapter ----------
const signaling = createSignaling({
  log,
  // রুমে সফলভাবে যুক্ত হলে
  onJoined: ({ yourId, role, peers: existingPeers }) => {
    myId = yourId;
    myRole = role;

    $("lobbyModal").classList.add("hidden");
    $("roleBadge").textContent = role === "host" ? "Teacher (Host)" : "Student";
    $("roleBadge").className = `badge ${role}`;

    log(`ক্লাসে জয়েন করেছি! ভূমিকা: ${role}`);
    updateParticipant(yourId, $("nameInput").value, role);

    // ক্লাসে আগে থেকে উপস্থিত সবাইকে তালিকায় দেখাই (কিন্তু এদেরকে কল পাঠাবো না, এরাই আমাকে কল পাঠাবে!)
    for (const p of existingPeers) {
      updateParticipant(p.id, p.name, "student");
      log(`আগে থেকেই ক্লাসে আছেন: ${p.name}`);
    }
  },

  // নতুন কেউ ক্লাসে প্রবেশ করলে: আমরা পুরনোরা তাকে কল (Offer) পাঠাবো
  onPeerJoined: ({ peerId, name }) => {
    log(`নতুন সহপাঠী ক্লাসে প্রবেশ করেছে: ${name} → আমি তাকে কল পাঠাচ্ছি 📞`);
    updateParticipant(peerId, name, "student");
    peer.callPeer(peerId);
  },

  // কেউ ক্লাস থেকে বের হয়ে গেলে
  onPeerLeft: ({ peerId }) => {
    log(`সহপাঠী লিভ নিয়েছে [${peerId.slice(0, 6)}]`);
    peer.removePeer(peerId);
    removeParticipant(peerId);
  },

  // সিগন্যাল বার্তা
  onSignal: ({ from, data }) => {
    if (data.type === "media-state") {
      const ph = document.getElementById(`ph-${from}`);
      const bd = document.getElementById(`badge-${from}`);
      if (ph && typeof data.isVideoOn === "boolean") ph.classList.toggle("hidden", data.isVideoOn);
      if (bd && typeof data.isAudioOn === "boolean") bd.textContent = data.isAudioOn ? "🎙️" : "🔇";
      return;
    }
    peer.handleSignal(from, data);
  },

  // স্টুডেন্ট যখন লবিতে আটকে থাকবে
  onWaitingInLobby: () => {
    $("lobbyModal").classList.remove("hidden");
    log("আপনি লবিতে আছেন। শিক্ষক ক্লাসে অনুমতি দেওয়ার অপেক্ষা করা হচ্ছে... ⏳");
  },

  // শিক্ষকের কাছে ছাত্রের রিকোয়েস্ট আসলে (Lobby Admit Request)
  onLobbyRequest: ({ studentId, studentName }) => {
    log(`লবি রিকোয়েস্ট এসেছে: ${studentName} ক্লাসে ঢুকতে চায় 🔔`);
    $("lobbyRequests").classList.remove("hidden");

    const item = document.createElement("div");
    item.id = `req-${studentId}`;
    item.className = "lobby-item";
    item.innerHTML = `
      <span>👤 <b>${studentName}</b></span>
      <div>
        <button class="btn-admit" id="admit-${studentId}">Admit</button>
        <button class="btn-reject" id="reject-${studentId}">Reject</button>
      </div>
    `;
    $("lobbyList").appendChild(item);

    $(`admit-${studentId}`).onclick = () => {
      signaling.respondToLobby(studentId, true);
      item.remove();
      if ($("lobbyList").children.length === 0) $("lobbyRequests").classList.add("hidden");
    };

    $(`reject-${studentId}`).onclick = () => {
      signaling.respondToLobby(studentId, false);
      item.remove();
      if ($("lobbyList").children.length === 0) $("lobbyRequests").classList.add("hidden");
    };
  },

  // শিক্ষক রিজেক্ট করলে
  onAdmitRejected: () => {
    $("lobbyModal").innerHTML = `
      <div class="modal-box">
        <h3>🚫 Access Denied</h3>
        <p>The host has denied your request to join this class.</p>
        <button onclick="location.reload()">Back</button>
      </div>
    `;
  },

  // শিক্ষক ক্লাসরুম থেকে কিক করলে
  onKicked: () => {
    alert("You have been removed from the class by the teacher.");
    location.reload();
  },

  // শিক্ষক ফোর্স মিউট করলে
  onForceMuted: async () => {
    log("শিক্ষক আপনাকে মিউট করে দিয়েছেন! 🔇");
    const isUnmuted = await peer.toggleAudio();
    if (!isUnmuted) {
      $("micBtn").textContent = "🔇 Mic Off";
      $("localAudioBadge").textContent = "🔇";
    }
  },

  onRoomFull: () => alert("Class is full (maximum capacity reached)"),
});

// ---------- UI Controls ----------
$("joinBtn").onclick = async () => {
  const roomId = $("roomInput").value.trim();
  const userName = $("nameInput").value.trim() || "Student";
  if (!roomId) return alert("Enter a room name");

  try {
    await peer.init({
      localVideo: $("localVideo"),
      videosContainer: $("videosGrid"),
      sendSignal: signaling.sendSignal,
    });

    await signaling.connect();
    signaling.join(roomId, userName);

    $("joinBtn").disabled = true;
    $("leaveBtn").disabled = false;
    $("micBtn").disabled = false;
    $("camBtn").disabled = false;
    $("shareBtn").disabled = false;
  } catch (err) {
    log(`Error: ${err.message}`, "err");
  }
};

$("micBtn").onclick = async () => {
  const isUnmuted = await peer.toggleAudio();
  $("micBtn").textContent = isUnmuted ? "🎙️ Mic On" : "🔇 Mic Off";
  $("localAudioBadge").textContent = isUnmuted ? "🎙️" : "🔇";
  broadcastMediaState({ isAudioOn: isUnmuted });
};

$("camBtn").onclick = async () => {
  const isVideoOn = await peer.toggleVideo();
  $("camBtn").textContent = isVideoOn ? "📷 Cam On" : "🚫 Cam Off";
  $("localPlaceholder").classList.toggle("hidden", isVideoOn);
  broadcastMediaState({ isVideoOn });
};

$("shareBtn").onclick = async () => {
  const isSharing = await peer.toggleScreenShare();
  $("shareBtn").textContent = isSharing ? "🛑 Stop Share" : "🖥️ Share Screen";
};

$("leaveBtn").onclick = () => {
  peer.hangUp();
  peer.stopLocalMedia();
  signaling.close();
  location.reload();
};

function broadcastMediaState(data) {
  for (const peerId of peer.getAllPeerIds()) {
    signaling.sendSignal(peerId, { type: "media-state", ...data });
  }
}

// ---------- Participant List & Host Controls ----------
function updateParticipant(id, name, role) {
  participants.set(id, { name, role });
  renderParticipants();
}

function removeParticipant(id) {
  participants.delete(id);
  renderParticipants();
}

function renderParticipants() {
  $("participantsList").innerHTML = "";
  $("userCount").textContent = participants.size;

  for (const [id, user] of participants.entries()) {
    const isMe = id === myId;
    const li = document.createElement("li");
    li.className = "participant-item";

    let actions = "";
    // শুধু Teacher (Host) অন্য ছাত্রদের Mute বা Kick করার বাটন দেখতে পাবে!
    if (myRole === "host" && !isMe) {
      actions = `
        <div>
          <button class="ctrl-btn" id="mute-user-${id}" title="Mute Student">🔇</button>
          <button class="ctrl-btn ctrl-kick" id="kick-user-${id}" title="Remove Student">🚫</button>
        </div>
      `;
    }

    li.innerHTML = `
      <span>👤 ${user.name} ${isMe ? "(You)" : ""} ${user.role === "host" ? "👑" : ""}</span>
      ${actions}
    `;
    $("participantsList").appendChild(li);

    if (myRole === "host" && !isMe) {
      $(`mute-user-${id}`).onclick = () => signaling.forceMuteUser(id);
      $(`kick-user-${id}`).onclick = () => signaling.kickUser(id);
    }
  }
}
