import { log, showState } from "./main.js";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let localStream = null;
let sendSignal = null;
let videosContainer = null;

/** প্রতিটি বন্ধুর জন্য আলাদা RTCPeerConnection: Map<peerId, RTCPeerConnection> */
const peers = new Map();
/** প্রতিটি বন্ধুর ডাটা চ্যানেল: Map<peerId, RTCDataChannel> */
const dataChannels = new Map();

let onDataChannelMessage = null;

let localVideoEl = null;
const videoSenders = new Map(); // peerId -> RTCRtpSender

let isAudioRunning = true;
let isVideoRunning = true;
let isScreenSharing = false;
let screenStream = null;

export async function init(options) {
  videosContainer = options.videosContainer;
  sendSignal = options.sendSignal;
  onDataChannelMessage = options.onDataChannelMessage;
  localVideoEl = options.localVideo;

  // ক্যামেরা এবং মাইক ক্যাপচার
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  localVideoEl.srcObject = localStream;
  const tracks = localStream.getTracks();
  log(`Captured ${tracks.length} tracks: ${tracks.map((t) => t.kind).join(", ")}`);
}

/** নির্দিষ্ট peerId-এর জন্য PeerConnection তৈরি বা রিটার্ন করা */
export function getOrCreatePeerConnection(peerId) {
  if (peers.has(peerId)) return peers.get(peerId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers.set(peerId, pc);
  log(`নতুন RTCPeerConnection তৈরি হলো peer ${peerId.slice(0, 6)}-এর জন্য ☎️`);

  // ১. ডাটা চ্যানেল হ্যান্ডলিং (আমরা যখন অফার পাঠাবো, আমরা চ্যানেল তৈরি করবো)
  try {
    const dc = pc.createDataChannel("liveclass-data");
    setupDataChannel(peerId, dc);
  } catch (e) {}

  // ২. অপর পাশ থেকে চ্যানেল এলে রিসিভ করা (Callee side)
  pc.ondatachannel = (event) => {
    log(`P2P DataChannel সংযোগ স্থাপিত হলো peer ${peerId.slice(0, 6)} থেকে 💬`);
    setupDataChannel(peerId, event.channel);
  };

  // নিজের অডিও ও ভিডিও ট্র্যাক যুক্ত করা এবং সেন্ডার রেফারেন্স সেভ রাখা
  if (localStream) {
    for (const track of localStream.getTracks()) {
      const sender = pc.addTrack(track, localStream);
      if (track.kind === "video") {
        videoSenders.set(peerId, sender);
      }
    }
  }

  // ICE Candidate পাওয়া গেলে অপর প্রান্তে পাঠানো
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(peerId, {
        type: "ice-candidate",
        candidate: event.candidate,
      });
    }
  };

  // অপর প্রান্ত থেকে ভিডিও বা অডিও আসলে ডাইনামিক বক্সে দেখানো
  pc.ontrack = (event) => {
    log(`স্ট্রিম এসেছে [${event.track.kind}] peer ${peerId.slice(0, 6)} থেকে 📺`);
    const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
    ensureRemoteVideoElement(peerId, stream, event.track);
  };

  pc.onconnectionstatechange = () => {
    log(`কানেকশন স্ট্যাটাস [${peerId.slice(0, 6)}]: ${pc.connectionState}`);
    showState("connection", pc.connectionState);
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
      removeRemoteVideoElement(peerId);
    }
  };

  return pc;
}

/** Caller flow: নির্দিষ্ট peerId-কে অফার পাঠানো */
export async function callPeer(peerId) {
  const pc = getOrCreatePeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendSignal(peerId, {
    type: "offer",
    sdp: offer.sdp,
  });
  log(`Offer পাঠানো হলো peer ${peerId.slice(0, 6)}-কে ✉️`);
}

/** Callee & ICE flow: সিগন্যাল রিসিভ করা */
export async function handleSignal(from, data) {
  const pc = getOrCreatePeerConnection(from);

  if (data.type === "offer") {
    log(`Offer এসেছে peer ${from.slice(0, 6)} থেকে 📬`);
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    sendSignal(from, {
      type: "answer",
      sdp: answer.sdp,
    });
    log(`Answer পাঠানো হলো peer ${from.slice(0, 6)}-কে ✉️`);
  } else if (data.type === "answer") {
    log(`Answer এসেছে peer ${from.slice(0, 6)} থেকে 🤝`);
    await pc.setRemoteDescription(new RTCSessionDescription(data));
  } else if (data.type === "ice-candidate" && data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error(err);
    }
  }
}

/** নির্দিষ্ট পিয়ারকে ক্লোজ ও রিমুভ করা */
export function removePeer(peerId) {
  const pc = peers.get(peerId);
  if (pc) {
    pc.close();
    peers.delete(peerId);
  }
  removeRemoteVideoElement(peerId);
}

/** ফুল হ্যাং আপ */
export function hangUp() {
  for (const [peerId, pc] of peers.entries()) {
    pc.close();
    removeRemoteVideoElement(peerId);
  }
  peers.clear();
  showState("connection", "closed");
}

export function stopLocalMedia() {
  if (localStream) {
    for (const track of localStream.getTracks()) track.stop();
    localStream = null;
  }
}

/** UI Helper: নতুন পিয়ারের জন্য ডাইনামিক ভিডিও বক্স যোগ করা */
function ensureRemoteVideoElement(peerId, stream, newTrack) {
  let box = document.getElementById(`box-${peerId}`);
  if (!box && videosContainer) {
    box = document.createElement("div");
    box.id = `box-${peerId}`;
    box.className = "video-card";
    box.innerHTML = `
      <video id="video-${peerId}" autoplay playsinline></video>
      <div id="ph-${peerId}" class="placeholder hidden">
        <div class="avatar-glow">👤</div>
        <span class="status-pill">Camera Off</span>
      </div>
      <div class="card-overlay">
        <span class="peer-name">${peerId.slice(0, 6)}</span>
        <div class="card-badges">
          <span id="badge-${peerId}" class="badge-icon">🎙️</span>
          <span id="hand-${peerId}" class="badge-icon hand-pulse hidden">✋</span>
          <span id="net-${peerId}" class="net-pill">📶 --</span>
        </div>
      </div>
    `;
    videosContainer.appendChild(box);
  }

  const videoEl = document.getElementById(`video-${peerId}`);
  if (videoEl) {
    if (!videoEl.srcObject) {
      videoEl.srcObject = stream;
    } else if (newTrack) {
      // যদি আগের স্ট্রিমে নতুন ট্র্যাক না থাকে, তবে যুক্ত করে দাও
      const existingStream = videoEl.srcObject;
      if (!existingStream.getTracks().find((t) => t.id === newTrack.id)) {
        existingStream.addTrack(newTrack);
      }
    }
    // অটোপ্লে নিশ্চিত করার জন্য
    videoEl.play().catch(() => { });
  }
}

function removeRemoteVideoElement(peerId) {
  const box = document.getElementById(`box-${peerId}`);
  if (box) box.remove();
}

// ---------------------------------------------------------------------
// Media Controls
// ---------------------------------------------------------------------

export async function toggleAudio() {
  const audioTrack = localStream?.getAudioTracks()[0];
  if (!audioTrack && isAudioRunning) return false;

  if (isAudioRunning) {
    audioTrack.stop();
    for (const pc of peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) await sender.replaceTrack(null);
    }
    isAudioRunning = false;
    log("মাইক্রোফোন হার্ডওয়্যার অফ 🛑");
    return false;
  } else {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newAudioTrack = newStream.getAudioTracks()[0];
      localStream.addTrack(newAudioTrack);

      for (const pc of peers.values()) {
        const sender = pc.getSenders().find((s) => s.track === null || s.track?.kind === "audio");
        if (sender) await sender.replaceTrack(newAudioTrack);
      }
      isAudioRunning = true;
      log("মাইক্রোফোন হার্ডওয়্যার অন 🎙️");
      return true;
    } catch (err) {
      return false;
    }
  }
}

export async function toggleVideo() {
  if (isVideoRunning) {
    // 🛑 ১. ক্যামেরা বন্ধ করা (Hardware release)
    const videoTrack = localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.stop();
      localStream.removeTrack(videoTrack);
    }

    // সব পিয়ারের সেন্ডারকে null করে দেওয়া
    for (const [peerId, pc] of peers.entries()) {
      const sender = videoSenders.get(peerId) || pc.getSenders().find((s) => s.track === null || s.track?.kind === "video");
      if (sender) await sender.replaceTrack(null);
    }

    if (localVideoEl) localVideoEl.srcObject = null;
    isVideoRunning = false;
    log("ক্যামেরা হার্ডওয়্যার অফ 🛑");
    return false;
  } else {
    // 📷 ২. নতুন করে ক্যামেরা চালু করা
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (localStream) {
        localStream.addTrack(newVideoTrack);
      } else {
        localStream = newStream;
      }

      // লোকাল প্রিভিউ রি-অ্যাটাচ ও প্লে করা
      if (localVideoEl) {
        localVideoEl.srcObject = new MediaStream([newVideoTrack]);
        localVideoEl.play().catch(() => {});
      }

      // প্রতিটি পিয়ারের ভিডিও লাইনে নতুন ট্র্যাক প্লাগ-ইন করা
      for (const [peerId, pc] of peers.entries()) {
        const sender = videoSenders.get(peerId) || pc.getSenders().find((s) => s.track === null || s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }

      isVideoRunning = true;
      log("ক্যামেরা হার্ডওয়্যার অন 📷");
      return true;
    } catch (err) {
      log(`ক্যামেরা চালু করতে ব্যর্থ: ${err.message}`, "err");
      return false;
    }
  }
}

export async function toggleScreenShare() {
  if (isScreenSharing) {
    await revertToCamera();
    return false;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    screenTrack.onended = () => revertToCamera();

    for (const pc of peers.values()) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(screenTrack);
    }

    const localVid = document.getElementById("localVideo");
    if (localVid) localVid.srcObject = screenStream;

    isScreenSharing = true;
    log("স্ক্রিন শেয়ার চালু হলো 🖥️");
    return true;
  } catch (err) {
    return false;
  }
}

async function revertToCamera() {
  if (screenStream) {
    for (const t of screenStream.getTracks()) t.stop();
    screenStream = null;
  }

  const cameraTrack = localStream?.getVideoTracks()[0];
  for (const pc of peers.values()) {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
    if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
  }

  const localVid = document.getElementById("localVideo");
  if (localVid && localStream) localVid.srcObject = localStream;
  isScreenSharing = false;
  log("আবার ক্যামেরা ভিডিওতে ফিরে আসা হলো 📷");
}

export function getAllPeerIds() {
  return [...peers.keys()];
}

// ---------------------------------------------------------------------
// RTCDataChannel Management (P2P Chat & Real-Time Sync)
// ---------------------------------------------------------------------

function setupDataChannel(peerId, dc) {
  dataChannels.set(peerId, dc);

  dc.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onDataChannelMessage?.(peerId, data);
    } catch (err) {
      console.error(err);
    }
  };

  dc.onclose = () => {
    dataChannels.delete(peerId);
  };
}

/** ক্লাসের সব বন্ধুদের কাছে ডাটা চ্যানেলে মেসেজ পাঠানো (P2P Broadcast) */
export function broadcastDataMessage(data) {
  const json = JSON.stringify(data);
  for (const [peerId, dc] of dataChannels.entries()) {
    if (dc.readyState === "open") {
      dc.send(json);
    }
  }
}

// ---------------------------------------------------------------------
// Network Quality Monitor via pc.getStats()
// ---------------------------------------------------------------------

let statsInterval = null;

export function startStatsMonitor() {
  if (statsInterval) return;

  statsInterval = setInterval(async () => {
    for (const [peerId, pc] of peers.entries()) {
      if (pc.connectionState !== "connected") continue;

      try {
        const stats = await pc.getStats();
        let rtt = null;

        stats.forEach((report) => {
          // ক্যান্ডিডেট পেয়ার থেকে RTT (Round Trip Time / Latency) বের করা
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.currentRoundTripTime) {
            rtt = Math.round(report.currentRoundTripTime * 1000); // মিলি-সেকেন্ডে রূপান্তর
          }
        });

        const badge = document.getElementById(`net-${peerId}`);
        if (badge && rtt !== null) {
          badge.textContent = `📶 ${rtt}ms`;
          badge.className = "net-pill";
          if (rtt > 150) badge.classList.add("bad");
          else if (rtt > 80) badge.classList.add("warn");
        }
      } catch (err) {}
    }
  }, 2000);
}

export function stopStatsMonitor() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}


