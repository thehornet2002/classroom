const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Default layout configurations (Adobe Connect style)
const DEFAULT_LAYOUTS = {
  sharing: {
    id: "sharing",
    name: "Sharing",
    pods: [
      { id: "share-1", type: "share", title: "Share Pod", x: 0, y: 0, w: 70, h: 100 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 70, y: 0, w: 30, h: 50 },
      { id: "chat-1", type: "chat", title: "Chat", x: 70, y: 50, w: 30, h: 50 },
    ],
  },
  discussion: {
    id: "discussion",
    name: "Discussion",
    pods: [
      { id: "share-1", type: "share", title: "Video & Discussion", x: 0, y: 0, w: 60, h: 60 },
      { id: "chat-1", type: "chat", title: "Discussion Chat", x: 0, y: 60, w: 60, h: 40 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 60, y: 0, w: 40, h: 50 },
      { id: "notes-1", type: "notes", title: "Discussion Notes", x: 60, y: 50, w: 40, h: 50 },
    ],
  },
  collaboration: {
    id: "collaboration",
    name: "Collaboration",
    pods: [
      { id: "share-1", type: "share", title: "Whiteboard", x: 0, y: 0, w: 65, h: 100 },
      { id: "notes-1", type: "notes", title: "Shared Notes", x: 65, y: 0, w: 35, h: 35 },
      { id: "poll-1", type: "poll", title: "Poll", x: 65, y: 35, w: 35, h: 35 },
      { id: "chat-1", type: "chat", title: "Chat", x: 65, y: 70, w: 35, h: 30 },
    ],
  },
};

function getDefaultPermissions(role) {
  const isPrivileged = role === "host" || role === "presenter";
  return {
    canAudio: isPrivileged,
    canVideo: isPrivileged,
    canScreen: isPrivileged,
    canDraw: isPrivileged,
    canChat: true,
    canShareDoc: isPrivileged,
  };
}

// In-Memory Room Coordinator
class Room {
  constructor(id, name = "ClassroomFlare Room") {
    this.roomId = id;
    this.roomName = name;
    this.hostPass = null;
    this.activeLayoutId = "sharing";
    this.currentLayout = JSON.parse(JSON.stringify(DEFAULT_LAYOUTS.sharing));
    this.users = {};
    this.shareMode = "screen";
    this.whiteboardPage = 1;
    this.whiteboardStrokes = [];
    this.documentState = null;
    this.polls = {};
    this.activePollId = null;
    this.notesContent = "Welcome to ClassroomFlare on Chabokan!\nFeel free to write notes here.";
    this.notesVersion = 1;
    this.breakoutsActive = false;
    this.breakoutRooms = [];

    this.peers = new Map(); // userId -> { ws, user }
  }

  getState() {
    return {
      roomId: this.roomId,
      roomName: this.roomName,
      activeLayoutId: this.activeLayoutId,
      currentLayout: this.currentLayout,
      users: this.users,
      shareMode: this.shareMode,
      whiteboardPage: this.whiteboardPage,
      whiteboardStrokes: this.whiteboardStrokes,
      documentState: this.documentState,
      polls: this.polls,
      activePollId: this.activePollId,
      notesContent: this.notesContent,
      notesVersion: this.notesVersion,
      breakoutsActive: this.breakoutsActive,
      breakoutRooms: this.breakoutRooms,
    };
  }

  sendTo(ws, msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch (e) {}
    }
  }

  broadcast(msg, excludeId = null) {
    const raw = JSON.stringify(msg);
    for (const [id, peer] of this.peers.entries()) {
      if (excludeId && id === excludeId) continue;
      if (!peer.user.admitted) continue;
      if (peer.ws.readyState === WebSocket.OPEN) {
        try {
          peer.ws.send(raw);
        } catch (e) {}
      }
    }
  }

  broadcastToRoles(roles, msg) {
    const raw = JSON.stringify(msg);
    for (const peer of this.peers.values()) {
      if (roles.includes(peer.user.role) && peer.ws.readyState === WebSocket.OPEN) {
        try {
          peer.ws.send(raw);
        } catch (e) {}
      }
    }
  }

  handlePeerJoin(ws, userId, name, requestedRole, pass) {
    const hasExistingUsers = Object.keys(this.users).length > 0;
    let finalRole = requestedRole;

    if (requestedRole === "host") {
      if (hasExistingUsers) {
        if (!this.hostPass || this.hostPass !== pass) {
          finalRole = "participant";
        }
      } else if (pass) {
        this.hostPass = pass;
      }
    }

    const isHost = finalRole === "host";
    const user = {
      id: userId,
      name,
      role: finalRole,
      status: "none",
      permissions: getDefaultPermissions(finalRole),
      joinedAt: Date.now(),
      admitted: isHost || !hasExistingUsers,
    };

    if (!hasExistingUsers) {
      user.role = "host";
      user.permissions = getDefaultPermissions("host");
      user.admitted = true;
    }

    this.peers.set(userId, { ws, user });
    this.users[userId] = user;

    if (!user.admitted) {
      this.sendTo(ws, {
        type: "ADMISSION_REQUIRED",
        message: "Please wait for the Host to admit you to the room.",
      });
      this.broadcastToRoles(["host"], { type: "USER_JOINED", user });
    } else {
      this.sendTo(ws, { type: "ROOM_STATE", state: this.getState() });
      this.broadcast({ type: "USER_JOINED", user }, userId);
    }

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.processMessage(userId, msg);
      } catch (e) {}
    });

    const cleanup = () => {
      this.peers.delete(userId);
      delete this.users[userId];
      this.broadcast({ type: "USER_LEFT", userId });
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  }

  processMessage(senderId, msg) {
    const sender = this.peers.get(senderId);
    if (!sender) return;

    switch (msg.type) {
      case "PING":
        this.sendTo(sender.ws, { type: "PONG" });
        break;

      case "ADMISSION_DECISION": {
        if (sender.user.role !== "host") return;
        const target = this.peers.get(msg.targetId);
        if (target && this.users[msg.targetId]) {
          if (msg.approved) {
            target.user.admitted = true;
            this.users[msg.targetId].admitted = true;
            this.sendTo(target.ws, { type: "ROOM_STATE", state: this.getState() });
            this.broadcast({ type: "USER_JOINED", user: target.user }, msg.targetId);
          } else {
            this.sendTo(target.ws, {
              type: "KICK_USER",
              targetId: msg.targetId,
              reason: "Host denied admission to the room.",
            });
            target.ws.close(4001, "Admission denied");
            this.peers.delete(msg.targetId);
            delete this.users[msg.targetId];
          }
        }
        break;
      }

      case "KICK_USER": {
        if (sender.user.role !== "host") return;
        const target = this.peers.get(msg.targetId);
        if (target) {
          this.sendTo(target.ws, {
            type: "KICK_USER",
            targetId: msg.targetId,
            reason: msg.reason || "Removed by host.",
          });
          target.ws.close(4002, "Kicked");
          this.peers.delete(msg.targetId);
          delete this.users[msg.targetId];
          this.broadcast({ type: "USER_LEFT", userId: msg.targetId });
        }
        break;
      }

      case "STATUS_CHANGE": {
        const targetUserId =
          sender.user.role === "host" && msg.targetId ? msg.targetId : senderId;
        const targetPeer = this.peers.get(targetUserId);
        if (targetPeer && this.users[targetUserId]) {
          targetPeer.user.status = msg.status;
          this.users[targetUserId].status = msg.status;
          this.broadcast({ type: "USER_UPDATED", user: targetPeer.user });
        }
        break;
      }

      case "SET_ROLE": {
        if (sender.user.role !== "host") return;
        const target = this.peers.get(msg.targetId);
        if (target && this.users[msg.targetId]) {
          target.user.role = msg.role;
          target.user.permissions = getDefaultPermissions(msg.role);
          this.users[msg.targetId] = target.user;
          this.broadcast({ type: "USER_UPDATED", user: target.user });
        }
        break;
      }

      case "SET_PERMISSIONS": {
        if (sender.user.role !== "host") return;
        const target = this.peers.get(msg.targetId);
        if (target && this.users[msg.targetId]) {
          target.user.permissions = {
            ...target.user.permissions,
            ...msg.permissions,
          };
          this.users[msg.targetId] = target.user;
          this.broadcast({ type: "USER_UPDATED", user: target.user });
        }
        break;
      }

      case "SWITCH_LAYOUT": {
        if (sender.user.role !== "host" && sender.user.role !== "presenter") return;
        const preset = DEFAULT_LAYOUTS[msg.layoutId];
        if (preset) {
          this.activeLayoutId = msg.layoutId;
          this.currentLayout = JSON.parse(JSON.stringify(preset));
          this.broadcast({ type: "UPDATE_LAYOUT", layout: this.currentLayout });
        }
        break;
      }

      case "UPDATE_LAYOUT": {
        if (sender.user.role !== "host") return;
        this.currentLayout = msg.layout;
        this.broadcast({ type: "UPDATE_LAYOUT", layout: this.currentLayout });
        break;
      }

      case "UPDATE_POD": {
        if (sender.user.role !== "host") return;
        const pods = this.currentLayout.pods;
        const idx = pods.findIndex((p) => p.id === msg.pod.id);
        if (idx !== -1) pods[idx] = msg.pod;
        else pods.push(msg.pod);
        this.broadcast({ type: "UPDATE_LAYOUT", layout: this.currentLayout });
        break;
      }

      case "CHAT_MESSAGE": {
        if (!sender.user.permissions.canChat) return;
        const verifiedMsg = {
          type: "CHAT_MESSAGE",
          id: msg.id || `${Date.now()}-${Math.random()}`,
          channel: msg.channel,
          senderId: sender.user.id,
          senderName: sender.user.name,
          senderRole: sender.user.role,
          text: msg.text,
          timestamp: Date.now(),
        };

        if (msg.channel === "everyone") {
          this.broadcast(verifiedMsg);
        } else if (msg.channel === "hosts") {
          this.broadcastToRoles(["host", "presenter"], verifiedMsg);
        } else {
          const target = this.peers.get(msg.channel);
          if (target) {
            this.sendTo(target.ws, verifiedMsg);
            this.sendTo(sender.ws, verifiedMsg);
          }
        }
        break;
      }

      case "SET_SHARE_MODE": {
        if (!sender.user.permissions.canScreen && sender.user.role === "participant") return;
        this.shareMode = msg.mode;
        this.broadcast(msg);
        break;
      }

      case "WHITEBOARD_STROKE": {
        if (!sender.user.permissions.canDraw) return;
        this.whiteboardStrokes.push(msg.stroke);
        this.broadcast(msg, senderId);
        break;
      }

      case "WHITEBOARD_CLEAR": {
        if (!sender.user.permissions.canDraw) return;
        this.whiteboardStrokes = this.whiteboardStrokes.filter((s) => s.pageId !== msg.pageId);
        this.broadcast(msg);
        break;
      }

      case "WHITEBOARD_PAGE_CHANGE": {
        if (sender.user.role === "participant") return;
        this.whiteboardPage = msg.pageId;
        this.broadcast(msg);
        break;
      }

      case "DOC_CHANGE": {
        if (!sender.user.permissions.canShareDoc) return;
        this.documentState = msg.docState;
        this.broadcast(msg);
        break;
      }

      case "DOC_PAGE_CHANGE": {
        if (!sender.user.permissions.canShareDoc) return;
        if (this.documentState) {
          this.documentState.currentPage = msg.page;
          if (msg.zoom) this.documentState.zoom = msg.zoom;
        }
        this.broadcast(msg);
        break;
      }

      case "POLL_CREATE": {
        if (sender.user.role === "participant") return;
        this.polls[msg.poll.id] = msg.poll;
        this.activePollId = msg.poll.id;
        this.broadcast(msg);
        break;
      }

      case "POLL_VOTE": {
        const poll = this.polls[msg.pollId];
        if (!poll || !poll.isOpen) return;

        if (poll.type === "text" && msg.textAnswer) {
          if (!poll.textAnswers) poll.textAnswers = [];
          poll.textAnswers = poll.textAnswers.filter((a) => a.userId !== senderId);
          poll.textAnswers.push({
            userId: senderId,
            userName: sender.user.name,
            answer: msg.textAnswer,
          });
        } else if (msg.optionIds) {
          for (const opt of poll.options) {
            opt.votes = opt.votes.filter((u) => u !== senderId);
            if (msg.optionIds.includes(opt.id)) {
              opt.votes.push(senderId);
            }
          }
        }

        if (poll.broadcastResults) {
          this.broadcast({ type: "POLL_CREATE", poll });
        } else {
          this.broadcastToRoles(["host", "presenter"], { type: "POLL_CREATE", poll });
        }
        break;
      }

      case "POLL_STATUS": {
        if (sender.user.role === "participant") return;
        const poll = this.polls[msg.pollId];
        if (poll) {
          poll.isOpen = msg.isOpen;
          poll.broadcastResults = msg.broadcastResults;
          this.broadcast({ type: "POLL_CREATE", poll });
        }
        break;
      }

      case "POLL_REMOVE": {
        if (sender.user.role === "participant") return;
        delete this.polls[msg.pollId];
        if (this.activePollId === msg.pollId) this.activePollId = null;
        this.broadcast(msg);
        break;
      }

      case "NOTE_UPDATE": {
        this.notesContent = msg.content;
        this.notesVersion = msg.version;
        this.broadcast(msg, senderId);
        break;
      }

      case "BREAKOUT_START": {
        if (sender.user.role !== "host") return;
        this.breakoutsActive = true;
        this.breakoutRooms = msg.rooms;
        this.broadcast(msg);
        break;
      }

      case "BREAKOUT_BROADCAST": {
        if (sender.user.role !== "host") return;
        this.broadcast(msg);
        break;
      }

      case "BREAKOUT_END": {
        if (sender.user.role !== "host") return;
        this.breakoutsActive = false;
        this.breakoutRooms = [];
        this.broadcast(msg);
        break;
      }

      case "SIGNAL_OFFER":
      case "SIGNAL_ANSWER":
      case "SIGNAL_ICE": {
        const target = this.peers.get(msg.targetId);
        if (target) {
          this.sendTo(target.ws, msg);
        }
        break;
      }
    }
  }
}

const rooms = new Map();

function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId);
    rooms.set(roomId, room);
  }
  return room;
}

// HTTP Server
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "classroomflare-chabokan", rooms: rooms.size }));
    return;
  }

  // Serve static frontend files if present
  let filePath = path.join(PUBLIC_DIR, parsedUrl.pathname === "/" ? "index.html" : parsedUrl.pathname);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>ClassroomFlare Node Backend is Running</h1><p>Connect via WebSocket at /ws</p>");
  }
});

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const roomId = parsedUrl.searchParams.get("roomId") || "main";
      const userId = parsedUrl.searchParams.get("userId") || `${Date.now()}-${Math.random()}`;
      const name = parsedUrl.searchParams.get("name") || "Guest";
      const role = parsedUrl.searchParams.get("role") || "participant";
      const pass = parsedUrl.searchParams.get("pass") || "";

      const room = getOrCreateRoom(roomId);
      room.handlePeerJoin(ws, userId, name, role, pass);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`ClassroomFlare Chabokan Server running on port ${PORT}`);
});
