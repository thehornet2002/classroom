const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db } = require("./db");

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || path.join(__dirname, "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Ingest and save recorded webm file
function saveRecording({ sessionId, courseId, title, teacherName, durationSeconds, stream, res }) {
  const id = `rec_${crypto.randomUUID().slice(0, 10)}`;
  const filename = `${id}_${Date.now()}.webm`;
  const filePath = path.join(RECORDINGS_DIR, filename);

  const fileStream = fs.createWriteStream(filePath);
  let totalBytes = 0;

  stream.on("data", (chunk) => {
    totalBytes += chunk.length;
  });

  stream.pipe(fileStream);

  fileStream.on("finish", () => {
    const now = Date.now();
    const finalCourseId = courseId || "c_general";
    const finalTitle = title || `جلسه ضبط‌شده - ${new Date().toLocaleDateString("fa-IR")}`;

    db.prepare(`
      INSERT INTO recordings (id, session_id, course_id, title, filename, filesize, duration_seconds, teacher_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId || "default", finalCourseId, finalTitle, filename, totalBytes, durationSeconds || 0, teacherName || "استاد", now);

    res.json({
      status: "success",
      recordingId: id,
      filename,
      filesize: totalBytes,
      downloadUrl: `/api/recordings/${id}/download`,
      streamUrl: `/api/recordings/${id}/stream`,
    });
  });

  fileStream.on("error", (err) => {
    console.error("Error saving recording file:", err);
    res.status(500).json({ error: "خطا در ذخیره‌سازی فایل ضبط روی دیسک سرور" });
  });
}

// Stream video with HTTP 206 Partial Content (Supports fast-forward & seeking in browser)
function streamRecording(req, res, id) {
  const rec = db.prepare("SELECT * FROM recordings WHERE id = ?").get(id);
  if (!rec) {
    return res.status(404).json({ error: "فایل ویدیوی ضبط‌شده یافت نشد." });
  }

  const filePath = path.join(RECORDINGS_DIR, rec.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "فایل ویدیو روی سرور یافت نشد." });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/webm",
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/webm",
      "Accept-Ranges": "bytes",
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

// Direct Download Attachment
function downloadRecording(res, id) {
  const rec = db.prepare("SELECT * FROM recordings WHERE id = ?").get(id);
  if (!rec) {
    return res.status(404).json({ error: "رکورد یافت نشد." });
  }

  const filePath = path.join(RECORDINGS_DIR, rec.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "فایل روی سرور موجود نیست." });
  }

  const ext = path.extname(rec.filename) || ".webm";
  const safeFilename = `Classroom-${rec.title.replace(/[\/\\?%*:|"<>]/g, "_")}${ext}`;
  res.download(filePath, safeFilename);
}

// Get all recordings
function listAllRecordings() {
  return db.prepare(`
    SELECT r.*, c.title as course_title, c.code as course_code
    FROM recordings r
    LEFT JOIN courses c ON r.course_id = c.id
    ORDER BY r.created_at DESC
  `).all();
}

module.exports = {
  saveRecording,
  streamRecording,
  downloadRecording,
  listAllRecordings,
  RECORDINGS_DIR,
};
