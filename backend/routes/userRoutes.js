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
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('username').optional().trim()
    .isLength({ min: 3, max: 100 }).withMessage('Username must be 3-100 characters')
    .matches(/^[A-Za-z0-9._@-]+$/).withMessage('Username may only contain letters, numbers, and . _ - @'),
  body('age').optional().isInt({ min: 15, max: 65 }).withMessage('Age must be between 15 and 65'),
  body('educationalBackground').optional().trim(),
  body('preferredLanguage')
    .optional()
    .isIn(['English', 'Taglish', 'Filipino'])
    .withMessage('Preferred language must be English or Taglish'),
  handleValidationErrors
], userController.updateUserProfile);

// POST /api/users/change-password - Change password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Password must contain at least one number or special character'),
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

// PUT /api/users/archive/:id - Archive user account (admin only)
router.put('/archive/:id', authenticate, requireAdmin, userController.archiveUser);

// PUT /api/users/unarchive/:id - Restore an archived user (admin only)
router.put('/unarchive/:id', authenticate, requireAdmin, userController.unarchiveUser);

// DELETE /api/users/:id - Permanently delete user (admin only; usually called from the archived list)
router.delete('/:id', authenticate, requireAdmin, userController.deleteUser);

// POST /api/users/report-issue - Submit an issue report
router.post('/report-issue', authenticate, [
  body('issueType').notEmpty().withMessage('Issue type is required'),
  body('details').notEmpty().withMessage('Details are required'),
  handleValidationErrors
], userController.reportIssue);

// GET /api/users/notifications - Get user notifications
router.get('/notifications', authenticate, userController.getUserNotifications);

// PUT /api/users/notifications/read-all - Mark all notifications as read
router.put('/notifications/read-all', authenticate, userController.markAllNotificationsRead);

// PUT /api/users/notifications/:id/read - Mark a single notification as read
router.put('/notifications/:id/read', authenticate, userController.markNotificationRead);

module.exports = router;
