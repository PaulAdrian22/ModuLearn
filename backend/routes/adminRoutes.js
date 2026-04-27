// Admin Module Routes
// Admin-only routes for managing lessons and modules

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validators');
const { query } = require('../config/database');
const multer = require('multer');
const path = require('path');
const {
  getMulterLessonDestination,
  uploadAssetFromPath,
  isAzureStorageEnabled,
} = require('../utils/uploadStorage');
const { pool } = require('../config/database');
const { clearNamespace } = require('../utils/responseCache');
const {
  getSimulationConfig,
  normalizeStoredConfig,
  listActivityAssets,
  resolveActivityOrder,
  FALLBACK_META
} = require('../utils/simulationConfig');

// Configure multer for media uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, getMulterLessonDestination());
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'lesson-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|avi|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  }
});

const parseBooleanFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }

  return null;
};

const PROTECTED_LESSON_ORDER_MIN = 1;
const PROTECTED_LESSON_ORDER_MAX = 7;

const isProtectedLessonOrder = (lessonOrder) => {
  const normalizedLessonOrder = Number(lessonOrder);
  return Number.isFinite(normalizedLessonOrder)
    && normalizedLessonOrder >= PROTECTED_LESSON_ORDER_MIN
    && normalizedLessonOrder <= PROTECTED_LESSON_ORDER_MAX;
};

const isSupplementaryDifficulty = (difficulty) => {
  return String(difficulty || '').trim().toLowerCase() === 'supplementary';
};

const isProtectedFromDeletion = (lesson = {}) => {
  if (isSupplementaryDifficulty(lesson.Difficulty)) {
    return false;
  }

  return isProtectedLessonOrder(lesson.LessonOrder);
};

const parseLessonLanguage = (value = 'English') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'english') return 'English';
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

  return 'English';
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const isPlainObject = (value) => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const normalizeJsonColumnInput = ({
  value,
  fieldName,
  expectedType,
  fallback,
  allowNull = true,
  warnings
}) => {
  if (value === undefined) {
    return { hasValue: false, value: undefined };
  }

  if (value === null) {
    if (allowNull) {
      return { hasValue: true, value: null };
    }

    warnings.push(`${fieldName} was null and was replaced with fallback ${expectedType}.`);
    return { hasValue: true, value: JSON.stringify(fallback) };
  }

  let parsed = value;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      if (allowNull) {
        return { hasValue: true, value: null };
      }

      warnings.push(`${fieldName} was an empty string and was replaced with fallback ${expectedType}.`);
      return { hasValue: true, value: JSON.stringify(fallback) };
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      warnings.push(`${fieldName} contained invalid JSON and was replaced with fallback ${expectedType}.`);
      return { hasValue: true, value: JSON.stringify(fallback) };
    }
  }

  const isExpectedType = expectedType === 'array'
    ? Array.isArray(parsed)
    : isPlainObject(parsed);

  if (!isExpectedType) {
    warnings.push(`${fieldName} expected ${expectedType} data and was replaced with fallback ${expectedType}.`);
    return { hasValue: true, value: JSON.stringify(fallback) };
  }

  return { hasValue: true, value: JSON.stringify(parsed) };
};

const normalizeLessonTimeInput = (value, warnings) => {
  if (value === undefined) {
    return { hasValue: false, value: undefined };
  }

  if (value === null) {
    return { hasValue: true, value: null };
  }

  let parsed = value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { hasValue: true, value: null };
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      warnings.push('LessonTime contained invalid JSON and was reset to null.');
      return { hasValue: true, value: null };
    }
  }

  if (!isPlainObject(parsed)) {
    warnings.push('LessonTime must be an object and was reset to null.');
    return { hasValue: true, value: null };
  }

  const rawHours = Number(parsed.hours);
  const rawMinutes = Number(parsed.minutes);
  const safeHours = Number.isFinite(rawHours) ? Math.max(0, Math.floor(rawHours)) : 0;
  const safeMinutes = Number.isFinite(rawMinutes) ? Math.max(0, Math.floor(rawMinutes)) : 0;

  if (
    rawHours !== safeHours ||
    rawMinutes !== safeMinutes ||
    !Number.isFinite(rawHours) ||
    !Number.isFinite(rawMinutes)
  ) {
    warnings.push('LessonTime was normalized to non-negative whole numbers.');
  }

  return {
    hasValue: true,
    value: JSON.stringify({ hours: safeHours, minutes: safeMinutes })
  };
};

let moduleAdminColumnsReady = false;
let simulationAdminColumnCache = null;
let simulationZoneDataUpgradeAttempted = false;
let simulationTableMissingConfirmed = false;

const ensureModuleAdminColumns = async () => {
  if (moduleAdminColumnsReady) return;

  const existingColumns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'module'
        AND COLUMN_NAME IN ('Is_Completed', 'LessonLanguage', 'Is_Deleted')`
  );

  const columnSet = new Set(existingColumns.map((column) => String(column.COLUMN_NAME || '')));
  if (!columnSet.has('Is_Completed')) {
    await query(
      `ALTER TABLE module
       ADD COLUMN Is_Completed BOOLEAN NOT NULL DEFAULT FALSE AFTER Is_Unlocked`
    );
    console.log('Added Is_Completed column to module table.');
  }

  if (!columnSet.has('LessonLanguage')) {
    await query(
      `ALTER TABLE module
       ADD COLUMN LessonLanguage VARCHAR(20) NOT NULL DEFAULT 'English' AFTER Is_Completed`
    );
    console.log('Added LessonLanguage column to module table.');
  }

  if (!columnSet.has('Is_Deleted')) {
    await query(
      `ALTER TABLE module
       ADD COLUMN Is_Deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER LessonLanguage`
    );
    console.log('Added Is_Deleted column to module table.');
  }

  moduleAdminColumnsReady = true;
};

const getSimulationAdminColumnSet = async ({ forceRefresh = false } = {}) => {
  if (simulationAdminColumnCache && !forceRefresh) {
    return simulationAdminColumnCache;
  }

  try {
    const [columns] = await pool.query('SHOW COLUMNS FROM simulation');
    simulationAdminColumnCache = new Set(
      columns.map((column) => String(column.Field || '').trim()).filter(Boolean)
    );
  } catch (error) {
    // Some hosted DB users can query rows but cannot inspect schema metadata.
    // Fall back to the baseline simulation schema so admin listing still works.
    console.warn('Could not inspect simulation columns via SHOW COLUMNS:', error.message);
    simulationAdminColumnCache = new Set([
      'SimulationID',
      'SimulationTitle',
      'Description',
      'ActivityType',
      'MaxScore',
      'TimeLimit',
      'SimulationOrder'
    ]);
  }

  return simulationAdminColumnCache;
};

const ensureSimulationAdminColumns = async () => {
  const columns = await getSimulationAdminColumnSet();

  if (!columns.has('ZoneData') && !simulationZoneDataUpgradeAttempted) {
    simulationZoneDataUpgradeAttempted = true;
    try {
      await pool.query('ALTER TABLE simulation ADD COLUMN ZoneData LONGTEXT NULL');
      console.log('Added ZoneData column to simulation table.');
      return getSimulationAdminColumnSet({ forceRefresh: true });
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('ZoneData column is missing and could not be auto-created:', error.message);
      }
      return columns;
    }
  }

  return columns;
};

const simulationSelectField = (columns, columnName, fallbackSql = 'NULL') => {
  if (columns.has(columnName)) {
    return `\`${columnName}\``;
  }

  return `${fallbackSql} AS \`${columnName}\``;
};

const isMissingSimulationTableError = (error) => {
  if (!error) return false;
  if (error.code === 'ER_NO_SUCH_TABLE') return true;
  if (error.errno === 1146) return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes("doesn't exist") && message.includes('simulation');
};

const isSimulationSchemaError = (error) => {
  if (!error) return false;
  if (isMissingSimulationTableError(error)) return true;
  // ER_BAD_FIELD_ERROR (1054) — column referenced that doesn't exist.
  if (error.code === 'ER_BAD_FIELD_ERROR' || error.errno === 1054) return true;
  return false;
};

const detectSimulationTableMissing = async () => {
  if (simulationTableMissingConfirmed) return true;
  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'simulation' LIMIT 1`
    );
    if (rows.length === 0) {
      simulationTableMissingConfirmed = true;
      return true;
    }
    return false;
  } catch {
    // If we can't even query INFORMATION_SCHEMA, don't claim the table is missing;
    // let callers attempt the real query and surface whatever error comes back.
    return false;
  }
};

let simulationTableEnsured = false;

// Create the simulation table (and seed the default activities) if it is missing.
// Runs once per process; safe to call from every request handler. Designed to
// recover deployments where the initial migration script was never executed.
const ensureSimulationTable = async () => {
  if (simulationTableEnsured) return { created: false, seeded: false };

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS simulation (
        SimulationID INT AUTO_INCREMENT PRIMARY KEY,
        ModuleID INT NULL,
        SimulationTitle VARCHAR(200) NOT NULL,
        Description TEXT,
        ActivityType VARCHAR(100),
        MaxScore INT DEFAULT 10,
        TimeLimit INT DEFAULT 0,
        Instructions TEXT,
        SimulationOrder INT NOT NULL DEFAULT 1,
        Is_Locked BOOLEAN DEFAULT FALSE,
        ZoneData LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order (SimulationOrder)
      )
    `);

    // Reset caches now that the table exists.
    simulationTableMissingConfirmed = false;
    simulationAdminColumnCache = null;
    simulationZoneDataUpgradeAttempted = false;

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM simulation');
    const existingCount = Number(countRows?.[0]?.total || 0);

    let seeded = false;
    if (existingCount === 0) {
      const seedOrders = Object.keys(FALLBACK_META)
        .map((key) => Number(key))
        .filter((order) => Number.isFinite(order) && order > 0)
        .sort((a, b) => a - b);

      for (const order of seedOrders) {
        const meta = FALLBACK_META[order];
        if (!meta) continue;
        await pool.query(
          `INSERT INTO simulation
             (SimulationTitle, Description, ActivityType, MaxScore, TimeLimit, Instructions, SimulationOrder, Is_Locked)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            meta.title || `Activity ${order}`,
            meta.description || '',
            order === 1 ? 'Assembling' : 'Disassembling',
            10,
            0,
            Array.isArray(meta.steps) ? meta.steps.join('\n') : '',
            order,
            false
          ]
        );
      }
      seeded = seedOrders.length > 0;
    }

    simulationTableEnsured = true;
    return { created: true, seeded };
  } catch (error) {
    console.warn('ensureSimulationTable skipped:', {
      code: error?.code,
      errno: error?.errno,
      message: error?.message
    });
    // Don't flip the sentinel — we want to retry on the next request if the
    // deployment has not yet been granted DDL privileges.
    return { created: false, seeded: false, error };
  }
};

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/modules - Get all modules (admin view)
router.get('/modules', async (req, res) => {
  try {
    await ensureModuleAdminColumns();

    const modules = await query(`
      SELECT 
        m.*,
        (
          SELECT COUNT(DISTINCT q.QuestionID)
          FROM question q
          WHERE q.ModuleID = m.ModuleID
        ) as questionCount,
        (
          SELECT MAX(
            CASE
              WHEN p.DateCompletion IS NULL THEN p.DateStarted
              WHEN p.DateStarted IS NULL THEN p.DateCompletion
              WHEN p.DateStarted > p.DateCompletion THEN p.DateStarted
              ELSE p.DateCompletion
            END
          )
          FROM progress p
          WHERE p.ModuleID = m.ModuleID
        ) as lastOpenedAt
      FROM module m
    `);

    modules.sort((a, b) => Number(a.LessonOrder || 0) - Number(b.LessonOrder || 0));
    
    // Compute topicCount and assessmentCount from JSON columns
    const enriched = modules.map(m => {
      const sections = toArray(m.sections);
      const topicCount = sections.filter(s => {
        const t = (s.type || '').toLowerCase();
        return t === 'topic' || t === 'topic title';
      }).length;

      const diagnosticCount = toArray(m.diagnosticQuestions).length;
      const reviewCount = toArray(m.reviewQuestions).length;
      const finalCount = toArray(m.finalQuestions).length;
      const inlineReviewCount = sections.filter(s => {
        const t = (s.type || '').toLowerCase();
        return t === 'review-multiple-choice' || t === 'review - multiple choice' || t === 'review-drag-drop' || t === 'review - drag and drop';
      }).length;
      const assessmentCount = diagnosticCount + reviewCount + finalCount + inlineReviewCount;

      return { ...m, topicCount, assessmentCount };
    });
    
    res.json(enriched);
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch modules'
    });
  }
});

// POST /api/admin/modules - Create new module/lesson
router.post('/modules', [
  body('ModuleTitle').trim().notEmpty().withMessage('Module title is required'),
  body('Description').optional().trim(),
  body('LessonOrder').isInt({ min: 1 }).withMessage('Lesson order must be a positive integer'),
  body('Tesda_Reference').optional().trim(),
  body('LessonTime').optional(),
  body('Difficulty').optional().trim(),
  body('LessonLanguage').optional().isIn(['English', 'Taglish', 'Filipino']).withMessage('Lesson language must be English or Taglish'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { ModuleTitle, Description, LessonOrder, Tesda_Reference, LessonTime, Difficulty, LessonLanguage, sections, diagnosticQuestions, reviewQuestions, finalQuestions, finalInstruction, roadmapStages } = req.body;
    const normalizationWarnings = [];

    const normalizedSections = normalizeJsonColumnInput({
      value: sections,
      fieldName: 'sections',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedDiagnosticQuestions = normalizeJsonColumnInput({
      value: diagnosticQuestions,
      fieldName: 'diagnosticQuestions',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedReviewQuestions = normalizeJsonColumnInput({
      value: reviewQuestions,
      fieldName: 'reviewQuestions',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedFinalQuestions = normalizeJsonColumnInput({
      value: finalQuestions,
      fieldName: 'finalQuestions',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedRoadmapStages = normalizeJsonColumnInput({
      value: roadmapStages,
      fieldName: 'roadmapStages',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedLessonTime = normalizeLessonTimeInput(LessonTime, normalizationWarnings);
    const normalizedFinalInstruction =
      finalInstruction === undefined
        ? { hasValue: false, value: undefined }
        : { hasValue: true, value: String(finalInstruction || '').trim() || null };

    await ensureModuleAdminColumns();
    
    console.log('Creating new module with data:', { ModuleTitle, Description, LessonOrder, Tesda_Reference, LessonTime, Difficulty, LessonLanguage });
    
    const result = await query(
      `INSERT INTO module (ModuleTitle, Description, LessonOrder, Tesda_Reference, Is_Unlocked, LessonLanguage) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ModuleTitle, Description || '', LessonOrder, Tesda_Reference || '', LessonOrder === 1, parseLessonLanguage(LessonLanguage)]
    );
    
    const moduleId = result.insertId;
    console.log('Module created successfully with ID:', moduleId);
    
    // Save sections, diagnosticQuestions, reviewQuestions, finalQuestions as JSON in a separate table or column
    // For now, we'll store them in a JSON column - you may need to add these columns to your module table
    if (
      normalizedSections.hasValue ||
      normalizedDiagnosticQuestions.hasValue ||
      normalizedReviewQuestions.hasValue ||
      normalizedFinalQuestions.hasValue ||
      normalizedLessonTime.hasValue ||
      normalizedRoadmapStages.hasValue ||
      normalizedFinalInstruction.hasValue ||
      Difficulty !== undefined
    ) {
      console.log('Saving JSON fields:', {
        sectionsCount: Array.isArray(sections) ? sections.length : undefined,
        diagnosticCount: Array.isArray(diagnosticQuestions) ? diagnosticQuestions.length : undefined,
        reviewCount: Array.isArray(reviewQuestions) ? reviewQuestions.length : undefined,
        finalCount: Array.isArray(finalQuestions) ? finalQuestions.length : undefined,
        lessonTime: normalizedLessonTime.hasValue,
        difficulty: Difficulty
      });

      if (normalizationWarnings.length > 0) {
        console.warn('Create module payload normalized with warnings:', normalizationWarnings);
      }
      
      await query(
        `UPDATE module SET 
         sections = ?,
         diagnosticQuestions = ?,
         reviewQuestions = ?,
         finalQuestions = ?,
         LessonTime = ?,
         Difficulty = ?,
         finalInstruction = ?,
         roadmapStages = ?
         WHERE ModuleID = ?`,
        [
          normalizedSections.hasValue ? normalizedSections.value : null,
          normalizedDiagnosticQuestions.hasValue ? normalizedDiagnosticQuestions.value : null,
          normalizedReviewQuestions.hasValue ? normalizedReviewQuestions.value : null,
          normalizedFinalQuestions.hasValue ? normalizedFinalQuestions.value : null,
          normalizedLessonTime.hasValue ? normalizedLessonTime.value : null,
          Difficulty || null,
          normalizedFinalInstruction.hasValue ? normalizedFinalInstruction.value : null,
          normalizedRoadmapStages.hasValue ? normalizedRoadmapStages.value : null,
          moduleId
        ]
      );
      
      console.log('JSON fields saved successfully');
    }
    
    res.status(201).json({
      message: 'Module created successfully',
      moduleId: moduleId,
      normalizationWarnings
    });
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to create module',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/admin/modules/:id - Update module
router.put('/modules/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('ModuleTitle').optional().trim().notEmpty(),
  body('Description').optional().trim(),
  body('LessonOrder').optional().isInt({ min: 1 }),
  body('Tesda_Reference').optional().trim(),
  body('LessonTime').optional(),
  body('Difficulty').optional().trim(),
  body('LessonLanguage').optional().isIn(['English', 'Taglish', 'Filipino']).withMessage('Lesson language must be English or Taglish'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { ModuleTitle, Description, LessonOrder, Tesda_Reference, LessonTime, Difficulty, LessonLanguage, sections, diagnosticQuestions, reviewQuestions, finalQuestions, finalInstruction, roadmapStages } = req.body;
    const normalizationWarnings = [];

    const normalizedSections = normalizeJsonColumnInput({
      value: sections,
      fieldName: 'sections',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedDiagnosticQuestions = normalizeJsonColumnInput({
      value: diagnosticQuestions,
      fieldName: 'diagnosticQuestions',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedReviewQuestions = normalizeJsonColumnInput({
      value: reviewQuestions,
      fieldName: 'reviewQuestions',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedFinalQuestions = normalizeJsonColumnInput({
      value: finalQuestions,
      fieldName: 'finalQuestions',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedRoadmapStages = normalizeJsonColumnInput({
      value: roadmapStages,
      fieldName: 'roadmapStages',
      expectedType: 'array',
      fallback: [],
      allowNull: true,
      warnings: normalizationWarnings
    });

    const normalizedLessonTime = normalizeLessonTimeInput(LessonTime, normalizationWarnings);

    const normalizedFinalInstruction =
      finalInstruction === undefined
        ? { hasValue: false, value: undefined }
        : { hasValue: true, value: String(finalInstruction || '').trim() || null };

    await ensureModuleAdminColumns();

    const existingModules = await query(
      'SELECT ModuleID, Is_Completed, Is_Deleted FROM module WHERE ModuleID = ?',
      [id]
    );

    if (existingModules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    if (parseBooleanFlag(existingModules[0].Is_Completed)) {
      return res.status(423).json({
        error: 'Locked',
        message: 'This lesson is marked as completed and locked for editing. Mark it as incomplete first to edit it.'
      });
    }

    if (parseBooleanFlag(existingModules[0].Is_Deleted)) {
      return res.status(410).json({
        error: 'Gone',
        message: 'This lesson is in the recycle bin. Restore it before editing.'
      });
    }
    
    console.log('Updating module:', id);
    console.log('Received data:', { 
      ModuleTitle, 
      Description, 
      LessonOrder, 
      Tesda_Reference,
      sectionsCount: Array.isArray(sections) ? sections.length : undefined
    });

    if (normalizationWarnings.length > 0) {
      console.warn('Update module payload normalized with warnings:', normalizationWarnings);
    }
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    
    if (ModuleTitle !== undefined) {
      fields.push('ModuleTitle = ?');
      values.push(ModuleTitle);
    }
    if (Description !== undefined) {
      fields.push('Description = ?');
      values.push(Description);
    }
    if (LessonOrder !== undefined) {
      fields.push('LessonOrder = ?');
      values.push(LessonOrder);
    }
    if (Tesda_Reference !== undefined) {
      fields.push('Tesda_Reference = ?');
      values.push(Tesda_Reference);
    }
    if (normalizedLessonTime.hasValue) {
      fields.push('LessonTime = ?');
      values.push(normalizedLessonTime.value);
    }
    if (Difficulty !== undefined) {
      fields.push('Difficulty = ?');
      values.push(Difficulty);
    }
    if (LessonLanguage !== undefined) {
      fields.push('LessonLanguage = ?');
      values.push(parseLessonLanguage(LessonLanguage));
    }
    if (normalizedSections.hasValue) {
      fields.push('sections = ?');
      values.push(normalizedSections.value);
    }
    if (normalizedDiagnosticQuestions.hasValue) {
      fields.push('diagnosticQuestions = ?');
      values.push(normalizedDiagnosticQuestions.value);
    }
    if (normalizedReviewQuestions.hasValue) {
      fields.push('reviewQuestions = ?');
      values.push(normalizedReviewQuestions.value);
    }
    if (normalizedFinalQuestions.hasValue) {
      fields.push('finalQuestions = ?');
      values.push(normalizedFinalQuestions.value);
    }
    if (normalizedFinalInstruction.hasValue) {
      fields.push('finalInstruction = ?');
      values.push(normalizedFinalInstruction.value);
    }
    if (normalizedRoadmapStages.hasValue) {
      fields.push('roadmapStages = ?');
      values.push(normalizedRoadmapStages.value);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update'
      });
    }
    
    values.push(id);
    
    const result = await query(
      `UPDATE module SET ${fields.join(', ')} WHERE ModuleID = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    console.log('Module updated successfully');
    
    res.json({
      message: 'Module updated successfully',
      normalizationWarnings
    });
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to update module',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/admin/modules/:id/completion - Toggle admin completion state
router.put('/modules/:id/completion', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('isCompleted')
    .custom((value) => parseBooleanFlag(value) !== null)
    .withMessage('isCompleted must be true or false'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const isCompleted = parseBooleanFlag(req.body.isCompleted);

    await ensureModuleAdminColumns();

    const existingModules = await query(
      'SELECT ModuleID, Is_Deleted FROM module WHERE ModuleID = ?',
      [id]
    );

    if (existingModules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    if (parseBooleanFlag(existingModules[0].Is_Deleted)) {
      return res.status(410).json({
        error: 'Gone',
        message: 'This lesson is in the recycle bin. Restore it before updating completion state.'
      });
    }

    await query(
      'UPDATE module SET Is_Completed = ? WHERE ModuleID = ?',
      [isCompleted, id]
    );

    res.json({
      message: isCompleted
        ? 'Lesson marked as completed and locked for editing'
        : 'Lesson marked as incomplete and unlocked for editing',
      moduleId: Number(id),
      isCompleted
    });
  } catch (error) {
    console.error('Update module completion state error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to update lesson completion state'
    });
  }
});

// PUT /api/admin/modules/:id/lock-state - Manually lock or unlock lesson visibility
router.put('/modules/:id/lock-state', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('isUnlocked')
    .custom((value) => parseBooleanFlag(value) !== null)
    .withMessage('isUnlocked must be true or false'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const isUnlocked = parseBooleanFlag(req.body.isUnlocked);

    const existingModules = await query(
      'SELECT ModuleID, LessonOrder, Difficulty, Is_Deleted FROM module WHERE ModuleID = ?',
      [id]
    );

    if (existingModules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    if (parseBooleanFlag(existingModules[0].Is_Deleted)) {
      return res.status(410).json({
        error: 'Gone',
        message: 'This lesson is in the recycle bin. Restore it before changing lock state.'
      });
    }

    if (Number(existingModules[0].LessonOrder) === 1 && !isUnlocked) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Lesson 1 must remain unlocked.'
      });
    }

    await query(
      'UPDATE module SET Is_Unlocked = ? WHERE ModuleID = ?',
      [isUnlocked, id]
    );

    res.json({
      message: isUnlocked ? 'Lesson unlocked' : 'Lesson locked',
      moduleId: Number(id),
      isUnlocked
    });
  } catch (error) {
    console.error('Update module lock state error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to update lesson lock state'
    });
  }
});

// DELETE /api/admin/modules/:id - Delete module
router.delete('/modules/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    await ensureModuleAdminColumns();

    const existingModules = await query(
      'SELECT ModuleID, LessonOrder, Difficulty, Is_Deleted FROM module WHERE ModuleID = ?',
      [id]
    );

    if (existingModules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    if (isProtectedFromDeletion(existingModules[0])) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Lessons 1-7 are protected and cannot be deleted.'
      });
    }

    if (parseBooleanFlag(existingModules[0].Is_Deleted)) {
      return res.json({
        message: 'Module is already in the recycle bin',
        moduleId: Number(id),
        isDeleted: true
      });
    }

    await query('UPDATE module SET Is_Deleted = TRUE WHERE ModuleID = ?', [id]);
    
    res.json({
      message: 'Module moved to recycle bin',
      moduleId: Number(id),
      isDeleted: true
    });
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete module'
    });
  }
});

// PUT /api/admin/modules/:id/restore - Restore module from recycle bin
router.put('/modules/:id/restore', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    await ensureModuleAdminColumns();

    const existingModules = await query(
      'SELECT ModuleID, Is_Deleted FROM module WHERE ModuleID = ?',
      [id]
    );

    if (existingModules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    if (!parseBooleanFlag(existingModules[0].Is_Deleted)) {
      return res.json({
        message: 'Module is already active',
        moduleId: Number(id),
        isDeleted: false
      });
    }

    await query('UPDATE module SET Is_Deleted = FALSE WHERE ModuleID = ?', [id]);

    res.json({
      message: 'Module restored from recycle bin',
      moduleId: Number(id),
      isDeleted: false
    });
  } catch (error) {
    console.error('Restore module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to restore module'
    });
  }
});

// DELETE /api/admin/modules/:id/permanent - Permanently delete module
router.delete('/modules/:id/permanent', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const existingModules = await query(
      'SELECT ModuleID, LessonOrder, Difficulty FROM module WHERE ModuleID = ?',
      [id]
    );

    if (existingModules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    if (isProtectedFromDeletion(existingModules[0])) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Lessons 1-7 are protected and cannot be deleted.'
      });
    }

    await query('DELETE FROM module WHERE ModuleID = ?', [id]);

    res.json({
      message: 'Module permanently deleted',
      moduleId: Number(id)
    });
  } catch (error) {
    console.error('Permanent delete module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to permanently delete module'
    });
  }
});

// POST /api/admin/modules/:id/sections - Add section to module
router.post('/modules/:id/sections', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('title').trim().notEmpty().withMessage('Section title is required'),
  body('content').trim().notEmpty().withMessage('Section content is required'),
  body('type').isIn(['topic', 'subtopic', 'paragraph', 'image', 'video']).withMessage('Invalid section type'),
  body('order').isInt({ min: 1 }).withMessage('Order must be a positive integer'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, order } = req.body;
    
    // For now, store in module description as JSON
    // In production, you'd want a separate sections table
    const module = await query('SELECT * FROM module WHERE ModuleID = ?', [id]);
    
    if (module.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    res.status(201).json({
      message: 'Section added successfully'
    });
  } catch (error) {
    console.error('Add section error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add section'
    });
  }
});

// POST /api/admin/modules/:id/questions - Add questions to module
router.post('/modules/:id/questions', [
  param('id').isInt({ min: 1 }).withMessage('Invalid module ID'),
  body('questions').isArray({ min: 1 }).withMessage('Questions array is required'),
  body('questions.*.question').trim().notEmpty().withMessage('Question text is required'),
  body('questions.*.choices').isArray({ min: 2 }).withMessage('At least 2 choices required'),
  body('questions.*.correctAnswer').trim().notEmpty().withMessage('Correct answer is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { questions } = req.body;
    
    // Create assessment for this module if it doesn't exist
    // Then add questions
    // This is a simplified version - you'd need proper assessment creation
    
    for (const q of questions) {
      await query(
        `INSERT INTO question (ModuleID, Question, Choices, CorrectAnswer, Explanation) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, q.question, JSON.stringify(q.choices), q.correctAnswer, q.explanation || null]
      );
    }
    
    res.status(201).json({
      message: 'Questions added successfully',
      count: questions.length
    });
  } catch (error) {
    console.error('Add questions error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add questions'
    });
  }
});

// POST /api/admin/upload-media - Upload images/videos for lessons
router.post('/upload-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded'
      });
    }

    let fileUrl = `/uploads/lessons/${req.file.filename}`;

    if (isAzureStorageEnabled()) {
      fileUrl = await uploadAssetFromPath(req.file.path, {
        category: 'lessons',
        originalName: req.file.originalname,
        preserveFileName: false,
        blobPath: `lessons/${req.file.filename}`,
        deleteSource: true,
      });
    }
    
    res.status(200).json({
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      type: req.body.type || 'unknown'
    });
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to upload media'
    });
  }
});

// GET /api/admin/reports/count - Get count of pending reports (must come before /reports/:id)
router.get('/reports/count', async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as count FROM issue_reports WHERE Status != 'resolved'
    `);
    
    res.json({ count: result[0]?.count || 0 });
  } catch (error) {
    console.error('Get reports count error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch reports count'
    });
  }
});

// GET /api/admin/reports - Get all issue reports
router.get('/reports', async (req, res) => {
  try {
    console.log('=== Fetching all issue reports ===');
    
    // Create table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS issue_reports (
        ReportID INT AUTO_INCREMENT PRIMARY KEY,
        UserID INT NOT NULL,
        ModuleID INT,
        IssueType VARCHAR(100) NOT NULL,
        Details TEXT NOT NULL,
        LessonTitle VARCHAR(255),
        Status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE
      )
    `);

    const reports = await query(`
      SELECT 
        r.ReportID,
        r.IssueType as Category,
        r.UserID,
        u.Name as Name,
        u.Email,
        r.Status,
        r.Details,
        r.LessonTitle,
        r.ModuleID,
        r.created_at as CreatedAt
      FROM issue_reports r
      LEFT JOIN user u ON r.UserID = u.UserID
      ORDER BY r.created_at DESC
    `);
    
    console.log(`Found ${reports.length} reports`);
    console.log('Reports:', reports);
    
    res.json(reports);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch reports'
    });
  }
});

// GET /api/admin/dashboard/certified - Count learners who completed all lessons
router.get('/dashboard/certified', async (req, res) => {
  try {
    await ensureModuleAdminColumns();

    const totalModules = await query('SELECT COUNT(*) as total FROM module WHERE Is_Deleted = FALSE');
    const totalCount = totalModules[0].total;

    if (totalCount === 0) {
      return res.json({ count: 0 });
    }

    const certified = await query(`
      SELECT COUNT(*) as count FROM (
        SELECT p.UserID
        FROM progress p
        JOIN user u ON p.UserID = u.UserID
        WHERE u.Role = 'student' AND p.CompletionRate >= 100
        GROUP BY p.UserID
        HAVING COUNT(DISTINCT p.ModuleID) = ?
      ) as certified_users
    `, [totalCount]);

    res.json({ count: certified[0]?.count || 0 });
  } catch (error) {
    console.error('Get certified learners error:', error);
    res.status(500).json({ error: 'Failed to fetch certified learners count' });
  }
});

// GET /api/admin/dashboard/activity - Get learner count per lesson
router.get('/dashboard/activity', async (req, res) => {
  try {
    await ensureModuleAdminColumns();

    const lessons = await query(`
      SELECT
        m.LessonOrder,
        COALESCE(
          MAX(CASE WHEN LOWER(COALESCE(m.LessonLanguage, '')) = 'english' THEN m.ModuleTitle END),
          MAX(m.ModuleTitle)
        ) as ModuleTitle,
        COALESCE(
          MAX(CASE WHEN LOWER(COALESCE(m.LessonLanguage, '')) = 'english' THEN m.Difficulty END),
          MAX(m.Difficulty)
        ) as Difficulty,
        COUNT(DISTINCT p.UserID) as learnerCount
      FROM module m
      LEFT JOIN progress p ON m.ModuleID = p.ModuleID
      WHERE m.Is_Deleted = FALSE
      GROUP BY m.LessonOrder
      ORDER BY m.LessonOrder ASC
    `);

    // Assign a unique color per lesson for the activity chart
    const lessonColors = [
      '#64B5F6', // Lesson 1 - Light Blue
      '#7986CB', // Lesson 2 - Indigo
      '#FFD54F', // Lesson 3 - Amber/Gold
      '#FFB74D', // Lesson 4 - Orange
      '#EF9A9A', // Lesson 5 - Light Red
      '#A5D6A7', // Lesson 6 - Light Green
      '#CE93D8', // Lesson 7 - Purple
      '#F48FB1', // Lesson 8 - Pink
      '#80CBC4', // Lesson 9 - Teal
    ];

    const data = lessons.map((l, index) => ({
      lesson: `Lesson ${l.LessonOrder}`,
      title: l.ModuleTitle,
      count: l.learnerCount,
      difficulty: l.Difficulty,
      color: lessonColors[index % lessonColors.length]
    }));

    res.json(data);
  } catch (error) {
    console.error('Get activity data error:', error);
    res.status(500).json({ error: 'Failed to fetch activity data' });
  }
});

// GET /api/admin/dashboard/notifications - Get recent system events
router.get('/dashboard/notifications', async (req, res) => {
  try {
    await ensureModuleAdminColumns();

    const notifications = [];

    // Recent enrollments (new progress entries)
    const enrollments = await query(`
      SELECT u.Name, p.DateStarted, m.ModuleTitle, m.LessonOrder
      FROM progress p
      JOIN user u ON p.UserID = u.UserID
      JOIN module m ON p.ModuleID = m.ModuleID
      WHERE u.Role = 'student' AND m.Is_Deleted = FALSE
      ORDER BY p.DateStarted DESC
      LIMIT 10
    `);
    enrollments.forEach(e => {
      notifications.push({
        date: e.DateStarted,
        message: `${e.Name} started Lesson ${e.LessonOrder}: ${e.ModuleTitle}.`,
        type: 'enrollment'
      });
    });

    // Recent completions
    const completions = await query(`
      SELECT u.Name, p.DateCompletion, m.ModuleTitle, m.LessonOrder
      FROM progress p
      JOIN user u ON p.UserID = u.UserID
      JOIN module m ON p.ModuleID = m.ModuleID
      WHERE p.CompletionRate >= 100 AND p.DateCompletion IS NOT NULL AND u.Role = 'student' AND m.Is_Deleted = FALSE
      ORDER BY p.DateCompletion DESC
      LIMIT 10
    `);
    completions.forEach(c => {
      notifications.push({
        date: c.DateCompletion,
        message: `${c.Name} completed Lesson ${c.LessonOrder}: ${c.ModuleTitle}.`,
        type: 'completion'
      });
    });

    // Recent account registrations
    const newUsers = await query(`
      SELECT Name, created_at
      FROM user
      WHERE Role = 'student'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    newUsers.forEach(u => {
      notifications.push({
        date: u.created_at,
        message: `${u.Name} has enrolled in ModuLearn.`,
        type: 'new_user'
      });
    });

    // Recent issue reports
    const issues = await query(`
      SELECT u.Name, r.created_at, r.IssueType, r.LessonTitle
      FROM issue_reports r
      JOIN user u ON r.UserID = u.UserID
      ORDER BY r.created_at DESC
      LIMIT 5
    `);
    issues.forEach(i => {
      notifications.push({
        date: i.created_at,
        message: `${i.Name} reported an issue: ${i.IssueType}${i.LessonTitle ? ` in ${i.LessonTitle}` : ''}.`,
        type: 'issue'
      });
    });

    // Sort all by date descending and take top 20
    notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
    const topNotifications = notifications.slice(0, 20).map(n => ({
      ...n,
      date: new Date(n.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    }));

    res.json(topNotifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT /api/admin/reports/:id/resolve - Mark report as resolved
router.put('/reports/:id/resolve', [
  param('id').isInt().withMessage('Valid report ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(
      'UPDATE issue_reports SET Status = ? WHERE ReportID = ?',
      ['resolved', id]
    );
    
    res.json({ message: 'Report marked as resolved' });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update report status'
    });
  }
});

// =====================
// Simulation editor API
// =====================

const clearSimulationAdminCaches = () => {
  clearNamespace('simulations:list');
  clearNamespace('simulations:item');
};

// GET /api/admin/simulations - List all simulations (admin view)
router.get('/simulations', async (req, res) => {
  try {
    await ensureSimulationTable();

    if (await detectSimulationTableMissing()) {
      return res.json([]);
    }

    const columns = await ensureSimulationAdminColumns();
    const selectFields = [
      '`SimulationID`',
      '`SimulationTitle`',
      simulationSelectField(columns, 'ModuleID', '0'),
      simulationSelectField(columns, 'Description', "''"),
      simulationSelectField(columns, 'ActivityType', "''"),
      simulationSelectField(columns, 'SkillType', "''"),
      simulationSelectField(columns, 'MaxScore', '0'),
      simulationSelectField(columns, 'TimeLimit', '0'),
      simulationSelectField(columns, 'SimulationOrder', '0'),
      columns.has('ZoneData')
        ? "(CASE WHEN `ZoneData` IS NULL OR TRIM(`ZoneData`) = '' THEN 0 ELSE 1 END) AS `HasAdminOverride`"
        : '0 AS `HasAdminOverride`'
    ];
    const orderBySql = columns.has('SimulationOrder')
      ? 'ORDER BY `SimulationOrder` ASC, `SimulationID` ASC'
      : 'ORDER BY `SimulationID` ASC';

    let rows;
    try {
      const [orderedRows] = await pool.query(
        `SELECT ${selectFields.join(', ')}
         FROM simulation
         ${orderBySql}`
      );
      rows = orderedRows;
    } catch (queryError) {
      // Some hosted MySQL plans are configured with very small sort buffers.
      // Retry without ORDER BY and sort in Node to keep admin tooling usable.
      if (queryError?.code !== 'ER_OUT_OF_SORTMEMORY') {
        throw queryError;
      }

      const [unorderedRows] = await pool.query(
        `SELECT ${selectFields.join(', ')}
         FROM simulation`
      );
      rows = unorderedRows;
    }

    const simulations = rows.map((row) => {
      const activityOrder = resolveActivityOrder(row);
      return {
        SimulationID: row.SimulationID,
        SimulationTitle: row.SimulationTitle,
        ModuleID: row.ModuleID,
        Description: row.Description,
        ActivityType: row.ActivityType,
        SkillType: row.SkillType,
        MaxScore: row.MaxScore,
        TimeLimit: row.TimeLimit,
        SimulationOrder: row.SimulationOrder,
        activityOrder,
        hasAdminOverride: Boolean(Number(row.HasAdminOverride || 0))
      };
    });

    simulations.sort((a, b) => {
      const leftOrder = Number.isFinite(Number(a.SimulationOrder)) ? Number(a.SimulationOrder) : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(Number(b.SimulationOrder)) ? Number(b.SimulationOrder) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;

      const leftId = Number.isFinite(Number(a.SimulationID)) ? Number(a.SimulationID) : Number.MAX_SAFE_INTEGER;
      const rightId = Number.isFinite(Number(b.SimulationID)) ? Number(b.SimulationID) : Number.MAX_SAFE_INTEGER;
      return leftId - rightId;
    });

    res.json(simulations);
  } catch (error) {
    console.error('List admin simulations error:', {
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      message: error?.message
    });
    if (isSimulationSchemaError(error)) {
      // Schema isn't ready yet — surface an empty list rather than a hard 500
      // so the admin UI stays usable and the learner manifests can still be edited.
      return res.json([]);
    }
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to list simulations: ${error?.code || error?.message || 'unknown error'}`
    });
  }
});

// GET /api/admin/simulations/:id - Get merged config for the simulation editor
router.get('/simulations/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid simulation ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    await ensureSimulationTable();
    const columns = await ensureSimulationAdminColumns();
    const selectFields = [
      '`SimulationID`',
      '`SimulationTitle`',
      simulationSelectField(columns, 'ModuleID', '0'),
      simulationSelectField(columns, 'Description', "''"),
      simulationSelectField(columns, 'ActivityType', "''"),
      simulationSelectField(columns, 'SkillType', "''"),
      simulationSelectField(columns, 'MaxScore', '0'),
      simulationSelectField(columns, 'TimeLimit', '0'),
      simulationSelectField(columns, 'SimulationOrder', '0'),
      simulationSelectField(columns, 'ZoneData', 'NULL')
    ];

    const [rows] = await pool.query(
      `SELECT ${selectFields.join(', ')} FROM simulation WHERE SimulationID = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Simulation not found' });
    }

    const simulation = rows[0];
    const { activityOrder, source, config } = getSimulationConfig(simulation);

    res.json({
      simulation: {
        SimulationID: simulation.SimulationID,
        SimulationTitle: simulation.SimulationTitle,
        ModuleID: simulation.ModuleID,
        Description: simulation.Description,
        ActivityType: simulation.ActivityType,
        SkillType: simulation.SkillType,
        MaxScore: simulation.MaxScore,
        TimeLimit: simulation.TimeLimit,
        SimulationOrder: simulation.SimulationOrder
      },
      activityOrder,
      source,
      config
    });
  } catch (error) {
    console.error('Get simulation config error:', {
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      message: error?.message
    });
    if (isMissingSimulationTableError(error)) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simulation table is missing on this deployment. Run the simulation table migration first.'
      });
    }
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to load simulation: ${error?.code || error?.message || 'unknown error'}`
    });
  }
});

// PUT /api/admin/simulations/:id - Save edited config (meta + timeline) into ZoneData
router.put('/simulations/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid simulation ID'),
  body('config').isObject().withMessage('config object is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { config, simulation: simPatch } = req.body;
    const columns = await ensureSimulationAdminColumns();

    const [rows] = await pool.query(
      'SELECT SimulationID, SimulationTitle, SimulationOrder FROM simulation WHERE SimulationID = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Simulation not found' });
    }

    const activityOrder = resolveActivityOrder(rows[0]);
    const normalized = normalizeStoredConfig(config, activityOrder);

    const fields = [];
    const values = [];

    if (columns.has('ZoneData')) {
      fields.push('ZoneData = ?');
      values.push(JSON.stringify(normalized));
    }

    if (simPatch && typeof simPatch === 'object') {
      if (typeof simPatch.SimulationTitle === 'string') {
        fields.push('SimulationTitle = ?');
        values.push(simPatch.SimulationTitle.trim());
      }
      if (typeof simPatch.Description === 'string' && columns.has('Description')) {
        fields.push('Description = ?');
        values.push(simPatch.Description);
      }
      if (Number.isFinite(Number(simPatch.MaxScore)) && columns.has('MaxScore')) {
        fields.push('MaxScore = ?');
        values.push(Number(simPatch.MaxScore));
      }
      if (Number.isFinite(Number(simPatch.TimeLimit)) && columns.has('TimeLimit')) {
        fields.push('TimeLimit = ?');
        values.push(Number(simPatch.TimeLimit));
      }
    }

    if (fields.length === 0) {
      return res.status(409).json({
        error: 'Database schema not ready',
        message: 'Simulation editor changes cannot be saved yet. Run the simulation migration to add the ZoneData column.'
      });
    }

    values.push(id);
    await pool.query(`UPDATE simulation SET ${fields.join(', ')} WHERE SimulationID = ?`, values);
    clearSimulationAdminCaches();

    if (!columns.has('ZoneData')) {
      return res.json({
        message: 'Simulation details saved (ZoneData is unavailable on this database).',
        activityOrder,
        config: normalized,
        warning: 'Timeline and step edits were not persisted because ZoneData is missing.'
      });
    }

    res.json({ message: 'Simulation saved', activityOrder, config: normalized });
  } catch (error) {
    console.error('Save simulation config error:', error);
    if (isMissingSimulationTableError(error)) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simulation table is missing on this deployment. Run the simulation table migration first.'
      });
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save simulation' });
  }
});

// DELETE /api/admin/simulations/:id/override - Clear admin override; revert to on-disk manifest
router.delete('/simulations/:id/override', [
  param('id').isInt({ min: 1 }).withMessage('Invalid simulation ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const columns = await ensureSimulationAdminColumns();

    if (!columns.has('ZoneData')) {
      return res.json({ message: 'Override storage is not available on this database; manifest fallback is already active.' });
    }

    await pool.query('UPDATE simulation SET ZoneData = NULL WHERE SimulationID = ?', [id]);
    clearSimulationAdminCaches();
    res.json({ message: 'Override cleared — simulation will use the on-disk manifest again.' });
  } catch (error) {
    console.error('Clear simulation override error:', error);
    if (isMissingSimulationTableError(error)) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simulation table is missing on this deployment. Run the simulation table migration first.'
      });
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to clear override' });
  }
});

// GET /api/admin/simulations/:id/assets - List available webp assets for editor pickers
router.get('/simulations/:id/assets', [
  param('id').isInt({ min: 1 }).withMessage('Invalid simulation ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT SimulationID, SimulationTitle, SimulationOrder FROM simulation WHERE SimulationID = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Simulation not found' });
    }
    const activityOrder = resolveActivityOrder(rows[0]);
    const assets = listActivityAssets(activityOrder);
    res.json({ activityOrder, assets });
  } catch (error) {
    console.error('List simulation assets error:', error);
    if (isMissingSimulationTableError(error)) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simulation table is missing on this deployment. Run the simulation table migration first.'
      });
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list assets' });
  }
});

module.exports = router;
