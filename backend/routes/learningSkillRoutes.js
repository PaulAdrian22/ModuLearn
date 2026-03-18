// Learning Skill Routes
// Defines routes for learning skill tracking

const express = require('express');
const router = express.Router();
const learningSkillController = require('../controllers/learningSkillController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');

// GET /api/learning-skills - Get all user's learning skills
router.get('/', authenticate, learningSkillController.getUserLearningSkills);

// GET /api/learning-skills/category/:category - Get skills by category
router.get('/category/:category', authenticate, learningSkillController.getSkillsByCategory);

// GET /api/learning-skills/analytics - Get skill analytics
router.get('/analytics', authenticate, learningSkillController.getSkillAnalytics);

// POST /api/learning-skills - Create skill evaluation
router.post('/', authenticate, [
  body('assessmentId').isInt({ min: 1 }).withMessage('Assessment ID is required'),
  body('skillCategory').isIn(['Memorization', 'Analytical Thinking', 'Critical Thinking', 'Problem-Solving', 'Technical Comprehension'])
    .withMessage('Invalid skill category'),
  body('scorePercentage').isFloat({ min: 0, max: 100 }).withMessage('Score percentage must be between 0 and 100'),
  handleValidationErrors
], learningSkillController.createSkillEvaluation);

module.exports = router;
