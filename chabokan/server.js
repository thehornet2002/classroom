const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const dgram = require("dgram");
const { WebSocketServer } = require("ws");

const { generateToken, authenticateToken, requireRole, verifyToken } = require("./auth");
const {
  loginUser,
  createUser,
  listUsers,
  deleteUser,
  updatePassword,
  getUserDashboard,
  createCourse,
  createSession,
  updateSessionStatus,
} = require("./lmsService");
const {
  saveRecording,
  streamRecording,
  downloadRecording,
  listAllRecordings,
} = require("./recordingService");
const { getOrCreateRoom, hasRoom, deleteRoom, rooms, sanitizeText } = require("./roomManager");
const { db } = require("./db");

const PORT = process.env.PORT || 3000;
const UDP_PORT = process.env.UDP_PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.set("trust proxy", true); // Required for Chabokan edge reverse proxy
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Native UDP Socket Server for Low-Latency Realtime Streaming / Diagnostics
const udpServer = dgram.createSocket("udp4");
udpServer.on("error", (err) => {
  console.warn("UDP Server notice:", err.message);
});
udpServer.on("message", (msg, rinfo) => {
  try {
    const text = msg.toString();
    if (text.startsWith("{")) {
      const data = JSON.parse(text);
      if (data.type === "PING") {
        const reply = Buffer.from(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
        udpServer.send(reply, rinfo.port, rinfo.address);
      }
    }
  } catch (e) {}
});
udpServer.on("listening", () => {
  const addr = udpServer.address();
  console.log(`Classroom UDP Realtime Server listening on port ${addr.port}`);
});

try {
  udpServer.bind(UDP_PORT);
} catch (e) {
  console.warn("UDP bind notice:", e.message);
}

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Classroom Production Server",
    platform: "Chabokan",
    activeRooms: rooms.size,
    udpPort: UDP_PORT,
    timestamp: Date.now(),
  });
});

// ==========================================
// 1. Auth & Account Endpoints
// ==========================================
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "نام کاربری و کلمه عبور الزامی است." });
  }

  const result = loginUser(username, password);
  if (result.error) {
    return res.status(401).json({ error: result.error });
  }

  const token = generateToken(result.user);
  res.json({
    token,
    user: result.user,
  });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Host / Admin password change endpoint
app.post("/api/auth/change-password", authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "رمز عبور فعلی و رمز عبور جدید الزامی هستند." });
  }

  const result = updatePassword(req.user.id, currentPassword, newPassword);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// Admin / Teacher User Management
app.get("/api/users", authenticateToken, requireRole("admin", "teacher"), (req, res) => {
  const users = listUsers();
  res.json({ users });
});

app.post("/api/users", authenticateToken, requireRole("admin", "teacher"), (req, res) => {
  const { username, password, name, email, role } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: "اطلاعات نام، نام کاربری و رمز عبور الزامی است." });
  }

  const result = createUser({ username, password, name, email, role });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.status(201).json(result);
});

app.delete("/api/users/:id", authenticateToken, requireRole("admin"), (req, res) => {
  deleteUser(req.params.id);
  res.json({ success: true });
});

// ==========================================
// 2. LMS Dashboard & Courses
// ==========================================
app.get("/api/lms/dashboard", authenticateToken, (req, res) => {
  const dashboard = getUserDashboard(req.user.id, req.user.role);
  res.json(dashboard);
});

app.post("/api/lms/courses", authenticateToken, requireRole("admin", "teacher"), (req, res) => {
  const { title, code, description, coverColor } = req.body;
  if (!title || !code) {
    return res.status(400).json({ error: "عنوان و کد درس الزامی است." });
  }

  const course = createCourse({
    title,
    code,
    description,
    teacherId: req.user.id,
    coverColor,
  });
  res.status(201).json(course);
});

app.post("/api/lms/sessions", authenticateToken, requireRole("admin", "teacher"), (req, res) => {
  const { courseId, title, scheduledStart, scheduledEnd, hostPass } = req.body;
  if (!courseId || !title) {
    return res.status(400).json({ error: "انتخاب درس و عنوان جلسه الزامی است." });
  }

  const session = createSession({
    courseId,
    title,
    teacherId: req.user.id,
    scheduledStart: scheduledStart || Date.now(),
    scheduledEnd: scheduledEnd || Date.now() + 2 * 3600 * 1000,
    hostPass,
  });

  // Pre-initialize room
  getOrCreateRoom(session.id, title, hostPass);

  res.status(201).json(session);
});

function getFormattedInviteLink(roomId, req) {
  try {
    if (req) {
      const forwardedProto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
      const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || req.hostname;
      if (hostHeader) {
        const cleanHost = hostHeader.split(":")[0];
        return `${forwardedProto}://${cleanHost}/?room=${roomId}`;
      }
    }
  } catch (e) {}
  return `/?room=${roomId}`;
}

// ==========================================
// 2.5 Admin Room Creation & Management (UDP/WS Configurable)
// ==========================================
app.post("/api/rooms", authenticateToken, requireRole("admin", "teacher"), (req, res) => {
  const { title, transport } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "عنوان اتاق الزامی است." });
  }

  const cleanTitle = sanitizeText(title, 100);
  const roomId = "room-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6);
  const transportConfig = {
    audio: transport?.audio === "ws" ? "ws" : "udp",
    video: transport?.video === "ws" ? "ws" : "udp",
    data: transport?.data === "ws" ? "ws" : "udp",
  };

  const now = Date.now();
  const insertRoom = db.prepare(`
    INSERT INTO managed_rooms (id, title, admin_id, transport_config, invite_token, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertRoom.run(roomId, cleanTitle, req.user.id, JSON.stringify(transportConfig), roomId, now, "active");

  getOrCreateRoom(roomId, cleanTitle, null, transportConfig);

  res.status(201).json({
    success: true,
    room: {
      id: roomId,
      title: cleanTitle,
      transport: transportConfig,
      inviteLink: getFormattedInviteLink(roomId, req),
      createdAt: now,
    },
  });
});

app.get("/api/rooms", authenticateToken, requireRole("admin", "teacher"), (req, res) => {
  const dbRooms = db.prepare("SELECT * FROM managed_rooms WHERE status = 'active' ORDER BY created_at DESC").all();
  const result = dbRooms.map((r) => {
    let transport = { audio: "udp", video: "udp", data: "udp" };
    try { transport = JSON.parse(r.transport_config); } catch (e) {}
    const activeRoom = rooms.get(r.id);
    return {
      id: r.id,
      title: r.title,
      transport,
      inviteLink: getFormattedInviteLink(r.id, req),
      activeUsers: activeRoom ? Object.keys(activeRoom.users).length : 0,
      createdAt: r.created_at,
    };
  });
  res.json({ rooms: result });
});

app.delete("/api/rooms/:id", authenticateToken, requireRole("admin", "teacher"), (req, res) => {
  const roomId = req.params.id;
  db.prepare("UPDATE managed_rooms SET status = 'ended' WHERE id = ?").run(roomId);
  deleteRoom(roomId);
  res.json({ success: true, message: "اتاق با موفقیت بسته شد." });
});

// ==========================================
// 2.6 Server Configuration (Chabokan Edge Routing)
// ==========================================
app.get("/api/config", (req, res) => {
  res.json({
    status: "ok",
    platform: "Chabokan",
    protocol: req.secure ? "https" : "http",
  });
});

// Public endpoint for participants to check room info before joining
app.get("/api/rooms/:id/info", (req, res) => {
  const roomId = req.params.id;
  const activeRoom = rooms.get(roomId);
  const dbRoom = db.prepare("SELECT * FROM managed_rooms WHERE status = 'active'").all().find((r) => r.id === roomId)
    || db.prepare("SELECT * FROM class_sessions WHERE id = ?").get(roomId);

  if (!activeRoom && !dbRoom) {
    return res.status(404).json({ error: "اتاق مورد نظر یافت نشد یا پایان یافته است." });
  }

  let transport = { audio: "udp", video: "udp", data: "udp" };
  if (activeRoom) {
    transport = activeRoom.transport;
  } else if (dbRoom && dbRoom.transport_config) {
    try { transport = JSON.parse(dbRoom.transport_config); } catch (e) {}
  }

  res.json({
    exists: true,
    roomId,
    title: (activeRoom && activeRoom.roomName) || (dbRoom && dbRoom.title) || `کلاس آنلاین ${roomId}`,
    transport,
    activeUsersCount: activeRoom ? Object.keys(activeRoom.users).length : 0,
  });
});

// ==========================================
// 3. Low-Bitrate Meeting Recordings (Chabokan Storage)
// ==========================================
// Direct upload endpoint for Host client recorder
app.post("/api/recordings/upload", (req, res) => {
  const sessionId = req.headers["x-session-id"] || "default";
  const courseId = req.headers["x-course-id"] || "c_general";
  const title = decodeURIComponent(req.headers["x-title"] || "جلسه ضبط‌شده");
  const teacherName = decodeURIComponent(req.headers["x-teacher"] || "استاد");
  const durationSeconds = parseInt(req.headers["x-duration"] || "0", 10);

  saveRecording({
    sessionId,
    courseId,
    title,
    teacherName,
    durationSeconds,
    stream: req,
    res,
  });
});

// Direct stream (seekable HTTP 206)
app.get("/api/recordings/:id/stream", (req, res) => {
  streamRecording(req, res, req.params.id);
});

// Direct download
app.get("/api/recordings/:id/download", (req, res) => {
  downloadRecording(res, req.params.id);
});

// List recordings (optionally filtered by ?sessionId=...)
app.get("/api/recordings", (req, res) => {
  const { sessionId } = req.query;
  const allRecs = listAllRecordings();
  const recordings = sessionId
    ? allRecs.filter((r) => r.session_id === sessionId)
    : allRecs;
  res.json({ recordings });
});

// ==========================================
// 4. Static Frontend Assets Serving
// ==========================================
app.use(express.static(PUBLIC_DIR));

app.get("*", (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
        <head><meta charset="utf-8"/><title>Classroom LMS</title></head>
        <body style="background:#1e222b;color:#f3f4f6;font-family:sans-serif;padding:3rem;text-align:center;">
          <h2 style="color:#60a5fa;">سرور پروداکشن Classroom در حال اجراست</h2>
          <p>فرانت‌اند React در حال بیلد و استقرار است.</p>
          <p><a href="/health" style="color:#34d399;">مشاهده وضعیت سرور (Health Check)</a></p>
        </body>
      </html>
    `);
  }
});

// ==========================================
// 5. WebSocket Server & Upgrade Wiring
// ==========================================
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const roomId = parsedUrl.searchParams.get("roomId") || "main";
      const userId = parsedUrl.searchParams.get("userId") || `${Date.now()}-${Math.random()}`;
      const token = parsedUrl.searchParams.get("token");
      const pass = parsedUrl.searchParams.get("pass") || "";
      const admitToken = parsedUrl.searchParams.get("admitToken") || "";

      let username = parsedUrl.searchParams.get("username") || "guest";
      let name = parsedUrl.searchParams.get("name") || username;
      let role = parsedUrl.searchParams.get("role") || "participant";
      let isTeacherOrAdmin = false;

      // 1. Verify JWT token if provided
      if (token) {
        const payload = verifyToken(token);
        if (payload) {
          username = payload.username;
          name = payload.name;
          if (payload.role === "teacher" || payload.role === "admin") {
            role = "host";
            isTeacherOrAdmin = true;
          }
        }
      }

      // 2. Check if room exists in memory, managed_rooms, or class_sessions
      const existsInRam = hasRoom(roomId);
      const dbRoom = db.prepare("SELECT * FROM managed_rooms WHERE id = ? AND status = 'active'").all().find((r) => r.id === roomId)
        || db.prepare("SELECT * FROM class_sessions WHERE id = ?").get(roomId);

      if (dbRoom && dbRoom.host_pass && pass === dbRoom.host_pass) {
        role = "host";
        isTeacherOrAdmin = true;
      }

      // If room does NOT exist and user is NOT admin/teacher, refuse connection!
      if (!existsInRam && !dbRoom && !isTeacherOrAdmin) {
        ws.send(JSON.stringify({
          type: "AUTH_ERROR",
          message: "اتاق مورد نظر یافت نشد. فقط مدیر سیستم مجاز به ساخت اتاق است.",
        }));
        setTimeout(() => {
          try { ws.close(4004, "Room does not exist"); } catch (e) {}
        }, 50);
        return;
      }

      let transportConfig = null;
      if (dbRoom && dbRoom.transport_config) {
        try { transportConfig = JSON.parse(dbRoom.transport_config); } catch (e) {}
      }

      const roomTitle = (dbRoom && dbRoom.title) || (isTeacherOrAdmin ? `کلاس مدیر ${name}` : null);
      const room = getOrCreateRoom(roomId, roomTitle, dbRoom ? dbRoom.host_pass : pass, transportConfig);
      room.handlePeerJoin(ws, userId, username, name, role, isTeacherOrAdmin, admitToken);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Classroom Production LMS & Video Server running on port ${PORT}`);
});

module.exports = {
  app,
  server,
};
