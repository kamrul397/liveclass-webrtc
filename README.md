# 🎓 LiveClass — Native WebRTC Virtual Classroom & Video Conferencing

> A lightweight, zero-dependency client-side virtual classroom engineered with **Pure Native WebRTC** and **WebSocket signaling**. Built from the ground up to understand low-level P2P streaming, multi-peer mesh topologies, and real-time host moderation—without relying on third-party SDKs (LiveKit, Agora, Twilio).

[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-Native%20APIs-blue.svg)](https://webrtc.org/)
[![WebSocket](https://img.shields.io/badge/Signaling-WebSocket-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Key Features

### 📡 1. Native WebRTC Architecture
- **Pure Browser APIs**: Direct interaction with `RTCPeerConnection`, `RTCSessionDescription` (SDP), `RTCIceCandidate`, and `MediaStream`.
- **Trickle ICE & NAT Traversal**: Google STUN integration for public address resolution across different networks.
- **Glare-free Negotiation**: State-guarded signaling where existing peers initiate offers, eliminating race-condition conflicts.

### 👥 2. Multi-User Mesh Topology
- Dynamic multi-peer management using `Map<peerId, RTCPeerConnection>`.
- Responsive auto-layout video grid (Zoom/Meet style).
- Dynamic video container generation upon remote track delivery (`ontrack`).

### 🚪 3. Lobby & Waiting Room System
- **Teacher/Host Role**: The first participant in a room automatically receives the `Host` 👑 role.
- **Waiting Room**: Subsequent participants are placed in a secure lobby and must be manually admitted by the host.
- **Admit / Reject**: Host receives real-time desktop notifications to approve or deny entry.

### 🛡️ 4. Host Moderation Controls
- **Force Mute**: Teachers can remotely mute any student's microphone.
- **Kick / Remove**: Host can eject disruptive participants, immediately severing P2P connections and updating room states.
- **Server-side RBAC Guard**: Strict signaling validation preventing unauthorized role escalation.

### 🎛️ 5. Media Engine & Hardware Management
- **True Hardware Release**: Unlike superficial `track.enabled = false` toggling, stopping media invokes `track.stop()`, turning off device camera/mic hardware indicator LEDs.
- **Avatar Fallback Overlay**: Automatically shows user avatar and state badges when the video feed is suspended.
- **Hot-swappable Screen Sharing**: Live screen sharing utilizing `sender.replaceTrack()` for seamless mid-call track swapping without renegotiation overhead.

---

## 🏗️ Architecture & Signal Flow

```
   Peer A (Teacher)             Signaling Server (Node.js)             Peer B (Student)
          │                                  │                                  │
          ├─────── 1. WebSocket Connect ────►│◄────── 1. WebSocket Connect ─────┤
          │                                  │                                  │
          │                                  │◄────── 2. Join (Goes to Lobby) ──┤
          │◄────── 3. Lobby Notification ────┤                                  │
          ├─────── 4. Host Admits Student ──►│─────── 5. Admit Approval ───────►│
          │                                  │                                  │
          ├─────── 6. SDP Offer ────────────►│─────── 7. SDP Offer ────────────►│
          │◄────── 9. SDP Answer ────────────│◄────── 8. SDP Answer ────────────┤
          │◄══════ 10. Trickle ICE ═════════►│◄══════ 10. Trickle ICE ═════════►│
          │                                  │                                  │
          │◄════════════════════════ P2P Direct Media ═════════════════════════►│
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or later)
- Modern web browser (Chrome, Edge, Firefox, Safari)

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/liveclass-webrtc.git
   cd liveclass-webrtc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in two or more browser windows to test the multi-user lobby and calling flows.

---

## 🔮 Features Completed
- [x] Native 1-to-1 WebRTC calling (SDP offer/answer, ICE)
- [x] Multi-user mesh network with auto-layout dynamic grid
- [x] Waiting room / Lobby admission system
- [x] Host moderation (Force Mute, Kick user)
- [x] Screen sharing via `replaceTrack` without renegotiation
- [x] In-call P2P encrypted chat via `RTCDataChannel`
- [x] Real-time "Raise Hand" classroom question system
- [x] Interactive Collaborative Whiteboard with live P2P drawing sync
- [x] Network Quality Monitor measuring real-time RTT/latency via `pc.getStats()`
- [ ] Coturn (TURN) relay fallback setup
- [ ] Transition from Mesh to SFU (mediasoup / LiveKit) for 50+ participants

---

## 📝 License
Distributed under the MIT License.
