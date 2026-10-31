const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "classroom.sqlite");

// Ensure data folder exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Initialize Tables
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      teacher_id TEXT NOT NULL,
      cover_color TEXT DEFAULT '#2563eb',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(course_id, user_id),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS class_sessions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      scheduled_start INTEGER NOT NULL,
      scheduled_end INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      host_pass TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      teacher_name TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managed_rooms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      transport_config TEXT NOT NULL,
      invite_token TEXT,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS server_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default server config if empty
  const configStmt = db.prepare("SELECT count(*) as count FROM server_config");
  if (configStmt.get().count === 0) {
    const insertConf = db.prepare("INSERT INTO server_config (key, value) VALUES (?, ?)");
    insertConf.run("web_domain", process.env.WEB_DOMAIN || "");
    insertConf.run("stream_host", process.env.STREAM_HOST || "");
    insertConf.run("stream_ws_port", process.env.STREAM_WS_PORT || "3000");
    insertConf.run("stream_udp_port", process.env.STREAM_UDP_PORT || "3001");
  }

  // Seed default admin and sample data if users table is empty
  const countStmt = db.prepare("SELECT count(*) as count FROM users");
  const userCount = countStmt.get().count;

  if (userCount === 0) {
    const now = Date.now();
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPasswordRaw = process.env.ADMIN_PASSWORD || "admin123";
    const adminPass = bcrypt.hashSync(adminPasswordRaw, 10);
    const teacherPass = bcrypt.hashSync("teacher123", 10);
    const studentPass = bcrypt.hashSync("student123", 10);

    // 1. Insert Users
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password_hash, name, email, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run("u_admin", adminUsername, adminPass, "مدیر ارشد کلاس", "admin@chabokan.net", "admin", now);
    insertUser.run("u_teacher", "dr.rezaei", teacherPass, "دکتر علی رضایی", "rezaei@university.ac.ir", "teacher", now);
    insertUser.run("u_student1", "student1", studentPass, "سارا محمدی", "sara@student.ac.ir", "student", now);
    insertUser.run("u_student2", "student2", studentPass, "امیرحسین کریمی", "amir@student.ac.ir", "student", now);

    // 2. Insert Courses
    const insertCourse = db.prepare(`
      INSERT INTO courses (id, title, code, description, teacher_id, cover_color, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertCourse.run(
      "c_math",
      "ریاضیات مهندسی پیشرفته",
      "MATH-401",
      "معادلات دیفرانسیل با مشتقات جزئی، تبدیل فوریه و آنالیز مختلط برای دانشجویان مهندسی",
      "u_teacher",
      "#3b82f6",
      now
    );

    insertCourse.run(
      "c_ai",
      "هوش مصنوعی و یادگیری عمیق",
      "CS-502",
      "مبانی شبکه‌های عصبی عمیق، پردازش زبان طبیعی و مدل‌های زایا",
      "u_teacher",
      "#8b5cf6",
      now
    );

    insertCourse.run(
      "c_cloud",
      "سیستم‌های توزیع‌شده و ابری",
      "CS-603",
      "معماری میکروسرویس‌ها، پلتفرم‌های ابری و ارتباطات زمان‌واقعی WebRTC",
      "u_teacher",
      "#10b981",
      now
    );

    // 3. Enroll students
    const insertEnrollment = db.prepare(`
      INSERT INTO enrollments (id, course_id, user_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    insertEnrollment.run("en_1", "c_math", "u_student1", now);
    insertEnrollment.run("en_2", "c_math", "u_student2", now);
    insertEnrollment.run("en_3", "c_ai", "u_student1", now);
    insertEnrollment.run("en_4", "c_cloud", "u_student2", now);

    // 4. Create class sessions (One Live Now, Others Scheduled)
    const insertSession = db.prepare(`
      INSERT INTO class_sessions (id, course_id, title, teacher_id, scheduled_start, scheduled_end, status, host_pass, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Live session right now
    insertSession.run(
      "session-math-live",
      "c_math",
      "جلسه آنلاین: آنالیز فوریه و سری‌های هارمونیک",
      "u_teacher",
      now - 15 * 60 * 1000,
      now + 75 * 60 * 1000,
      "live",
      "teacher123",
      now
    );

    // Scheduled upcoming sessions
    insertSession.run(
      "session-ai-upcoming",
      "c_ai",
      "جلسه اول: مبانی شبکه‌های عصبی و یادگیری نظارت‌شده",
      "u_teacher",
      now + 2 * 3600 * 1000,
      now + 4 * 3600 * 1000,
      "scheduled",
      "teacher123",
      now
    );

    insertSession.run(
      "session-cloud-upcoming",
      "c_cloud",
      "جلسه وبینار: بهینه‌سازی مدیا و WebRTC بر بستر داکر چابکان",
      "u_teacher",
      now + 24 * 3600 * 1000,
      now + 26 * 3600 * 1000,
      "scheduled",
      "teacher123",
      now
    );
  }
}

initSchema();

module.exports = {
  db,
};
