// Signaling ADAPTER (Multi-User & Lobby Support)

export function createSignaling({
  onJoined,
  onPeerJoined,
  onPeerLeft,
  onSignal,
  onRoomFull,
  onWaitingInLobby,
  onLobbyRequest,
  onAdmitRejected,
  onKicked,
  onForceMuted,
  log,
}) {
  let ws;

  function connect() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${location.host}`);
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        log?.(`⬇ ${msg.type}${msg.data ? " / " + msg.data.type : ""}`, "recv");

        switch (msg.type) {
          case "joined":           return onJoined?.(msg);
          case "peer-joined":      return onPeerJoined?.(msg);
          case "peer-left":        return onPeerLeft?.(msg);
          case "signal":           return onSignal?.(msg);
          case "room-full":        return onRoomFull?.();
          case "waiting-in-lobby": return onWaitingInLobby?.();
          case "lobby-request":    return onLobbyRequest?.(msg);
          case "admit-rejected":   return onAdmitRejected?.();
          case "kicked-by-host":   return onKicked?.();
          case "muted-by-host":    return onForceMuted?.();
        }
      };
    });
  }

  function join(roomId, userName) {
    ws.send(JSON.stringify({ type: "join", roomId, userName }));
  }

  function sendSignal(to, data) {
    log?.(`⬆ signal / ${data.type}`, "send");
    ws.send(JSON.stringify({ type: "signal", to, data }));
  }

  function respondToLobby(studentId, approved) {
    ws.send(JSON.stringify({ type: "admit-response", studentId, approved }));
  }

  function kickUser(targetId) {
    ws.send(JSON.stringify({ type: "kick-user", targetId }));
  }

  function forceMuteUser(targetId) {
    ws.send(JSON.stringify({ type: "force-mute", targetId }));
  }

  function close() {
    ws?.close();
  }

  return { connect, join, sendSignal, respondToLobby, kickUser, forceMuteUser, close };
}
