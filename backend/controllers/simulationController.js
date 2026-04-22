const { pool } = require('../config/database');
const { getCached, setCached, clearNamespace } = require('../utils/responseCache');
const { getSimulationConfig } = require('../utils/simulationConfig');

let simulationColumnCache = null;

const getRequestCacheKey = (req) => {
  return String(req?.originalUrl || req?.url || '').trim() || String(req?.path || '');
};

const clearSimulationCaches = () => {
  clearNamespace('simulations:list');
  clearNamespace('simulations:item');
  clearNamespace('simulations:progress');
};

const getSimulationColumnSet = async () => {
  if (simulationColumnCache) return simulationColumnCache;

  const [columns] = await pool.query('SHOW COLUMNS FROM simulation');
  simulationColumnCache = new Set(columns.map((column) => column.Field));
  return simulationColumnCache;
};

// Get all simulations
const getAllSimulations = async (req, res) => {
  try {
    const requestCacheKey = getRequestCacheKey(req);
    const cached = getCached('simulations:list', requestCacheKey);
    if (cached) {
      return res.json(cached);
    }

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
    
    setCached('simulations:list', requestCacheKey, simulations);
    res.json(simulations);
  } catch (error) {
    console.error('Error fetching simulations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get simulations by module
const getSimulationsByModule = async (req, res) => {
  try {
    const requestCacheKey = getRequestCacheKey(req);
    const cached = getCached('simulations:list', requestCacheKey);
    if (cached) {
      return res.json(cached);
    }

    const { moduleId } = req.params;
    const userId = req.query.userId;
    const columns = await getSimulationColumnSet();
    const hasModuleColumn = columns.has('ModuleID');

    const baseSelect = `
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
    `;

    const query = hasModuleColumn
      ? `${baseSelect}
      WHERE s.ModuleID = ?
      ORDER BY s.SimulationOrder`
      : `${baseSelect}
      WHERE s.SimulationTitle LIKE ?
      ORDER BY s.SimulationOrder`;

    const moduleFilter = hasModuleColumn
      ? moduleId
      : `Lesson ${moduleId} Simulation %`;

    const [simulations] = await pool.query(query, [userId || 0, moduleFilter]);
    setCached('simulations:list', requestCacheKey, simulations);
    res.json(simulations);
  } catch (error) {
    console.error('Error fetching simulations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get single simulation
const getSimulation = async (req, res) => {
  try {
    const requestCacheKey = getRequestCacheKey(req);
    const cached = getCached('simulations:item', requestCacheKey);
    if (cached) {
      return res.json(cached);
    }

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
    
    setCached('simulations:item', requestCacheKey, simulations[0]);
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
      moduleId,
      simulationTitle,
      description,
      activityType,
      maxScore,
      timeLimit,
      instructions,
      simulationOrder,
      isLocked,
      skillType,
      zoneData
    } = req.body;

    const columns = await getSimulationColumnSet();

    const normalizedZoneData = zoneData
      ? {
          ...zoneData,
          skillType: zoneData.skillType || skillType || 'Memorization'
        }
      : (skillType ? { skillType } : null);

    const insertPayload = {
      SimulationTitle: simulationTitle,
      Description: description,
      ActivityType: activityType || 'Drag and Drop',
      MaxScore: maxScore || 100,
      TimeLimit: timeLimit || 0,
      SimulationOrder: simulationOrder || 1,
      ZoneData: normalizedZoneData ? JSON.stringify(normalizedZoneData) : null
    };

    if (columns.has('ModuleID')) insertPayload.ModuleID = moduleId || null;
    if (columns.has('Instructions')) insertPayload.Instructions = instructions || '';
    if (columns.has('Is_Locked')) insertPayload.Is_Locked = isLocked !== undefined ? !!isLocked : false;
    if (columns.has('SkillType')) insertPayload.SkillType = skillType || normalizedZoneData?.skillType || 'Memorization';

    const insertColumns = Object.keys(insertPayload);
    const insertValues = insertColumns.map((column) => insertPayload[column]);
    const placeholders = insertColumns.map(() => '?').join(', ');

    const query = `
      INSERT INTO simulation (${insertColumns.join(', ')})
      VALUES (${placeholders})
    `;

    const [result] = await pool.query(query, insertValues);
    clearSimulationCaches();
    
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
      moduleId,
      simulationTitle,
      description,
      activityType,
      maxScore,
      timeLimit,
      instructions,
      simulationOrder,
      isLocked,
      skillType,
      zoneData
    } = req.body;

    const columns = await getSimulationColumnSet();

    const normalizedZoneData = zoneData
      ? {
          ...zoneData,
          skillType: zoneData.skillType || skillType || 'Memorization'
        }
      : (skillType ? { skillType } : null);

    const updatePayload = {
      SimulationTitle: simulationTitle,
      Description: description,
      ActivityType: activityType || 'Drag and Drop',
      MaxScore: maxScore || 100,
      TimeLimit: timeLimit || 0,
      SimulationOrder: simulationOrder || 1,
      ZoneData: normalizedZoneData ? JSON.stringify(normalizedZoneData) : null
    };

    if (columns.has('ModuleID') && moduleId !== undefined) updatePayload.ModuleID = moduleId;
    if (columns.has('Instructions') && instructions !== undefined) updatePayload.Instructions = instructions;
    if (columns.has('Is_Locked') && isLocked !== undefined) updatePayload.Is_Locked = !!isLocked;
    if (columns.has('SkillType') && skillType !== undefined) updatePayload.SkillType = skillType;

    const updateColumns = Object.keys(updatePayload);
    const updateAssignments = updateColumns.map((column) => `${column} = ?`).join(', ');
    const updateValues = updateColumns.map((column) => updatePayload[column]);

    const query = `
      UPDATE simulation
      SET ${updateAssignments}
      WHERE SimulationID = ?
    `;

    const [result] = await pool.query(query, [...updateValues, id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    clearSimulationCaches();
    
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

    clearSimulationCaches();
    
    res.json({ message: 'Simulation deleted successfully' });
  } catch (error) {
    console.error('Error deleting simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get the runtime config (meta + timeline) for a simulation.
// Falls back to the on-disk manifest when no admin override is saved.
const getSimulationRuntimeConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT SimulationID, SimulationTitle, SimulationOrder, ZoneData FROM simulation WHERE SimulationID = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    const simulation = rows[0];
    const { activityOrder, source, config } = getSimulationConfig(simulation);

    res.json({ activityOrder, source, config });
  } catch (error) {
    console.error('Error fetching simulation config:', error);
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

    clearSimulationCaches();
    
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
    const safeTimeSpent = Math.max(0, Math.floor(Number(timeSpent || 0)));
    
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
        [userId, simulationId, score, safeTimeSpent]
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
        [score, safeTimeSpent, userId, simulationId]
      );
    }

    clearSimulationCaches();
    
    res.json({ message: 'Simulation completed successfully' });
  } catch (error) {
    console.error('Error completing simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's simulation progress
const getUserProgress = async (req, res) => {
  try {
    const requestCacheKey = getRequestCacheKey(req);
    const cached = getCached('simulations:progress', requestCacheKey);
    if (cached) {
      return res.json(cached);
    }

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
    setCached('simulations:progress', requestCacheKey, progress);
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
  getSimulationRuntimeConfig,
  createSimulation,
  updateSimulation,
  deleteSimulation,
  startSimulation,
  completeSimulation,
  getUserProgress
};
