const { db } = require("./db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// Authenticate user by username and password
function loginUser(username, password) {
  const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
  const user = stmt.get(username.trim().toLowerCase());

  if (!user) {
    return { error: "نام کاربری یا رمز عبور اشتباه است." };
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return { error: "نام کاربری یا رمز عبور اشتباه است." };
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

// Create new user (Admin or Teacher)
function createUser({ username, password, name, email, role }) {
  const cleanUsername = username.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
  if (existing) {
    return { error: "این نام کاربری قبلاً ثبت شده است." };
  }

  const id = `u_${crypto.randomUUID().slice(0, 8)}`;
  const password_hash = bcrypt.hashSync(password, 10);
  const now = Date.now();

  const insert = db.prepare(`
    INSERT INTO users (id, username, password_hash, name, email, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(id, cleanUsername, password_hash, name.trim(), email || "", role || "student", now);

  return {
    user: {
      id,
      username: cleanUsername,
      name: name.trim(),
      email: email || "",
      role: role || "student",
    },
  };
}

// Get user list
function listUsers() {
  const users = db.prepare("SELECT id, username, name, email, role, created_at FROM users ORDER BY created_at DESC").all();
  return users;
}

// Delete user
function deleteUser(userId) {
  db.prepare("DELETE FROM enrollments WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return { success: true };
}

// Get courses for a specific user (Teachers see their courses, Students see enrolled courses, Admin sees all)
function getUserDashboard(userId, role) {
  let courses = [];

  if (role === "admin") {
    courses = db.prepare(`
      SELECT c.*, u.name as teacher_name
      FROM courses c
      JOIN users u ON c.teacher_id = u.id
      ORDER BY c.created_at DESC
    `).all();
  } else if (role === "teacher") {
    courses = db.prepare(`
      SELECT c.*, u.name as teacher_name
      FROM courses c
      JOIN users u ON c.teacher_id = u.id
      WHERE c.teacher_id = ?
      ORDER BY c.created_at DESC
    `).all(userId);
  } else {
    courses = db.prepare(`
      SELECT c.*, u.name as teacher_name
      FROM courses c
      JOIN enrollments e ON c.id = e.course_id
      JOIN users u ON c.teacher_id = u.id
      WHERE e.user_id = ?
      ORDER BY c.created_at DESC
    `).all(userId);
  }

  // Get active and upcoming sessions for these courses
  const courseIds = courses.map((c) => c.id);
  let sessions = [];
  let recordings = [];

  if (courseIds.length > 0) {
    const placeholders = courseIds.map(() => "?").join(",");
    sessions = db.prepare(`
      SELECT s.*, c.title as course_title, c.code as course_code, u.name as teacher_name
      FROM class_sessions s
      JOIN courses c ON s.course_id = c.id
      JOIN users u ON s.teacher_id = u.id
      WHERE s.course_id IN (${placeholders})
      ORDER BY s.scheduled_start ASC
    `).all(...courseIds);

    recordings = db.prepare(`
      SELECT r.*, c.title as course_title, c.code as course_code
      FROM recordings r
      JOIN courses c ON r.course_id = c.id
      WHERE r.course_id IN (${placeholders})
      ORDER BY r.created_at DESC
    `).all(...courseIds);
  }

  return {
    courses,
    sessions,
    recordings,
  };
}

// Create new course
function createCourse({ title, code, description, teacherId, coverColor }) {
  const id = `c_${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO courses (id, title, code, description, teacher_id, cover_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), code.trim().toUpperCase(), description || "", teacherId, coverColor || "#2563eb", now);

  return { id, title, code };
}

// Create new class session
function createSession({ courseId, title, teacherId, scheduledStart, scheduledEnd, hostPass }) {
  const id = `session-${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO class_sessions (id, course_id, title, teacher_id, scheduled_start, scheduled_end, status, host_pass, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, courseId, title.trim(), teacherId, scheduledStart, scheduledEnd, "scheduled", hostPass || "host123", now);

  return { id, title, courseId };
}

// Update session status (e.g. live, ended)
function updateSessionStatus(sessionId, status) {
  db.prepare("UPDATE class_sessions SET status = ? WHERE id = ?").run(status, sessionId);
}

module.exports = {
  loginUser,
  createUser,
  listUsers,
  deleteUser,
  getUserDashboard,
  createCourse,
  createSession,
  updateSessionStatus,
};
