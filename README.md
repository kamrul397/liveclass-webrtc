# 🎓 LiveClass

A lightweight, zero-dependency virtual classroom built with **pure native WebRTC** and **WebSockets**. No Agora, LiveKit, or paid third-party SDKs—just fast, clean, low-latency peer-to-peer audio/video streaming.

🚀 **Live Demo:** [https://liveclass-webrtc.onrender.com/](https://liveclass-webrtc.onrender.com/)

---

## ✨ Features

- 🎥 **Pure WebRTC (P2P)** — Direct browser-to-browser media streaming with Google STUN.
- 👥 **Multi-Peer Grid** — Dynamic auto-resizing video layout for groups.
- 🚪 **Waiting Room & Lobby** — First joiner becomes Host 👑; students wait for host admission.
- 🛡️ **Host Moderation** — Remote mute, kick participants, and role management.
- 🖥️ **Screen Sharing** — Fast mid-call track swapping via `replaceTrack`.
- 💬 **P2P Chat & Reactions** — Real-time in-call text chat & "Raise Hand" alerts.
- 🎨 **Shared Whiteboard** — Synchronized peer-to-peer canvas drawing.
- 📊 **Network Stats** — Real-time latency (RTT) & connection quality monitor.

---

## ⚡ Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/kamrul397/liveclass-webrtc.git
cd liveclass-webrtc
npm install
```

### 2. Run
```bash
npm run dev
```

Open **`http://localhost:3000`** across multiple browser tabs to test calling, lobby admission, and screen sharing.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (Native WebRTC APIs, Canvas, DataChannel)
- **Backend / Signaling:** Node.js, `ws` (WebSocket)

---

## 📝 License

Distributed under the [MIT License](LICENSE).
