// Assessment Routes
// Defines routes for assessment management

const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');

// POST /api/assessments - Create new assessment
router.post('/', authenticate, [
  body('ModuleID').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  body('AssessmentType').isIn(['Pre-assessment', 'Quiz', 'Post-assessment']).withMessage('Invalid assessment type'),
  handleValidationErrors
], assessmentController.createAssessment);

// POST /api/assessments/submit-answer - Submit answer to question
router.post('/submit-answer', authenticate, [
  body('AssessmentID').isInt({ min: 1 }).withMessage('Valid assessment ID is required'),
  body('QuestionID').isInt({ min: 1 }).withMessage('Valid question ID is required'),
  body('UserAnswer').trim().notEmpty().withMessage('Answer is required'),
  handleValidationErrors
], assessmentController.submitAnswer);

// POST /api/assessments/:id/complete - Complete assessment
router.post('/:id/complete', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid assessment ID'),
  handleValidationErrors
], assessmentController.completeAssessment);

// GET /api/assessments/my-assessments - Get user's assessments
router.get('/my-assessments', authenticate, assessmentController.getUserAssessments);

// GET /api/assessments/:id - Get assessment details
router.get('/:id', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid assessment ID'),
  handleValidationErrors
], assessmentController.getAssessmentDetails);

module.exports = router;
