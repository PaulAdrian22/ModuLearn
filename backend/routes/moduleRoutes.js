// Module Routes
// Defines routes for module management

const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/moduleController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');

// GET /api/modules - Get all modules
router.get('/', moduleController.getAllModules);

// GET /api/modules/:id - Get module by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  handleValidationErrors
], moduleController.getModuleById);

// POST /api/modules - Create new module
router.post('/', authenticate, [
  body('ModuleTitle').trim().notEmpty().withMessage('Module title is required'),
  body('Description').optional().trim(),
  body('LessonOrder').isInt({ min: 1 }).withMessage('Lesson order must be a positive integer'),
  handleValidationErrors
], moduleController.createModule);

// PUT /api/modules/:id - Update module
router.put('/:id', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('ModuleTitle').optional().trim().notEmpty().withMessage('Module title cannot be empty'),
  body('Description').optional().trim(),
  body('LessonOrder').optional().isInt({ min: 1 }).withMessage('Lesson order must be a positive integer'),
  handleValidationErrors
], moduleController.updateModule);

// DELETE /api/modules/:id - Delete module
router.delete('/:id', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  handleValidationErrors
], moduleController.deleteModule);

// GET /api/modules/:id/questions - Get module questions
router.get('/:id/questions', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  handleValidationErrors
], moduleController.getModuleQuestions);

module.exports = router;
