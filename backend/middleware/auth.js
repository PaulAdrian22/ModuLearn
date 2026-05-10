// Authentication Middleware
// Verifies JWT tokens and enforces single-active-session per user.

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Cache the result of column existence so we don't DESCRIBE on every request.
let sessionVersionColumnPresence = null; // null = unknown, true/false = cached
const checkSessionVersionColumn = async () => {
  if (sessionVersionColumnPresence !== null) return sessionVersionColumnPresence;
  try {
    const cols = await query('DESCRIBE user');
    sessionVersionColumnPresence = cols.some((c) => c.Field === 'session_version');
  } catch (error) {
    // If we can't even read the schema, fail-open (don't lock everyone out
    // because of a transient DB issue). Re-check on the next request.
    console.warn('checkSessionVersionColumn failed:', error?.code || error?.message);
    return false;
  }
  return sessionVersionColumnPresence;
};

const verifySessionVersion = async (decoded) => {
  // If the column doesn't exist yet (e.g. fresh deploy before any login),
  // skip the check rather than 401-ing every authenticated request.
  const columnPresent = await checkSessionVersionColumn();
  if (!columnPresent) return { ok: true };

  const tokenVersion = Number(decoded?.sessionVersion ?? 0);

  try {
    const rows = await query(
      'SELECT session_version FROM user WHERE UserID = ?',
      [decoded.userId]
    );
    if (!rows || rows.length === 0) {
      return { ok: false, reason: 'USER_NOT_FOUND' };
    }
    const currentVersion = Number(rows[0].session_version || 0);
    // Old tokens issued before this feature shipped have sessionVersion = 0
    // (or undefined). Treat them as valid until the user signs in again.
    if (tokenVersion === 0 && currentVersion > 0) {
      return { ok: false, reason: 'SESSION_REPLACED' };
    }
    if (tokenVersion !== currentVersion) {
      return { ok: false, reason: 'SESSION_REPLACED' };
    }
    return { ok: true };
  } catch (error) {
    console.warn('verifySessionVersion query failed:', error?.code || error?.message);
    // Fail-open on transient errors so a DB blip doesn't sign everyone out.
    return { ok: true };
  }
};

// Verify JWT token + session version.
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const sessionCheck = await verifySessionVersion(decoded);
    if (!sessionCheck.ok) {
      const message = sessionCheck.reason === 'SESSION_REPLACED'
        ? 'You signed in on another device. Please sign in again.'
        : 'Account no longer exists.';
      return res.status(401).json({
        error: 'Unauthorized',
        code: sessionCheck.reason,
        message
      });
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      name: decoded.name,
      role: decoded.role || 'student'
    };

    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'INVALID_TOKEN',
        message: 'Invalid token'
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
};

// Optional authentication (doesn't fail if no token).
// We still apply the session-version check when a token is present so a
// stale token never silently grants access to optionally-protected routes.
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const sessionCheck = await verifySessionVersion(decoded);
      if (sessionCheck.ok) {
        req.user = {
          userId: decoded.userId,
          username: decoded.username,
          name: decoded.name,
          role: decoded.role || 'student'
        };
      }
    }

    next();

  } catch (error) {
    // Continue without authentication on any error.
    next();
  }
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin
};
