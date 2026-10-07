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

// 🔗 URL থেকে রুম ও নামের প্যারামিটার রিড করা (যেমন: ?room=physics202&name=Rahim)
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get("room");
const nameParam = urlParams.get("name");

if (nameParam) {
  $("nameInput").value = nameParam;
}

if (roomParam) {
  $("roomInput").value = roomParam;
  log(`ইনভাইট লিঙ্ক থেকে রুম লোড হয়েছে: ${roomParam} 🔗`);
}

// 🔗 ইনভাইট লিঙ্ক ক্লিপবোর্ডে কপি করার ফাংশন
async function copyRoomLink(btn) {
  const room = $("roomInput").value.trim() || "math101";
  const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(room)}`;

  try {
    await navigator.clipboard.writeText(inviteUrl);
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Copied!</span>`;
    log(`রুম লিঙ্ক কপি হয়েছে: ${inviteUrl} 📋`);

    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 2000);
  } catch (err) {
    prompt("Copy this invite link manually:", inviteUrl);
  }
}

$("copyLinkBtn").onclick = () => copyRoomLink($("copyLinkBtn"));
if ($("dockShareBtn")) {
  $("dockShareBtn").onclick = () => copyRoomLink($("dockShareBtn"));
}

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
      const vid = document.getElementById(`video-${from}`);
      if (ph && typeof data.isVideoOn === "boolean") {
        ph.classList.toggle("hidden", data.isVideoOn);
        if (data.isVideoOn && vid) vid.play().catch(() => {});
      }
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

let isHandRaised = false;

async function joinRoom() {
  const roomId = $("roomInput").value.trim();
  const userName = $("nameInput").value.trim() || "Student";
  if (!roomId) return alert("Enter a room name");

  try {
    await peer.init({
      localVideo: $("localVideo"),
      videosContainer: $("videosGrid"),
      sendSignal: signaling.sendSignal,
      // পিয়ার থেকে ডাটা চ্যানেলে মেসেজ আসলে এখানে হ্যান্ডেল হবে
      onDataChannelMessage: (fromPeerId, data) => {
        if (data.type === "chat") {
          appendChatMessage(data.sender, data.text, false);
        } else if (data.type === "raise-hand") {
          const handBadge = document.getElementById(`hand-${fromPeerId}`);
          if (handBadge) handBadge.classList.toggle("hidden", !data.isRaised);
          if (data.isRaised) log(`✋ ${data.sender} হাত তুলেছে! (Question)`);
        } else if (data.type === "draw") {
          // অপর প্রান্ত থেকে ড্রয়িং ডাটা আসলে ক্যানভাসে আঁকা
          drawOnCanvas(data.x0, data.y0, data.x1, data.y1, data.color, data.width, false);
        } else if (data.type === "clear-whiteboard") {
          clearCanvas(false);
        } else if (data.type === "restore-whiteboard") {
          restoreState(data.dataUrl);
        }
      },
    });

    await signaling.connect();
    signaling.join(roomId, userName);

    // নেটওয়ার্ক কোয়ালিটি মনিটর শুরু
    peer.startStatsMonitor();

    $("joinBtn").disabled = true;
    $("leaveBtn").disabled = false;
    $("micBtn").disabled = false;
    $("camBtn").disabled = false;
    $("shareBtn").disabled = false;
    $("boardBtn").disabled = false;
    $("handBtn").disabled = false;
  } catch (err) {
    log(`Error: ${err.message}`, "err");
  }
}

$("joinBtn").onclick = joinRoom;

// 🔗 যদি ইউজার ইনভাইট লিঙ্ক দিয়ে আসে (?room=xyz), সরাসরি জয়েন হয়ে লবিতে ঢুকবে!
if (roomParam) {
  log("ইনভাইট লিঙ্ক দিয়ে জয়েন করা হচ্ছে... অটো-কানেক্টিং 🚀");
  // ব্রাউজার যাতে পেজ রেন্ডার হওয়ার সাথে সাথে পারমিশন চাইতে পারে
  setTimeout(() => {
    joinRoom();
  }, 300);
}

// ✋ Raise Hand Toggle
$("handBtn").onclick = () => {
  isHandRaised = !isHandRaised;
  $("handBtn").innerHTML = isHandRaised 
    ? `<i class="fa-solid fa-hand"></i><span>Raised</span>` 
    : `<i class="fa-solid fa-hand"></i><span>Hand</span>`;
  $("handBtn").classList.toggle("active-off", isHandRaised);
  $("localHandBadge").classList.toggle("hidden", !isHandRaised);

  // ক্লাসের সবার কাছে P2P DataChannel-এ হাত তোলার মেসেজ পাঠাই
  peer.broadcastDataMessage({
    type: "raise-hand",
    sender: $("nameInput").value.trim() || "Student",
    isRaised: isHandRaised,
  });
  log(isHandRaised ? "আপনি ক্লাসে হাত তুলেছেন ✋" : "হাত নামিয়েছেন");
};

// 📱 Mobile Sidebar Drawer Toggle
$("sidebarToggleBtn").onclick = () => {
  $("callSidebar").classList.toggle("open");
};

// 💬 Tab Switching (Participants vs Chat)
$("tabParticipants").onclick = () => {
  $("tabParticipants").classList.add("active");
  $("tabChat").classList.remove("active");
  $("participantsPanel").classList.remove("hidden");
  $("chatPanel").classList.add("hidden");
};

$("tabChat").onclick = () => {
  $("tabChat").classList.add("active");
  $("tabParticipants").classList.remove("active");
  $("chatPanel").classList.remove("hidden");
  $("participantsPanel").classList.add("hidden");
  $("chatInput").focus();
};

// 💬 Chat Form Submit (Send P2P Message)
$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;

  const senderName = $("nameInput").value.trim() || "User";

  // ১. সরাসরি ক্লাসের সবার কাছে DataChannel-এ পাঠিয়ে দেওয়া (No Server!)
  peer.broadcastDataMessage({
    type: "chat",
    sender: senderName,
    text,
  });

  // ২. নিজের চ্যাট বক্সে মেসেজ দেখানো
  appendChatMessage("You", text, true);
  $("chatInput").value = "";
};

function appendChatMessage(sender, text, isMine) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${isMine ? "mine" : ""}`;
  bubble.innerHTML = `
    <div class="sender">${sender}</div>
    <div class="text">${escapeHtml(text)}</div>
  `;
  $("chatMessages").appendChild(bubble);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// ---------------------------------------------------------------------
// 🎨 Collaborative Whiteboard Logic (Pen, Eraser, Undo, Redo)
// ---------------------------------------------------------------------

const canvas = $("wbCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentTool = "pen"; // "pen" or "eraser"

// হিস্ট্রি স্ট্যাক (Undo / Redo এর জন্য)
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 20;

function saveState() {
  if (!ctx || !canvas) return;
  if (undoStack.length >= MAX_HISTORY) undoStack.shift();
  undoStack.push(canvas.toDataURL());
  redoStack.length = 0; // নতুন ড্র করলে রিডু স্ট্যাক খালি হয়
}

function restoreState(dataUrl) {
  if (!ctx || !canvas) return;
  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
}

function resizeCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  if (container && container.clientWidth > 0) {
    const temp = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (temp && ctx) ctx.putImageData(temp, 0, 0);
    else saveState(); // প্রাথমিক ফাঁকা স্টেট সেভ
  }
}

// 🖊️ টুল সিলেকশন: Pen বনাম Eraser
$("wbPenBtn").onclick = () => {
  currentTool = "pen";
  $("wbPenBtn").classList.add("active");
  $("wbEraserBtn").classList.remove("active");
};

$("wbEraserBtn").onclick = () => {
  currentTool = "eraser";
  $("wbEraserBtn").classList.add("active");
  $("wbPenBtn").classList.remove("active");
};

// ↩️ Undo
$("wbUndoBtn").onclick = () => {
  if (undoStack.length > 1) {
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    restoreState(prev);

    // সবার স্ক্রিনে Undo সিঙ্ক করা
    peer.broadcastDataMessage({ type: "restore-whiteboard", dataUrl: prev });
  }
};

// ↪️ Redo
$("wbRedoBtn").onclick = () => {
  if (redoStack.length > 0) {
    const next = redoStack.pop();
    undoStack.push(next);
    restoreState(next);

    // সবার স্ক্রিনে Redo সিঙ্ক করা
    peer.broadcastDataMessage({ type: "restore-whiteboard", dataUrl: next });
  }
};

$("boardBtn").onclick = () => {
  const isHidden = $("whiteboardSection").classList.toggle("hidden");
  $("boardBtn").innerHTML = isHidden 
    ? `<i class="fa-solid fa-chalkboard"></i><span>Board</span>` 
    : `<i class="fa-solid fa-xmark"></i><span>Hide</span>`;
  $("boardBtn").classList.toggle("active-off", !isHidden);
  if (!isHidden) {
    setTimeout(resizeCanvas, 50);
  }
};

$("wbCloseBtn").onclick = () => {
  $("whiteboardSection").classList.add("hidden");
  $("boardBtn").innerHTML = `<i class="fa-solid fa-chalkboard"></i><span>Board</span>`;
  $("boardBtn").classList.remove("active-off");
};

$("wbClearBtn").onclick = () => {
  clearCanvas(true);
};

window.addEventListener("resize", () => {
  if (!$("whiteboardSection").classList.contains("hidden")) {
    resizeCanvas();
  }
});

function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

if (canvas) {
  // মাউস ইভেন্ট (পিসি)
  canvas.addEventListener("mousedown", (e) => {
    isDrawing = true;
    const coords = getCanvasCoordinates(e);
    lastX = coords.x;
    lastY = coords.y;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing) return;
    const coords = getCanvasCoordinates(e);
    const color = currentTool === "eraser" ? "#030712" : $("wbColor").value;
    const width = currentTool === "eraser" ? 24 : 3;

    drawOnCanvas(lastX, lastY, coords.x, coords.y, color, width, true);

    lastX = coords.x;
    lastY = coords.y;
  });

  window.addEventListener("mouseup", () => {
    if (isDrawing) {
      isDrawing = false;
      saveState();
    }
  });

  // টাচ ইভেন্ট (মোবাইল)
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    isDrawing = true;
    const coords = getCanvasCoordinates(e);
    lastX = coords.x;
    lastY = coords.y;
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const coords = getCanvasCoordinates(e);
    const color = currentTool === "eraser" ? "#030712" : $("wbColor").value;
    const width = currentTool === "eraser" ? 24 : 3;

    drawOnCanvas(lastX, lastY, coords.x, coords.y, color, width, true);

    lastX = coords.x;
    lastY = coords.y;
  }, { passive: false });

  window.addEventListener("touchend", () => {
    if (isDrawing) {
      isDrawing = false;
      saveState();
    }
  });
}

function drawOnCanvas(x0, y0, x1, y1, color, width, shouldBroadcast) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  if (shouldBroadcast) {
    peer.broadcastDataMessage({
      type: "draw",
      x0, y0, x1, y1, color, width,
    });
  }
}

function clearCanvas(shouldBroadcast) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  saveState();
  if (shouldBroadcast) {
    peer.broadcastDataMessage({ type: "clear-whiteboard" });
    log("হোয়াইটবোর্ড ক্লিয়ার করা হয়েছে 🧹");
  }
}


$("micBtn").onclick = async () => {
  const isUnmuted = await peer.toggleAudio();
  $("micBtn").innerHTML = isUnmuted 
    ? `<i class="fa-solid fa-microphone"></i><span>Mic</span>` 
    : `<i class="fa-solid fa-microphone-slash"></i><span>Muted</span>`;
  $("micBtn").classList.toggle("active-off", !isUnmuted);
  $("localAudioBadge").textContent = isUnmuted ? "🎙️" : "🔇";
  broadcastMediaState({ isAudioOn: isUnmuted });
};

$("camBtn").onclick = async () => {
  const isVideoOn = await peer.toggleVideo();
  $("camBtn").innerHTML = isVideoOn 
    ? `<i class="fa-solid fa-video"></i><span>Cam</span>` 
    : `<i class="fa-solid fa-video-slash"></i><span>Off</span>`;
  $("camBtn").classList.toggle("active-off", !isVideoOn);
  $("localPlaceholder").classList.toggle("hidden", isVideoOn);
  broadcastMediaState({ isVideoOn });
};

$("shareBtn").onclick = async () => {
  const isSharing = await peer.toggleScreenShare();
  $("shareBtn").innerHTML = isSharing 
    ? `<i class="fa-solid fa-stop"></i><span>Stop</span>` 
    : `<i class="fa-solid fa-display"></i><span>Share</span>`;
  $("shareBtn").classList.toggle("active-off", isSharing);
};

$("leaveBtn").onclick = () => {
  peer.stopStatsMonitor();
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
    li.className = "user-item";

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
