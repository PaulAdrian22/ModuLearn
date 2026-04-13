// Progress Routes
// Defines routes for progress tracking

const express = require('express');
const router = express.Router();
const progressController = require('../controllers/progressController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');

// GET /api/progress - Get all user progress
router.get('/', authenticate, progressController.getUserProgress);

// GET /api/progress/:moduleId - Get progress for specific module
router.get('/:moduleId', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Module ID must be a positive integer'),
  handleValidationErrors
], progressController.getModuleProgress);

// POST /api/progress/start - Start a module
router.post('/start', authenticate, [
  body('moduleId').isInt({ min: 1 }).withMessage('Module ID is required'),
  handleValidationErrors
], progressController.startModule);

// PUT /api/progress/update - Update module progress
router.put('/update', authenticate, [
  body('moduleId').isInt({ min: 1 }).withMessage('Module ID is required'),
  body('completionRate').isFloat({ min: 0, max: 100 }).withMessage('Completion rate must be between 0 and 100'),
  handleValidationErrors
], progressController.updateProgress);

// POST /api/progress/track-time - Track active lesson time while learner is inside a lesson
router.post('/track-time', authenticate, [
  body('moduleId').isInt({ min: 1 }).withMessage('Module ID is required'),
  body('timeSpentSeconds').isInt({ min: 1, max: 3600 }).withMessage('timeSpentSeconds must be between 1 and 3600'),
  handleValidationErrors
], progressController.trackLessonTime);

module.exports = router;
