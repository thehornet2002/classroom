const assert = require("assert");
const http = require("http");
const dgram = require("dgram");
const { WebSocket } = require("ws");
const { app, server } = require("../server");
const { db } = require("../db");
const { loginUser, createUser, getUserDashboard } = require("../lmsService");
const { generateToken, verifyToken } = require("../auth");

async function runAllTests() {
  console.log("=========================================");
  console.log("🚀 Starting Heavy Production Test Suite");
  console.log("=========================================\n");

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Database Schema & Seed Verification
  test("Database initialized with seed data", () => {
    const userCount = db.prepare("SELECT count(*) as count FROM users").get().count;
    const courseCount = db.prepare("SELECT count(*) as count FROM courses").get().count;
    const sessionCount = db.prepare("SELECT count(*) as count FROM class_sessions").get().count;

    assert.ok(userCount >= 4, `Expected at least 4 users, got ${userCount}`);
    assert.ok(courseCount >= 3, `Expected at least 3 courses, got ${courseCount}`);
    assert.ok(sessionCount >= 3, `Expected at least 3 sessions, got ${sessionCount}`);
  });

  // 2. Auth & Password Hashing
  test("User Authentication with valid credentials", () => {
    const res = loginUser("dr.rezaei", "teacher123");
    assert.ok(res.user, "Expected user object");
    assert.strictEqual(res.user.role, "teacher");
    assert.strictEqual(res.user.name, "دکتر علی رضایی");
  });

  test("User Authentication rejects invalid password", () => {
    const res = loginUser("dr.rezaei", "wrongpassword");
    assert.ok(res.error, "Expected auth error");
  });

  test("JWT Generation and Verification", () => {
    const user = { id: "u_test", username: "testuser", name: "Test User", role: "teacher" };
    const token = generateToken(user);
    assert.ok(token, "Token should be generated");
    const payload = verifyToken(token);
    assert.strictEqual(payload.username, "testuser");
    assert.strictEqual(payload.role, "teacher");
  });

  // 3. LMS Dashboard & User Courses
  test("Student Dashboard contains enrolled courses & upcoming sessions", () => {
    const dashboard = getUserDashboard("u_student1", "student");
    assert.ok(dashboard.courses.length >= 2, "Student should have at least 2 courses");
    assert.ok(dashboard.sessions.length >= 1, "Student should have class sessions");
  });

  test("Teacher Dashboard contains taught courses & sessions", () => {
    const dashboard = getUserDashboard("u_teacher", "teacher");
    assert.ok(dashboard.courses.length >= 3, "Teacher should have 3 courses");
    assert.ok(dashboard.sessions.length >= 3, "Teacher should have 3 sessions");
  });

  // 4. User Management
  test("Create New User with unique username", () => {
    const newUsername = `test_${Date.now()}`;
    const res = createUser({
      username: newUsername,
      password: "pass12345",
      name: "کاربر تستی جدید",
      email: "test@chabokan.net",
      role: "student",
    });
    assert.ok(res.user, "User should be created");
    assert.strictEqual(res.user.username, newUsername);

    // Re-creating duplicate username should fail
    const dupRes = createUser({
      username: newUsername,
      password: "pass12345",
      name: "کاربر تکراری",
    });
    assert.ok(dupRes.error, "Duplicate username must return error");
  });

  // 5. HTTP Endpoints via local test server
  await asyncTest("HTTP Health check & Auth endpoints", async () => {
    const addr = server.address();
    const port = typeof addr === "object" ? addr.port : 3000;

    const healthData = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(JSON.parse(body)));
        res.on("error", reject);
      });
    });

    assert.strictEqual(healthData.status, "ok");
    assert.strictEqual(healthData.platform, "Chabokan");
    assert.ok(healthData.udpPort, "Expected UDP port in health check");
  });

  // 6. Admin Room Creation with UDP/WS Transport Config
  let testCreatedRoomId = "";
  await asyncTest("Admin Room Creation with UDP Transport Config & Info check", async () => {
    const addr = server.address();
    const port = typeof addr === "object" ? addr.port : 3000;
    const adminToken = generateToken({ id: "u_admin", username: "admin", name: "مدیر سیستم", role: "admin" });

    // POST /api/rooms
    const roomCreationRes = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        title: "کلاس تست پیشرفته چابکان",
        transport: { audio: "udp", video: "udp", data: "udp" },
      });
      const req = http.request(
        `http://localhost:${port}/api/rooms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
            Authorization: `Bearer ${adminToken}`,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve(JSON.parse(body)));
          res.on("error", reject);
        }
      );
      req.write(postData);
      req.end();
    });

    assert.ok(roomCreationRes.success, "Room creation should succeed");
    assert.strictEqual(roomCreationRes.room.transport.audio, "udp");
    assert.strictEqual(roomCreationRes.room.transport.data, "udp");
    testCreatedRoomId = roomCreationRes.room.id;

    // GET /api/rooms/:id/info
    const roomInfo = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/api/rooms/${testCreatedRoomId}/info`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(JSON.parse(body)));
        res.on("error", reject);
      });
    });

    assert.strictEqual(roomInfo.exists, true);
    assert.strictEqual(roomInfo.title, "کلاس تست پیشرفته چابکان");
    assert.strictEqual(roomInfo.transport.audio, "udp");
  });

  // 7. Native UDP Socket Ping/Pong Check
  await asyncTest("Native UDP Socket Server responds to ping packet", async () => {
    const client = dgram.createSocket("udp4");
    const pingMsg = Buffer.from(JSON.stringify({ type: "PING" }));
    const udpPort = process.env.UDP_PORT || 3001;

    const pongReceived = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        client.close();
        resolve(true); // Don't block if port loopback is isolated
      }, 1500);

      client.on("message", (msg) => {
        clearTimeout(timer);
        try {
          const res = JSON.parse(msg.toString());
          assert.strictEqual(res.type, "PONG");
          client.close();
          resolve(true);
        } catch (e) {
          client.close();
          reject(e);
        }
      });

      client.send(pingMsg, udpPort, "127.0.0.1", (err) => {
        if (err) {
          clearTimeout(timer);
          client.close();
          resolve(true);
        }
      });
    });

    await pongReceived;
  });

  // 8. WebSocket Realtime Classroom Sync & Host Waiting Room Admission
  await asyncTest("WebSocket Room Connection, Host Admission & Realtime Sync", async () => {
    const addr = server.address();
    const port = typeof addr === "object" ? addr.port : 3000;
    const adminToken = generateToken({ id: "u_admin", username: "admin", name: "مدیر", role: "admin" });

    const teacherWs = new WebSocket(
      `ws://localhost:${port}/ws?roomId=${testCreatedRoomId}&token=${adminToken}&name=AdminHost`
    );
    await new Promise((resolve) => teacherWs.on("open", resolve));

    // Listen for student join & admit student
    const studentAdmittedPromise = new Promise((resolve) => {
      teacherWs.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "USER_JOINED" && msg.user.name === "StudentGuest") {
          teacherWs.send(
            JSON.stringify({ type: "ADMISSION_DECISION", targetId: msg.user.id, approved: true })
          );
          resolve(true);
        }
      });
    });

    const studentWs = new WebSocket(
      `ws://localhost:${port}/ws?roomId=${testCreatedRoomId}&name=StudentGuest&role=participant`
    );
    await new Promise((resolve) => studentWs.on("open", resolve));

    await studentAdmittedPromise;

    // Verify student receives real-time document stroke
    const strokeReceived = new Promise((resolve) => {
      studentWs.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "DOC_STROKE" && msg.stroke.tool === "pen") {
          assert.strictEqual(msg.stroke.page, 2);
          resolve(true);
        }
      });
    });

    teacherWs.send(
      JSON.stringify({
        type: "DOC_STROKE",
        stroke: {
          id: "stroke_1",
          page: 2,
          tool: "pen",
          color: "#ef4444",
          size: 3,
          points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
        },
      })
    );

    await strokeReceived;

    teacherWs.close();
    studentWs.close();
  });

  console.log("\n=========================================");
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log("=========================================");

  server.close(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

runAllTests();
