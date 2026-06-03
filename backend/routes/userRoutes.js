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

// GET /api/users/certificate/:userId — download generated certificate (learner only)
router.get('/certificate/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.user.userId;

    // Only allow users to download their own certificate
    if (Number(userId) !== Number(authenticatedUserId)) {
      return res.status(403).json({ error: 'Unauthorized', message: 'You can only download your own certificate.' });
    }

    if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Invalid user ID.' });

    // Reuse admin certificate generation logic
    const { query } = require('../config/database');
    const fs = require('fs');
    const path = require('path');

    const CERT_TEMPLATE_DIR = path.join(__dirname, '..', 'uploads', 'cert-template');
    const CERT_META_FILE = path.join(CERT_TEMPLATE_DIR, 'meta.json');

    const getCertMeta = () => {
      try {
        if (fs.existsSync(CERT_META_FILE)) {
          return JSON.parse(fs.readFileSync(CERT_META_FILE, 'utf8'));
        }
      } catch {}
      return null;
    };

    const meta = getCertMeta();
    if (!meta) return res.status(404).json({ error: 'No certificate template available.' });

    const users = await query('SELECT Name FROM user WHERE UserID = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'User not found.' });

    const userName = users[0].Name;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const templatePath = path.join(CERT_TEMPLATE_DIR, meta.filename);
    if (!fs.existsSync(templatePath)) return res.status(404).json({ error: 'Template file missing.' });

    const DEFAULT_CERT_TEXT_CONFIG = {
      name: { x: 15, y: 42, width: 70, height: 12 },
      date: { x: 25, y: 57, width: 50, height: 8 }
    };

    const saved = meta.textConfig || {};
    const textConfig = {
      name: { ...DEFAULT_CERT_TEXT_CONFIG.name, ...(saved.name || {}) },
      date: { ...DEFAULT_CERT_TEXT_CONFIG.date, ...(saved.date || {}) }
    };

    if (meta.mimetype.startsWith('image/')) {
      return res.json({
        type: 'image',
        templateUrl: `/uploads/cert-template/${meta.filename}`,
        userName,
        date,
        textConfig
      });
    }

    // PDF: stamp name + date using pdf-lib at saved positions
    let PDFDocument, rgb, StandardFonts;
    try {
      ({ PDFDocument, rgb, StandardFonts } = require('pdf-lib'));
    } catch {
      return res.status(500).json({ error: 'PDF library not available.' });
    }

    const existingBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingBytes);

    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const pages = pdfDoc.getPages();
    const page = pages[0];
    const { width, height } = page.getSize();

    const drawField = (text, zone) => {
      const zoneLeft   = (zone.x / 100) * width;
      const zoneW      = (zone.width  / 100) * width;
      const zoneH      = (zone.height / 100) * height;
      const pdfYBottom = (1 - (zone.y + zone.height) / 100) * height;

      const autoSize = Math.max(8, Math.min(120, Math.floor(zoneH * 0.55)));
      const textWidth = boldFont.widthOfTextAtSize(text, autoSize);

      const drawX = zoneLeft + Math.max(0, (zoneW - textWidth) / 2);
      const drawY = pdfYBottom + (zoneH - autoSize) / 2;

      page.drawText(text, { x: Math.max(0, drawX), y: Math.max(0, drawY), size: autoSize, font: boldFont, color: rgb(0, 0, 0) });
    };

    drawField(userName, textConfig.name);
    drawField(date, textConfig.date);

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${userId}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Certificate download error:', err);
    res.status(500).json({ error: 'Failed to download certificate.' });
  }
});

module.exports = router;
