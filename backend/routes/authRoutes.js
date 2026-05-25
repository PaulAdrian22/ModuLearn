// Authentication Routes
// Defines routes for user authentication

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../middleware/validators');
const { query } = require('../config/database');

// POST /api/auth/register - Register new user
router.post('/register', validateRegistration, authController.register);

// POST /api/auth/login - Login user
router.post('/login', validateLogin, authController.login);

// GET /api/auth/verify - Verify token
router.get('/verify', authenticate, authController.verifyToken);

// POST /api/auth/logout - Logout user
router.post('/logout', authenticate, authController.logout);

// POST /api/auth/forgot-password - Submit a password reset request (notifies admin)
router.post('/forgot-password', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    if (!username) {
      return res.status(400).json({ message: 'Username is required.' });
    }

    // Ensure the table exists - use pool.query directly for DDL
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_requests (
          RequestID INT AUTO_INCREMENT PRIMARY KEY,
          Username VARCHAR(100) NOT NULL,
          RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          Resolved BOOLEAN NOT NULL DEFAULT FALSE
        )
      `);
    } catch (ddlError) {
      console.error('Failed to create password_reset_requests table:', ddlError);
      // Continue anyway - table might already exist
    }

    // Verify the username exists
    const users = await query('SELECT UserID, Name FROM user WHERE Username = ? LIMIT 1', [username]);
    if (!users.length) {
      // Return success anyway to avoid username enumeration
      return res.json({ message: 'If that username exists, the admin has been notified.' });
    }

    // Insert the reset request
    await query(
      'INSERT INTO password_reset_requests (Username, RequestedAt) VALUES (?, NOW())',
      [username]
    );

    res.json({ message: 'Your request has been sent. The admin will reset your password shortly.' });
  } catch (error) {
    console.error('Forgot password error:', error.message || error);
    res.status(500).json({ message: 'Failed to submit request. Please try again.' });
  }
});

// POST /api/auth/forgot-password/:id/resolve - Admin marks a reset request resolved
router.post('/forgot-password/:id/resolve', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid request ID.' });
    await query('UPDATE password_reset_requests SET Resolved = TRUE WHERE RequestID = ?', [id]);
    res.json({ message: 'Request resolved.' });
  } catch (error) {
    console.error('Resolve forgot-password error:', error);
    res.status(500).json({ message: 'Failed to resolve request.' });
  }
});

module.exports = router;
