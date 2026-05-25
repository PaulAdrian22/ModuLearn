const { pool, query } = require('../config/database');
const { getCached, setCached, clearNamespace } = require('../utils/responseCache');
const { getSimulationConfig, readSimulationOverride } = require('../utils/simulationConfig');

let simulationColumnCache = null;

const getRequestCacheKey = (req) => {
  return String(req?.originalUrl || req?.url || '').trim() || String(req?.path || '');
};

const clearSimulationCaches = () => {
  // Only clear content caches, NOT progress caches
  // Progress should persist independently of content updates
  clearNamespace('simulations:list');
  clearNamespace('simulations:item');
};

// Allow admin routes to bust the column cache when they add columns
// (e.g. ZoneData added by ensureSimulationAdminColumns after startup).
const clearSimulationColumnCache = () => { simulationColumnCache = null; };

const getSimulationColumnSet = async () => {
  if (simulationColumnCache) return simulationColumnCache;

  const [columns] = await pool.query('SHOW COLUMNS FROM simulation');
  simulationColumnCache = new Set(columns.map((column) => column.Field));
  return simulationColumnCache;
};

const simulationSelectField = (columns, columnName, fallbackSql = 'NULL') => {
  return columns.has(columnName)
    ? `s.${columnName} AS ${columnName}`
    : `${fallbackSql} AS ${columnName}`;
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
    
    const columns = await getSimulationColumnSet();
    const selectFields = [
      's.SimulationID',
      simulationSelectField(columns, 'ModuleID', '0'),
      's.SimulationTitle',
      simulationSelectField(columns, 'Description', "''"),
      simulationSelectField(columns, 'ActivityType', "''"),
      simulationSelectField(columns, 'SkillType', "''"),
      simulationSelectField(columns, 'MaxScore', '0'),
      simulationSelectField(columns, 'TimeLimit', '0'),
      simulationSelectField(columns, 'Instructions', "''"),
      simulationSelectField(columns, 'SimulationOrder', '0'),
      simulationSelectField(columns, 'Is_Locked', '0'),
      simulationSelectField(columns, 'LessonNumber', 'NULL'),
      simulationSelectField(columns, 'created_at', 'NULL'),
      simulationSelectField(columns, 'updated_at', 'NULL')
    ];

    let query = `
      SELECT
        ${selectFields.join(', ')},
        sp.Score,
        sp.Attempts,
        sp.TimeSpent,
        sp.CompletionStatus,
        sp.DateCompleted,
        COALESCE(sp.AttemptedFromLesson, 0) AS AttemptedFromLesson
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

    const selectFields = [
      's.SimulationID',
      simulationSelectField(columns, 'ModuleID', '0'),
      's.SimulationTitle',
      simulationSelectField(columns, 'Description', "''"),
      simulationSelectField(columns, 'ActivityType', "''"),
      simulationSelectField(columns, 'SkillType', "''"),
      simulationSelectField(columns, 'MaxScore', '0'),
      simulationSelectField(columns, 'TimeLimit', '0'),
      simulationSelectField(columns, 'Instructions', "''"),
      simulationSelectField(columns, 'SimulationOrder', '0'),
      simulationSelectField(columns, 'Is_Locked', '0'),
      simulationSelectField(columns, 'LessonNumber', 'NULL'),
      simulationSelectField(columns, 'created_at', 'NULL'),
      simulationSelectField(columns, 'updated_at', 'NULL')
    ];

    const baseSelect = `
      SELECT
        ${selectFields.join(', ')},
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

    // Validate required fields
    if (!simulationTitle || simulationTitle.trim() === '') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'simulationTitle is required'
      });
    }

    const columns = await getSimulationColumnSet();

    const normalizedZoneData = zoneData
      ? {
          ...zoneData,
          skillType: zoneData.skillType || skillType || 'Memorization'
        }
      : (skillType ? { skillType } : null);

    // Always include these critical columns for all new simulations
    const insertPayload = {
      SimulationTitle: simulationTitle.trim(),
      SimulationOrder: simulationOrder || 1,
    };

    // Add Description (important for preventing ER_NO_DEFAULT_FOR_FIELD)
    if (columns.has('Description')) {
      insertPayload.Description = description || '';
    }

    // Add Instructions (important for preventing ER_NO_DEFAULT_FOR_FIELD)
    if (columns.has('Instructions')) {
      insertPayload.Instructions = instructions || '';
    }

    // Add Activity Type and other fields
    if (columns.has('ActivityType')) {
      insertPayload.ActivityType = activityType || 'Drag and Drop';
    }

    if (columns.has('MaxScore')) {
      insertPayload.MaxScore = maxScore || 100;
    }

    if (columns.has('TimeLimit')) {
      insertPayload.TimeLimit = timeLimit || 0;
    }

    // Add ModuleID with default of 0
    if (columns.has('ModuleID')) {
      insertPayload.ModuleID = moduleId !== undefined && moduleId !== null ? moduleId : 0;
    }

    // Add ZoneData if available
    if (columns.has('ZoneData')) {
      insertPayload.ZoneData = normalizedZoneData ? JSON.stringify(normalizedZoneData) : null;
    }

    // Add Is_Locked
    if (columns.has('Is_Locked')) {
      insertPayload.Is_Locked = isLocked !== undefined ? !!isLocked : false;
    }

    // Add SkillType
    if (columns.has('SkillType')) {
      insertPayload.SkillType = skillType || normalizedZoneData?.skillType || 'Memorization';
    }

    const insertColumns = Object.keys(insertPayload);
    const insertValues = insertColumns.map((column) => insertPayload[column]);
    const placeholders = insertColumns.map(() => '?').join(', ');

    const sqlQuery = `
      INSERT INTO simulation (${insertColumns.join(', ')})
      VALUES (${placeholders})
    `;

    const result = await query(sqlQuery, insertValues);
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
// Runtime is editor-driven only; no manifest fallback here.
const getSimulationRuntimeConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const columns = await getSimulationColumnSet();
    const selectFields = [
      'SimulationID',
      'SimulationTitle',
      columns.has('SimulationOrder') ? 'SimulationOrder' : '0 AS SimulationOrder',
      columns.has('ZoneData') ? 'ZoneData' : 'NULL AS ZoneData'
    ];
    const [rows] = await pool.query(
      `SELECT ${selectFields.join(', ')} FROM simulation WHERE SimulationID = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    const simulation = rows[0];
    const { activityOrder, source, config } = getSimulationConfig(simulation, {
      preferStoredOnly: true,
      overrideZoneData: simulation.ZoneData || readSimulationOverride(id)
    });

    if (source === 'missing' || !Array.isArray(config?.timeline) || config.timeline.length === 0) {
      return res.status(409).json({
        message: 'Simulation has no editor configuration yet. Open Simulation Editor and save at least one step.'
      });
    }

    res.json({ activityOrder, source, config });
  } catch (error) {
    console.error('Error fetching simulation config:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Start simulation
const startSimulation = async (req, res) => {
  try {
    const { simulationId, userId, fromLesson } = req.body;
    const isFromLesson = Boolean(fromLesson);

    // Check if progress exists
    const [existing] = await pool.query(
      'SELECT * FROM simulation_progress WHERE UserID = ? AND SimulationID = ?',
      [userId, simulationId]
    );

    if (existing.length > 0) {
      // Only move to in_progress if not already completed — preserve best score/status during replay.
      // Always update AttemptedFromLesson if this call comes from a lesson (latch: once true, stays true).
      const statusClause = existing[0].CompletionStatus !== 'completed'
        ? "CompletionStatus = 'in_progress',"
        : '';
      const lessonClause = isFromLesson && !existing[0].AttemptedFromLesson
        ? 'AttemptedFromLesson = 1,'
        : '';
      const setClause = (statusClause + ' ' + lessonClause).replace(/,\s*$/, '').trim();

      if (setClause) {
        await pool.query(
          `UPDATE simulation_progress SET ${setClause} WHERE UserID = ? AND SimulationID = ?`,
          [userId, simulationId]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO simulation_progress
           (UserID, SimulationID, CompletionStatus, AttemptedFromLesson)
         VALUES (?, ?, 'in_progress', ?)`,
        [userId, simulationId, isFromLesson ? 1 : 0]
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
    const { simulationId, userId, score, timeSpent, fromLesson } = req.body;
    const safeTimeSpent = Math.max(0, Math.floor(Number(timeSpent || 0)));
    const isFromLesson = Boolean(fromLesson);

    // Ensure progress row exists (in case start failed)
    const [existing] = await pool.query(
      'SELECT * FROM simulation_progress WHERE UserID = ? AND SimulationID = ?',
      [userId, simulationId]
    );

    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO simulation_progress
         (UserID, SimulationID, Score, Attempts, TimeSpent, CompletionStatus, DateCompleted, AttemptedFromLesson)
         VALUES (?, ?, ?, 1, ?, 'completed', CURRENT_TIMESTAMP, ?)`,
        [userId, simulationId, score, safeTimeSpent, isFromLesson ? 1 : 0]
      );
    } else {
      const lessonLatch = isFromLesson && !existing[0].AttemptedFromLesson
        ? ', AttemptedFromLesson = 1'
        : '';
      await pool.query(
        `UPDATE simulation_progress
         SET Score = GREATEST(Score, ?),
             Attempts = Attempts + 1,
             TimeSpent = TimeSpent + ?,
             CompletionStatus = 'completed',
             DateCompleted = CURRENT_TIMESTAMP
             ${lessonLatch}
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
  getUserProgress,
  clearSimulationColumnCache
};
