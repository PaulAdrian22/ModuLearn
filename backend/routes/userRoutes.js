// User Routes
// Defines routes for user management

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');
const upload = require('../middleware/upload');

// GET /api/users/profile - Get user profile
router.get('/profile', authenticate, userController.getUserProfile);

// PUT /api/users/profile - Update user profile
router.put('/profile', authenticate, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('age').optional().isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  handleValidationErrors
], userController.updateUserProfile);

// POST /api/users/change-password - Change password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  handleValidationErrors
], userController.changePassword);

// GET /api/users/stats - Get user statistics
router.get('/stats', authenticate, userController.getUserStats);

// GET /api/users/learning-progress-summary - Get detailed learning progress summary
router.get('/learning-progress-summary', authenticate, userController.getLearningProgressSummary);

// POST /api/users/upload-picture - Upload profile picture
router.post('/upload-picture', authenticate, upload.single('profilePicture'), userController.uploadProfilePicture);

// POST /api/users/select-avatar - Select default avatar
router.post('/select-avatar', authenticate, [
  body('avatarName').notEmpty().withMessage('Avatar name is required'),
  handleValidationErrors
], userController.selectDefaultAvatar);

// DELETE /api/users/delete-picture - Delete profile picture
router.delete('/delete-picture', authenticate, userController.deleteProfilePicture);

// Admin routes for user management
const { requireAdmin } = require('../middleware/auth');

// GET /api/users/all - Get all users (admin only)
router.get('/all', authenticate, userController.getAllUsers);

// GET /api/users/:id/details - Get detailed user info (admin only)
router.get('/:id/details', authenticate, requireAdmin, userController.getUserDetails);

// DELETE /api/users/delete/:id - Delete user account (admin or self)
router.delete('/delete/:id', authenticate, userController.deleteUser);

// POST /api/users/report-issue - Submit an issue report
router.post('/report-issue', authenticate, [
  body('issueType').notEmpty().withMessage('Issue type is required'),
  body('details').notEmpty().withMessage('Details are required'),
  handleValidationErrors
], userController.reportIssue);

module.exports = router;
