const express = require('express');
const router = express.Router();
const simulationController = require('../controllers/simulationController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public/User routes
router.get('/', authenticate, simulationController.getAllSimulations);
router.get('/module/:moduleId', authenticate, simulationController.getSimulationsByModule);
router.get('/:id', authenticate, simulationController.getSimulation);
router.post('/start', authenticate, simulationController.startSimulation);
router.post('/complete', authenticate, simulationController.completeSimulation);
router.get('/progress/:userId', authenticate, simulationController.getUserProgress);

// Admin routes
router.post('/admin', authenticate, requireAdmin, simulationController.createSimulation);
router.put('/admin/:id', authenticate, requireAdmin, simulationController.updateSimulation);
router.delete('/admin/:id', authenticate, requireAdmin, simulationController.deleteSimulation);

module.exports = router;
