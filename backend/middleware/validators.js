// Input Validation Middleware
// Validates and sanitizes user input

const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      errors: errors.array()
    });
  }
  
  next();
};

// User registration validation
const validateRegistration = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  
  body('age')
    .optional()
    .isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  
  body('educationalBackground')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Educational background must be max 100 characters'),
  
  handleValidationErrors
];

// User login validation
const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  handleValidationErrors
];

// Module creation validation
const validateModule = [
  body('moduleTitle')
    .trim()
    .notEmpty().withMessage('Module title is required')
    .isLength({ min: 3, max: 200 }).withMessage('Module title must be 3-200 characters'),
  
  body('description')
    .optional()
    .trim(),
  
  body('lessonOrder')
    .notEmpty().withMessage('Lesson order is required')
    .isInt({ min: 1 }).withMessage('Lesson order must be a positive integer'),
  
  body('tesdaReference')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('TESDA reference must be max 100 characters'),
  
  handleValidationErrors
];

// Question creation validation
const validateQuestion = [
  body('moduleId')
    .notEmpty().withMessage('Module ID is required')
    .isInt({ min: 1 }).withMessage('Module ID must be a positive integer'),
  
  body('questionText')
    .trim()
    .notEmpty().withMessage('Question text is required'),
  
  body('correctAnswer')
    .trim()
    .notEmpty().withMessage('Correct answer is required'),
  
  handleValidationErrors
];

// Assessment submission validation
const validateAssessment = [
  body('assessmentType')
    .notEmpty().withMessage('Assessment type is required')
    .isIn(['Pre-Test', 'Quiz', 'Post-Test']).withMessage('Invalid assessment type'),
  
  handleValidationErrors
];

// Answer submission validation
const validateAnswer = [
  body('assessmentId')
    .notEmpty().withMessage('Assessment ID is required')
    .isInt({ min: 1 }).withMessage('Assessment ID must be a positive integer'),
  
  body('questionId')
    .notEmpty().withMessage('Question ID is required')
    .isInt({ min: 1 }).withMessage('Question ID must be a positive integer'),
  
  body('userAnswer')
    .trim()
    .notEmpty().withMessage('User answer is required'),
  
  handleValidationErrors
];

// Progress update validation
const validateProgress = [
  body('moduleId')
    .notEmpty().withMessage('Module ID is required')
    .isInt({ min: 1 }).withMessage('Module ID must be a positive integer'),
  
  body('completionRate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Completion rate must be between 0 and 100'),
  
  handleValidationErrors
];

// ID parameter validation
const validateId = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID must be a positive integer'),
  
  handleValidationErrors
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateModule,
  validateQuestion,
  validateAssessment,
  validateAnswer,
  validateProgress,
  validateId,
  handleValidationErrors
};
