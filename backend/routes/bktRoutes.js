// ==============================================
// BKT ROUTES
// Bayesian Knowledge Tracing - Full API Routes
// ==============================================

const express = require('express');
const router = express.Router();
const bktController = require('../controllers/bktController');
const { authenticate } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');

// ==============================================
// INITIALIZATION
// ==============================================

// POST /api/bkt/initialize-all - Initialize all 5 skills for a user
router.post('/initialize-all', authenticate, bktController.initializeAllSkills);

// POST /api/bkt/initialize - Initialize a single skill (backward compatible)
router.post('/initialize', authenticate, [
  body('skillName').trim().notEmpty().withMessage('Skill name is required'),
  handleValidationErrors
], bktController.initializeSkillKnowledge);

// ==============================================
// KNOWLEDGE STATES
// ==============================================

// GET /api/bkt/knowledge-states - Get all user's knowledge states
router.get('/knowledge-states', authenticate, bktController.getUserKnowledgeStates);

// GET /api/bkt/knowledge-states/:skillName - Get knowledge state for specific skill
router.get('/knowledge-states/:skillName', authenticate, bktController.getSkillKnowledgeState);

// ==============================================
// INITIAL ASSESSMENT
// ==============================================

// POST /api/bkt/initial-assessment/start - Start initial assessment (35 questions)
router.post('/initial-assessment/start', authenticate, bktController.startInitialAssessment);

// POST /api/bkt/initial-assessment/complete - Complete initial assessment
router.post('/initial-assessment/complete', authenticate, [
  body('sessionId').isInt({ min: 1 }).withMessage('Valid session ID is required'),
  handleValidationErrors
], bktController.completeInitialAssessment);

// ==============================================
// ANSWER SUBMISSION (Universal)
// ==============================================

// POST /api/bkt/submit-answer - Submit answer during any assessment (applies BKT item interaction)
router.post('/submit-answer', authenticate, [
  body('sessionId').isInt({ min: 1 }).withMessage('Valid session ID is required'),
  body('questionId').isInt({ min: 1 }).withMessage('Valid question ID is required'),
  body('userAnswer').trim().notEmpty().withMessage('Answer is required'),
  handleValidationErrors
], bktController.submitAnswer);

// ==============================================
// LESSON ASSESSMENTS
// ==============================================

// POST /api/bkt/lesson/:moduleId/diagnostic/start - Start diagnostic for a lesson
router.post('/lesson/:moduleId/diagnostic/start', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.startDiagnostic);

// POST /api/bkt/lesson/:moduleId/diagnostic/submit - Submit diagnostic answer (no BKT update)
router.post('/lesson/:moduleId/diagnostic/submit', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  body('sessionId').isInt({ min: 1 }).withMessage('Valid session ID is required'),
  body('questionId').isInt({ min: 1 }).withMessage('Valid question ID is required'),
  body('userAnswer').trim().notEmpty().withMessage('Answer is required'),
  handleValidationErrors
], bktController.submitDiagnosticAnswer);

// POST /api/bkt/lesson/:moduleId/review/start - Start review assessment
router.post('/lesson/:moduleId/review/start', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.startReviewAssessment);

// POST /api/bkt/lesson/:moduleId/simulation/start - Start simulation assessment
router.post('/lesson/:moduleId/simulation/start', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.startSimulationAssessment);

// POST /api/bkt/lesson/:moduleId/final/start - Start final assessment
router.post('/lesson/:moduleId/final/start', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.startFinalAssessment);

// POST /api/bkt/lesson/:moduleId/complete - Complete a lesson assessment (Review/Simulation/Final)
router.post('/lesson/:moduleId/complete', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  body('sessionId').isInt({ min: 1 }).withMessage('Valid session ID is required'),
  handleValidationErrors
], bktController.completeLessonAssessment);

// ==============================================
// MASTERY COMPUTATION
// ==============================================

// POST /api/bkt/lesson/:moduleId/compute-mastery - Compute lesson mastery (MLesson, WMLesson)
router.post('/lesson/:moduleId/compute-mastery', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.computeLessonMasteryEndpoint);

// POST /api/bkt/compute-overall-mastery - Compute overall mastery across all lessons
router.post('/compute-overall-mastery', authenticate, bktController.computeOverallMasteryEndpoint);

// ==============================================
// LESSON MASTERY VIEWS
// ==============================================

// GET /api/bkt/lesson-mastery - Get mastery overview for all lessons
router.get('/lesson-mastery', authenticate, bktController.getLessonMasteryOverview);

// GET /api/bkt/lesson-mastery/:moduleId - Get mastery for a specific lesson
router.get('/lesson-mastery/:moduleId', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.getLessonMastery);

// ==============================================
// RETAKE
// ==============================================

// GET /api/bkt/lesson/:moduleId/retake-info - Get retake info for a lesson
router.get('/lesson/:moduleId/retake-info', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.getRetakeInfo);

// GET /api/bkt/lesson/:moduleId/final/history - Get final assessment attempt history
router.get('/lesson/:moduleId/final/history', authenticate, [
  param('moduleId').isInt({ min: 1 }).withMessage('Valid module ID is required'),
  handleValidationErrors
], bktController.getFinalAssessmentHistory);

// ==============================================
// SESSION MANAGEMENT
// ==============================================

// GET /api/bkt/session/active - Get active session
router.get('/session/active', authenticate, bktController.getActiveSession);

// POST /api/bkt/session/:sessionId/abandon - Abandon active session
router.post('/session/:sessionId/abandon', authenticate, [
  param('sessionId').isInt({ min: 1 }).withMessage('Valid session ID is required'),
  handleValidationErrors
], bktController.abandonSession);

// ==============================================
// RECOMMENDATION
// ==============================================

// GET /api/bkt/recommendation - Get recommended skill to practice
router.get('/recommendation', authenticate, bktController.getRecommendation);

// ==============================================
// BACKWARD COMPATIBLE ENDPOINTS
// ==============================================

// POST /api/bkt/update - Single skill update (legacy)
router.post('/update', authenticate, [
  body('skillName').trim().notEmpty().withMessage('Skill name is required'),
  body('isCorrect').isBoolean().withMessage('isCorrect must be a boolean'),
  handleValidationErrors
], bktController.updateKnowledge);

// POST /api/bkt/batch-update - Batch update (legacy, used by existing frontend)
router.post('/batch-update', authenticate, [
  body('answers').isArray({ min: 1 }).withMessage('answers array is required'),
  handleValidationErrors
], bktController.batchUpdateKnowledge);

module.exports = router;
