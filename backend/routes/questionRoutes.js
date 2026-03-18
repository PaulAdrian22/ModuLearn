// Question Routes
// Defines routes for question management

const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');

// GET /api/questions - Get all questions
router.get('/', questionController.getAllQuestions);

// GET /api/questions/:id - Get question by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid question ID'),
  handleValidationErrors
], questionController.getQuestionById);

// POST /api/questions - Create new question
router.post('/', authenticate, [
  body('ModuleID').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  body('QuestionText').trim().notEmpty().withMessage('Question text is required'),
  body('OptionA').trim().notEmpty().withMessage('Option A is required'),
  body('OptionB').trim().notEmpty().withMessage('Option B is required'),
  body('OptionC').optional().trim(),
  body('OptionD').optional().trim(),
  body('CorrectAnswer').trim().notEmpty().withMessage('Correct answer is required'),
  handleValidationErrors
], questionController.createQuestion);

// PUT /api/questions/:id - Update question
router.put('/:id', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid question ID'),
  body('QuestionText').optional().trim().notEmpty(),
  body('OptionA').optional().trim().notEmpty(),
  body('OptionB').optional().trim().notEmpty(),
  body('CorrectAnswer').optional().trim().notEmpty(),
  handleValidationErrors
], questionController.updateQuestion);

// DELETE /api/questions/:id - Delete question
router.delete('/:id', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid question ID'),
  handleValidationErrors
], questionController.deleteQuestion);

module.exports = router;
