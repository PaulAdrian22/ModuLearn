// Authentication Routes
// Defines routes for user authentication

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../middleware/validators');

// POST /api/auth/register - Register new user
router.post('/register', validateRegistration, authController.register);

// POST /api/auth/login - Login user
router.post('/login', validateLogin, authController.login);

// GET /api/auth/verify - Verify token
router.get('/verify', authenticate, authController.verifyToken);

// POST /api/auth/logout - Logout user
router.post('/logout', authenticate, authController.logout);


module.exports = router;
