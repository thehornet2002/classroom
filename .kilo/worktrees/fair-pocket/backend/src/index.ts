import {
  createInitialRoomState,
  DEFAULT_LAYOUTS,
  getDefaultPermissions,
} from "./roomManager";
import {
  RoomState,
  User,
  UserRole,
  WSMessage,
  WhiteboardStroke,
  Poll,
} from "./types";

export interface Env {
  ROOMS?: DurableObjectNamespace;
}

interface PeerConnection {
  ws: WebSocket;
  user: User;
}

// Durable Object handling Room synchronization & signaling
export class RoomDurableObject {
  private state: DurableObjectState;
  private roomState: RoomState | null = null;
  private peers = new Map<string, PeerConnection>(); // userId -> connection

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const roomId = url.searchParams.get("roomId") || "default";
      const userId = url.searchParams.get("userId") || crypto.randomUUID();
      const name = url.searchParams.get("name") || "Guest";
      const role = (url.searchParams.get("role") || "participant") as UserRole;
      const pass = url.searchParams.get("pass") || "";

      if (!this.roomState) {
        this.roomState = createInitialRoomState(roomId);
        if (pass && role === "host") {
          this.roomState.hostPass = pass;
        }
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.handleWebSocket(server, userId, name, role, pass);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (url.pathname === "/info") {
      return new Response(
        JSON.stringify({
          activeUsers: this.peers.size,
          state: this.roomState,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  }

  private handleWebSocket(
    ws: WebSocket,
    userId: string,
    name: string,
    requestedRole: UserRole,
    pass: string
  ) {
    ws.accept();

    if (!this.roomState) {
      this.roomState = createInitialRoomState("default");
    }

    // Role verification: Host requires matching password, or being the first occupant
    const hasExistingUsers = Object.keys(this.roomState.users).length > 0;
    let finalRole: UserRole = requestedRole;
    if (requestedRole === "host") {
      if (hasExistingUsers) {
        if (!this.roomState.hostPass || this.roomState.hostPass !== pass) {
          finalRole = "participant";
        }
      } else if (pass) {
        // First occupant establishing host credentials
        this.roomState.hostPass = pass;
      }
    }

    const isHost = finalRole === "host";
    const user: User = {
      id: userId,
      name,
      role: finalRole,
      status: "none",
      permissions: getDefaultPermissions(finalRole),
      joinedAt: Date.now(),
      admitted: isHost || !hasExistingUsers, // First user or Host is auto-admitted
    };

    // If first user, ensure host role
    if (!hasExistingUsers) {
      user.role = "host";
      user.permissions = getDefaultPermissions("host");
      user.admitted = true;
    }

    this.peers.set(userId, { ws, user });
    this.roomState.users[userId] = user;

    if (!user.admitted) {
      // Notify user they are in waiting room
      this.sendTo(ws, {
        type: "ADMISSION_REQUIRED",
        message: "Please wait for the Host to admit you to the room.",
      });
      // Notify hosts of pending admission
      this.broadcastToRole("host", {
        type: "USER_JOINED",
        user,
      });
    } else {
      // Send full state to newly admitted user
      this.sendTo(ws, {
        type: "ROOM_STATE",
        state: this.roomState,
      });
      // Broadcast user joined to other admitted users
      this.broadcast(
        {
          type: "USER_JOINED",
          user,
        },
        userId
      );
    }

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSMessage;
        this.processMessage(userId, msg);
      } catch (e) {
        console.error("Invalid WS message format", e);
      }
    });

    const cleanup = () => {
      this.peers.delete(userId);
      if (this.roomState && this.roomState.users[userId]) {
        delete this.roomState.users[userId];
        this.broadcast({
          type: "USER_LEFT",
          userId,
        });
      }
    };

    ws.addEventListener("close", cleanup);
    ws.addEventListener("error", cleanup);
  }

  private processMessage(senderId: string, msg: WSMessage) {
    if (!this.roomState) return;
    const sender = this.peers.get(senderId);
    if (!sender) return;

    switch (msg.type) {
      case "PING":
        this.sendTo(sender.ws, { type: "PONG" });
        break;

      case "ADMISSION_DECISION": {
        if (sender.user.role !== "host") return;
        const target = this.peers.get(msg.targetId);
        if (target && this.roomState.users[msg.targetId]) {
          if (msg.approved) {
            target.user.admitted = true;
            this.roomState.users[msg.targetId].admitted = true;
            this.sendTo(target.ws, {
              type: "ROOM_STATE",
              state: this.roomState,
            });
            this.broadcast(
              {
                type: "USER_JOINED",
                user: target.user,
              },
              msg.targetId
            );
          } else {
            this.sendTo(target.ws, {
              type: "KICK_USER",
              targetId: msg.targetId,
              reason: "Host denied admission to the room.",
            });
            target.ws.close(4001, "Admission denied");
            this.peers.delete(msg.targetId);
            delete this.roomState.users[msg.targetId];
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
          delete this.roomState.users[msg.targetId];
          this.broadcast({ type: "USER_LEFT", userId: msg.targetId });
        }
        break;
      }

      case "STATUS_CHANGE": {
        const targetUserId =
          sender.user.role === "host" && msg.targetId ? msg.targetId : senderId;
        const targetPeer = this.peers.get(targetUserId);
        if (targetPeer && this.roomState.users[targetUserId]) {
          targetPeer.user.status = msg.status;
          this.roomState.users[targetUserId].status = msg.status;
          this.broadcast({
            type: "USER_UPDATED",
            user: targetPeer.user,
          });
        }
        break;
      }

      case "SET_ROLE": {
        if (sender.user.role !== "host") return;
        const target = this.peers.get(msg.targetId);
        if (target && this.roomState.users[msg.targetId]) {
          target.user.role = msg.role;
          target.user.permissions = getDefaultPermissions(msg.role);
          this.roomState.users[msg.targetId] = target.user;
          this.broadcast({
            type: "USER_UPDATED",
            user: target.user,
          });
        }
        break;
      }

      case "SET_PERMISSIONS": {
        if (sender.user.role !== "host") return;
        const target = this.peers.get(msg.targetId);
        if (target && this.roomState.users[msg.targetId]) {
          target.user.permissions = {
            ...target.user.permissions,
            ...msg.permissions,
          };
          this.roomState.users[msg.targetId] = target.user;
          this.broadcast({
            type: "USER_UPDATED",
            user: target.user,
          });
        }
        break;
      }

      case "SWITCH_LAYOUT": {
        if (sender.user.role !== "host" && sender.user.role !== "presenter") return;
        const preset = DEFAULT_LAYOUTS[msg.layoutId];
        if (preset) {
          this.roomState.activeLayoutId = msg.layoutId;
          this.roomState.currentLayout = JSON.parse(JSON.stringify(preset));
          this.broadcast({
            type: "UPDATE_LAYOUT",
            layout: this.roomState.currentLayout,
          });
        }
        break;
      }

      case "UPDATE_LAYOUT": {
        if (sender.user.role !== "host") return;
        this.roomState.currentLayout = msg.layout as any;
        this.broadcast({
          type: "UPDATE_LAYOUT",
          layout: this.roomState.currentLayout,
        });
        break;
      }

      case "UPDATE_POD": {
        if (sender.user.role !== "host") return;
        const pods = this.roomState.currentLayout.pods;
        const idx = pods.findIndex((p) => p.id === msg.pod.id);
        if (idx !== -1) {
          pods[idx] = msg.pod;
        } else {
          pods.push(msg.pod);
        }
        this.broadcast({
          type: "UPDATE_LAYOUT",
          layout: this.roomState.currentLayout,
        });
        break;
      }

      case "CHAT_MESSAGE": {
        if (!sender.user.permissions.canChat) return;
        const verifiedMsg: WSMessage = {
          type: "CHAT_MESSAGE",
          id: msg.id || crypto.randomUUID(),
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
          // 1-to-1 private chat
          const target = this.peers.get(msg.channel);
          if (target) {
            this.sendTo(target.ws, verifiedMsg);
            this.sendTo(sender.ws, verifiedMsg); // echo back to sender
          }
        }
        break;
      }

      case "SET_SHARE_MODE": {
        if (!sender.user.permissions.canScreen && sender.user.role === "participant") return;
        this.roomState.shareMode = msg.mode;
        this.broadcast(msg);
        break;
      }

      case "WHITEBOARD_STROKE": {
        if (!sender.user.permissions.canDraw) return;
        this.roomState.whiteboardStrokes.push(msg.stroke);
        this.broadcast(msg, senderId);
        break;
      }

      case "WHITEBOARD_CLEAR": {
        if (!sender.user.permissions.canDraw) return;
        this.roomState.whiteboardStrokes = this.roomState.whiteboardStrokes.filter(
          (s) => s.pageId !== msg.pageId
        );
        this.broadcast(msg);
        break;
      }

      case "WHITEBOARD_PAGE_CHANGE": {
        if (sender.user.role === "participant") return;
        this.roomState.whiteboardPage = msg.pageId;
        this.broadcast(msg);
        break;
      }

      case "DOC_CHANGE": {
        if (!sender.user.permissions.canShareDoc) return;
        this.roomState.documentState = msg.docState;
        this.broadcast(msg);
        break;
      }

      case "DOC_PAGE_CHANGE": {
        if (!sender.user.permissions.canShareDoc) return;
        if (this.roomState.documentState) {
          this.roomState.documentState.currentPage = msg.page;
          if (msg.zoom) this.roomState.documentState.zoom = msg.zoom;
        }
        this.broadcast(msg);
        break;
      }

      case "POLL_CREATE": {
        if (sender.user.role === "participant") return;
        this.roomState.polls[msg.poll.id] = msg.poll;
        this.roomState.activePollId = msg.poll.id;
        this.broadcast(msg);
        break;
      }

      case "POLL_VOTE": {
        const poll = this.roomState.polls[msg.pollId];
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

        // Notify hosts of vote, and everyone if broadcastResults is true
        if (poll.broadcastResults) {
          this.broadcast({ type: "POLL_CREATE", poll });
        } else {
          this.broadcastToRoles(["host", "presenter"], { type: "POLL_CREATE", poll });
        }
        break;
      }

      case "POLL_STATUS": {
        if (sender.user.role === "participant") return;
        const poll = this.roomState.polls[msg.pollId];
        if (poll) {
          poll.isOpen = msg.isOpen;
          poll.broadcastResults = msg.broadcastResults;
          this.broadcast({ type: "POLL_CREATE", poll });
        }
        break;
      }

      case "POLL_REMOVE": {
        if (sender.user.role === "participant") return;
        delete this.roomState.polls[msg.pollId];
        if (this.roomState.activePollId === msg.pollId) {
          this.roomState.activePollId = undefined;
        }
        this.broadcast(msg);
        break;
      }

      case "NOTE_UPDATE": {
        this.roomState.notesContent = msg.content;
        this.roomState.notesVersion = msg.version;
        this.broadcast(msg, senderId);
        break;
      }

      case "BREAKOUT_START": {
        if (sender.user.role !== "host") return;
        this.roomState.breakoutsActive = true;
        this.roomState.breakoutRooms = msg.rooms;
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
        this.roomState.breakoutsActive = false;
        this.roomState.breakoutRooms = [];
        this.broadcast(msg);
        break;
      }

      // WebRTC Peer-to-Peer Signaling Relay
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

  private sendTo(ws: WebSocket, msg: WSMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      console.error("Failed to send WS message", e);
    }
  }

  private broadcast(msg: WSMessage, excludeUserId?: string) {
    const raw = JSON.stringify(msg);
    for (const [id, peer] of this.peers.entries()) {
      if (excludeUserId && id === excludeUserId) continue;
      if (!peer.user.admitted) continue;
      try {
        peer.ws.send(raw);
      } catch (e) {
        console.error("Failed to broadcast message to peer", id, e);
      }
    }
  }

  private broadcastToRole(role: UserRole, msg: WSMessage) {
    const raw = JSON.stringify(msg);
    for (const peer of this.peers.values()) {
      if (peer.user.role === role) {
        try {
          peer.ws.send(raw);
        } catch (e) {
          console.error("Broadcast to role failed", e);
        }
      }
    }
  }

  private broadcastToRoles(roles: UserRole[], msg: WSMessage) {
    const raw = JSON.stringify(msg);
    for (const peer of this.peers.values()) {
      if (roles.includes(peer.user.role)) {
        try {
          peer.ws.send(raw);
        } catch (e) {
          console.error("Broadcast to roles failed", e);
        }
      }
    }
  }
}

// Standalone fallback room coordinator for Worker instances without DO bound
const fallbackRooms = new Map<string, RoomDurableObject>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "classroomflare" }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        `<!DOCTYPE html><html><head><title>ClassroomFlare Worker</title></head><body style="font-family:sans-serif;background:#1e222b;color:#f3f4f6;padding:2rem;line-height:1.6;">
        <h2 style="color:#60a5fa;margin-bottom:0.5rem;">ClassroomFlare Cloudflare Worker</h2>
        <p>Backend Status: <span style="color:#10b981;font-weight:bold;">Online</span></p>
        <p>WebSocket URL: <code>ws://${url.host}/ws</code></p>
        <p>Health Endpoint: <a href="/health" style="color:#93c5fd;">/health</a></p>
        <p style="color:#9ca3af;font-size:0.875rem;margin-top:1.5rem;">Run the frontend client via <code>cd frontend &amp;&amp; npm run dev</code> to connect to this server.</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const roomId = url.searchParams.get("roomId") || "main";

    // If Durable Objects binding is available (Wrangler/Cloudflare deployment)
    if (env.ROOMS) {
      const id = env.ROOMS.idFromName(roomId);
      const roomObject = env.ROOMS.get(id);
      return roomObject.fetch(request);
    }

    // In-memory fallback (local development / standalone Worker)
    let room = fallbackRooms.get(roomId);
    if (!room) {
      room = new RoomDurableObject({} as any);
      fallbackRooms.set(roomId, room);
    }
    return room.fetch(request);
  },
};
