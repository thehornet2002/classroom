const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { db } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "classroom-prod-super-secret-key-2026";
const TOKEN_EXPIRY = "7d";

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = (authHeader && authHeader.split(" ")[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ error: "دسترسی غیرمجاز: توکن ارسال نشده است." });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(403).json({ error: "توکن نامعتبر یا منقضی شده است." });
  }

  req.user = payload;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "شما دسترسی لازم برای این عملیات را ندارید." });
    }
    next();
  };
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken,
  requireRole,
  JWT_SECRET,
};
