const { pool } = require('../config/database');

// Get all simulations
const getAllSimulations = async (req, res) => {
  try {
    const userId = req.query.userId;
    
    let query = `
      SELECT 
        s.*,
        sp.Score,
        sp.Attempts,
        sp.TimeSpent,
        sp.CompletionStatus,
        sp.DateCompleted
      FROM simulation s
      LEFT JOIN simulation_progress sp ON s.SimulationID = sp.SimulationID 
        ${userId ? 'AND sp.UserID = ?' : ''}
      ORDER BY s.SimulationOrder
    `;
    
    const [simulations] = userId 
      ? await pool.query(query, [userId])
      : await pool.query(query.replace('AND sp.UserID = ?', ''));
    
    res.json(simulations);
  } catch (error) {
    console.error('Error fetching simulations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get simulations by module
const getSimulationsByModule = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.query.userId;
    
    const query = `
      SELECT 
        s.*,
        sp.Score,
        sp.Attempts,
        sp.TimeSpent,
        sp.CompletionStatus,
        sp.DateCompleted
      FROM simulation s
      LEFT JOIN simulation_progress sp ON s.SimulationID = sp.SimulationID 
        AND sp.UserID = ?
      ORDER BY s.SimulationOrder
    `;
    
    const [simulations] = await pool.query(query, [userId || 0]);
    res.json(simulations);
  } catch (error) {
    console.error('Error fetching simulations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get single simulation
const getSimulation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId;
    
    const query = `
      SELECT 
        s.*,
        sp.Score,
        sp.Attempts,
        sp.TimeSpent,
        sp.CompletionStatus
      FROM simulation s
      LEFT JOIN simulation_progress sp ON s.SimulationID = sp.SimulationID 
        AND sp.UserID = ?
      WHERE s.SimulationID = ?
    `;
    
    const [simulations] = await pool.query(query, [userId || 0, id]);
    
    if (simulations.length === 0) {
      return res.status(404).json({ message: 'Simulation not found' });
    }
    
    res.json(simulations[0]);
  } catch (error) {
    console.error('Error fetching simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create simulation (Admin)
const createSimulation = async (req, res) => {
  try {
    const {
      simulationTitle,
      description,
      activityType,
      maxScore,
      timeLimit,
      simulationOrder,
      zoneData
    } = req.body;

    const query = `
      INSERT INTO simulation 
      (SimulationTitle, Description, ActivityType, MaxScore, TimeLimit, SimulationOrder, ZoneData)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await pool.query(query, [
      simulationTitle,
      description,
      activityType,
      maxScore || 10,
      timeLimit || 0,
      simulationOrder,
      zoneData ? JSON.stringify(zoneData) : null
    ]);
    
    res.status(201).json({
      message: 'Simulation created successfully',
      simulationId: result.insertId
    });
  } catch (error) {
    console.error('Error creating simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update simulation (Admin)
const updateSimulation = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      simulationTitle,
      description,
      activityType,
      maxScore,
      timeLimit,
      simulationOrder,
      zoneData
    } = req.body;

    const query = `
      UPDATE simulation 
      SET SimulationTitle = ?,
          Description = ?,
          ActivityType = ?,
          MaxScore = ?,
          TimeLimit = ?,
          SimulationOrder = ?,
          ZoneData = ?
      WHERE SimulationID = ?
    `;
    
    const [result] = await pool.query(query, [
      simulationTitle,
      description,
      activityType,
      maxScore,
      timeLimit,
      simulationOrder,
      zoneData ? JSON.stringify(zoneData) : null,
      id
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Simulation not found' });
    }
    
    res.json({ message: 'Simulation updated successfully' });
  } catch (error) {
    console.error('Error updating simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete simulation (Admin)
const deleteSimulation = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.query(
      'DELETE FROM simulation WHERE SimulationID = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Simulation not found' });
    }
    
    res.json({ message: 'Simulation deleted successfully' });
  } catch (error) {
    console.error('Error deleting simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Start simulation
const startSimulation = async (req, res) => {
  try {
    const { simulationId, userId } = req.body;
    
    // Check if progress exists
    const [existing] = await pool.query(
      'SELECT * FROM simulation_progress WHERE UserID = ? AND SimulationID = ?',
      [userId, simulationId]
    );
    
    if (existing.length > 0) {
      // Update existing
      await pool.query(
        `UPDATE simulation_progress 
         SET CompletionStatus = 'in_progress'
         WHERE UserID = ? AND SimulationID = ?`,
        [userId, simulationId]
      );
    } else {
      // Create new
      await pool.query(
        `INSERT INTO simulation_progress 
         (UserID, SimulationID, CompletionStatus)
         VALUES (?, ?, 'in_progress')`,
        [userId, simulationId]
      );
    }
    
    res.json({ message: 'Simulation started successfully' });
  } catch (error) {
    console.error('Error starting simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Complete simulation
const completeSimulation = async (req, res) => {
  try {
    const { simulationId, userId, score, timeSpent } = req.body;
    
    // Ensure progress row exists (in case start failed)
    const [existing] = await pool.query(
      'SELECT * FROM simulation_progress WHERE UserID = ? AND SimulationID = ?',
      [userId, simulationId]
    );
    
    if (existing.length === 0) {
      // Create the row first
      await pool.query(
        `INSERT INTO simulation_progress 
         (UserID, SimulationID, Score, Attempts, TimeSpent, CompletionStatus, DateCompleted)
         VALUES (?, ?, ?, 1, ?, 'completed', CURRENT_TIMESTAMP)`,
        [userId, simulationId, score, timeSpent || 0]
      );
    } else {
      // Update existing
      await pool.query(
        `UPDATE simulation_progress 
         SET Score = ?,
             Attempts = Attempts + 1,
             TimeSpent = TimeSpent + ?,
             CompletionStatus = 'completed',
             DateCompleted = CURRENT_TIMESTAMP
         WHERE UserID = ? AND SimulationID = ?`,
        [score, timeSpent || 0, userId, simulationId]
      );
    }
    
    res.json({ message: 'Simulation completed successfully' });
  } catch (error) {
    console.error('Error completing simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's simulation progress
const getUserProgress = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        sp.*,
        s.SimulationTitle,
        s.MaxScore
      FROM simulation_progress sp
      JOIN simulation s ON sp.SimulationID = s.SimulationID
      WHERE sp.UserID = ?
      ORDER BY s.SimulationOrder
    `;
    
    const [progress] = await pool.query(query, [userId]);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllSimulations,
  getSimulationsByModule,
  getSimulation,
  createSimulation,
  updateSimulation,
  deleteSimulation,
  startSimulation,
  completeSimulation,
  getUserProgress
};
