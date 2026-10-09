import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT || 3000;
const MAX_PEERS_PER_ROOM = 6;

const app = express();
app.use(express.static("public"));
const server = createServer(app);
const wss = new WebSocketServer({ server });

/** 
 * সক্রিয় রুমগুলোর স্টেট সংরক্ষণ:
 * Map<roomId, {
 *    hostId: string,
 *    peers: Map<clientId, { ws: WebSocket, name: string, isMuted: boolean }>,
 *    waiting: Map<clientId, { ws: WebSocket, name: string }>
 * }>
 */
const rooms = new Map();

// নির্দিষ্ট ক্লায়েন্টকে JSON মেসেজ পাঠানোর হেল্পার
function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// রুমের সবাইকে (প্রয়োজনে নির্দিষ্ট কাউকে বাদ দিয়ে) ব্রডকাস্ট করার হেল্পার
function broadcastToRoom(room, msg, excludeId = null) {
  for (const [peerId, peer] of room.peers.entries()) {
    if (peerId !== excludeId) send(peer.ws, msg);
  }
}

// WebSocket কানেকশন ও সিগন্যালিং হ্যান্ডলার
wss.on("connection", (ws) => {
  ws.id = randomUUID();
  ws.roomId = null;
  ws.userName = "Anonymous";

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      // ১. রুমে প্রবেশের অনুরোধ হ্যান্ডেল করা (হোস্ট সরাসরি ঢুকবে, অন্যরা ওয়েটিং রুমে যাবে)
      case "join": {
        const roomId = String(msg.roomId || "").trim();
        const userName = String(msg.userName || "Student").trim();
        if (!roomId) return;

        ws.userName = userName;
        ws.roomId = roomId;

        let room = rooms.get(roomId);
        if (!room) {
          room = {
            hostId: ws.id,
            peers: new Map(),
            waiting: new Map(),
          };
          rooms.set(roomId, room);
        }

        if (room.peers.size >= MAX_PEERS_PER_ROOM) {
          send(ws, { type: "room-full" });
          return;
        }

        if (room.hostId === ws.id) {
          room.peers.set(ws.id, { ws, name: userName, isMuted: false });
          send(ws, {
            type: "joined",
            yourId: ws.id,
            role: "host",
            peers: [],
          });
        } else {
          room.waiting.set(ws.id, { ws, name: userName });
          send(ws, { type: "waiting-in-lobby" });

          const hostPeer = room.peers.get(room.hostId);
          if (hostPeer) {
            send(hostPeer.ws, {
              type: "lobby-request",
              studentId: ws.id,
              studentName: userName,
            });
          }
        }
        break;
      }

      // ২. ওয়েটিং রুমের অনুরোধ অনুমোদন (Admit) বা প্রত্যাখ্যান (Reject)
      case "admit-response": {
        const room = rooms.get(ws.roomId);
        if (!room || room.hostId !== ws.id) return;

        const { studentId, approved } = msg;
        const waitingStudent = room.waiting.get(studentId);
        if (!waitingStudent) return;

        room.waiting.delete(studentId);

        if (approved) {
          const existingPeerList = [...room.peers.entries()].map(([id, p]) => ({
            id,
            name: p.name,
          }));

          send(waitingStudent.ws, {
            type: "joined",
            yourId: studentId,
            role: "student",
            peers: existingPeerList,
          });

          broadcastToRoom(room, {
            type: "peer-joined",
            peerId: studentId,
            name: waitingStudent.name,
          });

          room.peers.set(studentId, {
            ws: waitingStudent.ws,
            name: waitingStudent.name,
            isMuted: false,
          });
        } else {
          send(waitingStudent.ws, { type: "admit-rejected" });
        }
        break;
      }

      // ৩. WebRTC সিগন্যালিং মেসেজ (Offer, Answer, ICE Candidate) নির্দিষ্ট পিয়ারে ফরোয়ার্ড করা
      case "signal": {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        const target = room.peers.get(msg.to);
        if (target) send(target.ws, { type: "signal", from: ws.id, data: msg.data });
        break;
      }

      // ৪. হোস্ট অ্যাকশন: নির্দিষ্ট ইউজারকে রুম থেকে বের (Kick) করে দেওয়া
      case "kick-user": {
        const room = rooms.get(ws.roomId);
        if (!room || room.hostId !== ws.id) return;
        const targetPeer = room.peers.get(msg.targetId);
        if (targetPeer) {
          send(targetPeer.ws, { type: "kicked-by-host" });
          targetPeer.ws.close();
        }
        break;
      }

      // ৫. হোস্ট অ্যাকশন: নির্দিষ্ট ইউজারকে জোরপূর্বক মিউট (Force Mute) করা
      case "force-mute": {
        const room = rooms.get(ws.roomId);
        if (!room || room.hostId !== ws.id) return;
        const targetPeer = room.peers.get(msg.targetId);
        if (targetPeer) {
          send(targetPeer.ws, { type: "muted-by-host" });
        }
        break;
      }
    }
  });

  // ক্লায়েন্ট সংযোগ বিচ্ছিন্ন হলে রুম ক্লিনআপ ও হোস্ট মাইগ্রেশন
  ws.on("close", () => {
    const room = rooms.get(ws.roomId);
    if (!room) return;

    room.waiting.delete(ws.id);

    if (room.peers.has(ws.id)) {
      room.peers.delete(ws.id);
      broadcastToRoom(room, { type: "peer-left", peerId: ws.id });

      if (room.hostId === ws.id && room.peers.size > 0) {
        const nextHostId = room.peers.keys().next().value;
        room.hostId = nextHostId;
        const newHost = room.peers.get(nextHostId);
        send(newHost.ws, { type: "promoted-to-host" });
      }
    }

    if (room.peers.size === 0 && room.waiting.size === 0) {
      rooms.delete(ws.roomId);
    }
  });
});

// সার্ভার চালু করা
server.listen(PORT, () => {
  console.log(`LiveClass running → http://localhost:${PORT}`);
});
