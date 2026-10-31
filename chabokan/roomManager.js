const { WebSocket } = require("ws");

const DEFAULT_LAYOUTS = {
  sharing: {
    id: "sharing",
    name: "Sharing",
    pods: [
      { id: "share-1", type: "share", title: "Share Pod", x: 0, y: 0, w: 72, h: 100 },
      { id: "camera-1", type: "camera", title: "Video", x: 72, y: 0, w: 28, h: 28 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 72, y: 28, w: 28, h: 36 },
      { id: "chat-1", type: "chat", title: "Chat", x: 72, y: 64, w: 28, h: 36 },
    ],
  },
  discussion: {
    id: "discussion",
    name: "Discussion",
    pods: [
      { id: "camera-1", type: "camera", title: "Video", x: 0, y: 0, w: 60, h: 50 },
      { id: "chat-1", type: "chat", title: "Discussion Chat", x: 0, y: 50, w: 60, h: 50 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 60, y: 0, w: 40, h: 50 },
      { id: "notes-1", type: "notes", title: "Discussion Notes", x: 60, y: 50, w: 40, h: 50 },
    ],
  },
  collaboration: {
    id: "collaboration",
    name: "Collaboration",
    pods: [
      { id: "share-1", type: "share", title: "Whiteboard", x: 0, y: 0, w: 65, h: 100 },
      { id: "camera-1", type: "camera", title: "Video", x: 65, y: 0, w: 35, h: 25 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 65, y: 25, w: 35, h: 35 },
      { id: "chat-1", type: "chat", title: "Chat", x: 65, y: 60, w: 35, h: 40 },
    ],
  },
};

function getDefaultPermissions(role) {
  const isPrivileged = role === "host" || role === "presenter" || role === "teacher" || role === "admin";
  return {
    canAudio: isPrivileged,
    canVideo: isPrivileged,
    canScreen: isPrivileged,
    canDraw: isPrivileged,
    canChat: true,
    canShareDoc: isPrivileged,
  };
}

function sanitizeText(str, maxLength = 2000) {
  if (typeof str !== "string") return "";
  return str.replace(/[<>]/g, "").trim().slice(0, maxLength);
}

class Room {
  constructor(id, name = "کلاس آنلاین Classroom", hostPass = null, transportConfig = null) {
    this.roomId = id;
    this.roomName = sanitizeText(name, 100) || "کلاس آنلاین";
    this.hostPass = hostPass;
    this.transport = transportConfig || {
      audio: "udp",
      video: "udp",
      data: "udp",
    };
    this.activeLayoutId = "sharing";
    this.currentLayout = JSON.parse(JSON.stringify(DEFAULT_LAYOUTS.sharing));
    this.users = {};
    this.shareMode = "screen";
    this.whiteboardPage = 1;
    this.whiteboardStrokes = [];
    this.documentState = null;
    this.polls = {};
    this.activePollId = null;
    this.notesContent = "به جلسه آنلاین خوش آمدید!\nمی‌توانید یادداشت‌های کلاس را در اینجا بنویسید.";
    this.notesVersion = 1;
    this.breakoutsActive = false;
    this.breakoutRooms = [];
    this.chatMessages = [];

    this.peers = new Map(); // userId -> { ws, user }
  }

  getState() {
    return {
      roomId: this.roomId,
      roomName: this.roomName,
      transport: this.transport,
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
      chatMessages: this.chatMessages,
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

  handlePeerJoin(ws, userId, username, name, role, isTeacherOrAdmin = false) {
    const cleanUsername = sanitizeText(username, 50) || "user";
    const cleanName = sanitizeText(name, 50) || cleanUsername;
    const finalRole = isTeacherOrAdmin ? "host" : "participant";
    const isHost = finalRole === "host";

    const user = {
      id: userId,
      username: cleanUsername,
      name: cleanName,
      role: finalRole,
      status: "none",
      permissions: getDefaultPermissions(finalRole),
      joinedAt: Date.now(),
      admitted: isHost, // Only verified hosts/admins auto-admit; guests must be approved
    };

    this.peers.set(userId, { ws, user });
    this.users[userId] = user;

    if (!user.admitted) {
      this.sendTo(ws, {
        type: "ADMISSION_REQUIRED",
        message: "شما در صف انتظار هستید. لطفاً منتظر بمانید تا مدیر کلاس ورود شما را تایید کند.",
      });
      // Broadcast to host so waiting list updates
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
              reason: "استاد درخواست ورود شما را تایید نکرد.",
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
            reason: msg.reason || "توسط استاد از کلاس حذف شدید.",
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

      case "UPDATE_TRANSPORT": {
        if (sender.user.role !== "host") return;
        if (msg.transport) {
          this.transport = {
            audio: msg.transport.audio === "ws" ? "ws" : "udp",
            video: msg.transport.video === "ws" ? "ws" : "udp",
            data: msg.transport.data === "ws" ? "ws" : "udp",
          };
          this.broadcast({ type: "UPDATE_TRANSPORT", transport: this.transport });
        }
        break;
      }

      case "CHAT_MESSAGE": {
        if (!sender.user.permissions.canChat) return;
        const cleanText = sanitizeText(msg.text, 2000);
        if (!cleanText) return;

        const verifiedMsg = {
          type: "CHAT_MESSAGE",
          id: msg.id || `${Date.now()}-${Math.random()}`,
          channel: msg.channel,
          senderId: sender.user.id,
          senderName: sender.user.name,
          senderRole: sender.user.role,
          text: cleanText,
          timestamp: Date.now(),
        };

        if (msg.channel === "everyone" || msg.channel === "hosts") {
          this.chatMessages.push(verifiedMsg);
          if (this.chatMessages.length > 250) this.chatMessages.shift();
        }

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
        if (!sender.user.permissions.canShareDoc && sender.user.role === "participant") return;
        if (this.documentState) {
          this.documentState.currentPage = msg.page;
          if (msg.zoom !== undefined) this.documentState.zoom = msg.zoom;
          if (msg.panX !== undefined) this.documentState.panX = msg.panX;
          if (msg.panY !== undefined) this.documentState.panY = msg.panY;
        }
        this.broadcast(msg);
        break;
      }

      case "DOC_SYNC_MODE": {
        if (sender.user.role !== "host" && sender.user.role !== "presenter") return;
        if (this.documentState) {
          this.documentState.syncMode = msg.syncMode;
        }
        this.broadcast(msg);
        break;
      }

      case "DOC_STROKE": {
        if (sender.user.role !== "host" && sender.user.role !== "presenter") return;
        if (this.documentState) {
          if (!this.documentState.strokes) {
            this.documentState.strokes = [];
          }
          this.documentState.strokes.push(msg.stroke);
        }
        this.broadcast(msg, senderId);
        break;
      }

      case "DOC_CLEAR_STROKES": {
        if (sender.user.role !== "host" && sender.user.role !== "presenter") return;
        if (this.documentState && this.documentState.strokes) {
          this.documentState.strokes = this.documentState.strokes.filter(
            (s) => s.page !== msg.page
          );
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
            answer: sanitizeText(msg.textAnswer, 1000),
            timestamp: Date.now(),
          });
        } else if (msg.optionIds) {
          for (const opt of poll.options) {
            opt.votes = opt.votes.filter((u) => u !== senderId);
            if (opt.voterDetails) {
              opt.voterDetails = opt.voterDetails.filter((v) => v.userId !== senderId);
            }
            if (msg.optionIds.includes(opt.id)) {
              opt.votes.push(senderId);
              if (!opt.voterDetails) opt.voterDetails = [];
              opt.voterDetails.push({
                userId: senderId,
                userName: sender.user.name,
                timestamp: Date.now(),
              });
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

      case "MEDIA_STATE": {
        if (this.users[senderId]) {
          this.users[senderId].mediaState = msg.mediaState;
        }
        this.broadcast(msg, senderId);
        break;
      }

      case "RECORDING_STATE": {
        if (sender.user.role !== "host") return;
        this.broadcast(msg);
        break;
      }

      case "RECORDING_FINISHED": {
        if (sender.user.role !== "host") return;
        this.broadcast(msg);
        break;
      }

      case "CLOSE_ROOM": {
        if (sender.user.role !== "host") return;
        this.broadcast({
          type: "ROOM_ENDED",
          reason: msg.reason || "کلاس توسط مدیر خاتمه یافت و اتاق بسته شد.",
        });
        for (const peer of this.peers.values()) {
          try {
            peer.ws.close(4003, "Room ended by host");
          } catch (e) {}
        }
        rooms.delete(this.roomId);
        try {
          const { db } = require("./db");
          db.prepare("UPDATE managed_rooms SET status = 'ended' WHERE id = ?").run(this.roomId);
        } catch (e) {}
        break;
      }

      // WebRTC Peer-to-Peer Signaling Relay (Strictly isolated to admitted users)
      case "SIGNAL_OFFER":
      case "SIGNAL_ANSWER":
      case "SIGNAL_ICE": {
        if (!sender.user.admitted) return;
        const target = this.peers.get(msg.targetId);
        if (target && target.user.admitted) {
          this.sendTo(target.ws, msg);
        }
        break;
      }
    }
  }
}

const rooms = new Map();

function hasRoom(roomId) {
  return rooms.has(roomId);
}

function getOrCreateRoom(roomId, title = null, hostPass = null, transportConfig = null) {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId, title || `کلاس آنلاین ${roomId}`, hostPass, transportConfig);
    rooms.set(roomId, room);
  } else if (transportConfig) {
    room.transport = transportConfig;
  }
  return room;
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    for (const peer of room.peers.values()) {
      try {
        room.sendTo(peer.ws, {
          type: "KICK_USER",
          targetId: peer.user.id,
          reason: "اتاق توسط مدیر بسته شد.",
        });
        peer.ws.close(4003, "Room ended by admin");
      } catch (e) {}
    }
    rooms.delete(roomId);
    return true;
  }
  return false;
}

module.exports = {
  getOrCreateRoom,
  hasRoom,
  deleteRoom,
  rooms,
  sanitizeText,
};
