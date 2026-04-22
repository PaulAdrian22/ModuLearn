const express = require('express');
const router = express.Router();
const simulationController = require('../controllers/simulationController');
const { authenticate } = require('../middleware/auth');

// Public/User routes
router.get('/', authenticate, simulationController.getAllSimulations);
router.get('/module/:moduleId', authenticate, simulationController.getSimulationsByModule);
router.get('/:id', authenticate, simulationController.getSimulation);
router.get('/:id/config', authenticate, simulationController.getSimulationRuntimeConfig);
router.post('/start', authenticate, simulationController.startSimulation);
router.post('/complete', authenticate, simulationController.completeSimulation);
router.get('/progress/:userId', authenticate, simulationController.getUserProgress);

module.exports = router;
