// Admin Module Routes
// Admin-only routes for managing lessons and modules

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
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
const { getUserIdentityColumn } = require('../utils/userIdentity');
const {
  getSimulationConfig,
  normalizeStoredConfig,
  listActivityAssets,
  resolveActivityOrder,
  FALLBACK_META,
  readSimulationOverride,
  writeSimulationOverride,
  clearSimulationOverride,
  hasSimulationOverride,
  compactStoredConfig
} = require('../utils/simulationConfig');
const { clearSimulationColumnCache } = require('../controllers/simulationController');

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
      'Instructions',
      'Is_Locked',
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
      clearSimulationColumnCache();
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
        MaxScore INT DEFAULT 100,
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
            100,
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
  body('Description').optional(),
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
  body('Description').optional(),
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

    // SAFEGUARD: Preserve user progress before updating lesson
    // This ensures that admin edits don't accidentally reset user progress
    const existingProgress = await query(
      `SELECT ProgressID, UserID, CompletionRate, DateStarted, DateCompletion
         FROM progress WHERE ModuleID = ?`,
      [id]
    );
    console.log(`Found ${existingProgress.length} user progress records for module ${id}`);

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

    // SAFEGUARD: Verify progress records are still intact after module update
    // If any progress records were lost, this is a critical error
    const progressAfterUpdate = await query(
      `SELECT COUNT(*) as count FROM progress WHERE ModuleID = ?`,
      [id]
    );
    const progressCountAfter = progressAfterUpdate[0]?.count || 0;

    if (existingProgress.length > 0 && progressCountAfter === 0) {
      console.error(`CRITICAL: User progress was lost during module ${id} update. ${existingProgress.length} progress records were deleted.`);
      // Attempt to restore progress records if they were accidentally deleted
      for (const progressRecord of existingProgress) {
        try {
          await query(
            `INSERT IGNORE INTO progress (ProgressID, UserID, ModuleID, CompletionRate, DateStarted, DateCompletion)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [progressRecord.ProgressID, progressRecord.UserID, id, progressRecord.CompletionRate, progressRecord.DateStarted, progressRecord.DateCompletion]
          );
          console.log(`Restored progress record ${progressRecord.ProgressID} for user ${progressRecord.UserID}`);
        } catch (restoreErr) {
          console.error(`Failed to restore progress record ${progressRecord.ProgressID}:`, restoreErr.message);
        }
      }
    }

    console.log('Module updated successfully');
    
    res.json({
      message: 'Module updated successfully',
      normalizationWarnings,
      progressPreserved: {
        count: existingProgress.length,
        status: progressCountAfter > 0 ? 'preserved' : (existingProgress.length === 0 ? 'none' : 'warning')
      }
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

// (Retired) PUT /api/admin/modules/:id/lock-state — lesson unlock is now
// derived per-user from each learner's progress, so admins no longer
// toggle a global flag. Endpoint removed; the legacy module.Is_Unlocked
// column is ignored at runtime (see moduleController + progressController).

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

    const identityColumn = await getUserIdentityColumn();

    const reports = await query(`
      SELECT 
        r.ReportID,
        r.IssueType as Category,
        r.UserID,
        u.Name as Name,
        u.${identityColumn} as Username,
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

// GET /api/admin/dashboard/certified - Count learners eligible for certification
router.get('/dashboard/certified', async (req, res) => {
  try {
    await ensureModuleAdminColumns();

    const CORE_SIM_LIMIT = 20;

    // Count total non-supplementary modules
    const [{ totalModules }] = await query(`
      SELECT COUNT(DISTINCT LessonOrder) AS totalModules
      FROM module
      WHERE Is_Deleted = FALSE AND (Difficulty IS NULL OR LOWER(Difficulty) != 'supplementary')
    `);

    if (Number(totalModules) === 0) {
      return res.json({ count: 0 });
    }

    // Count total core simulations
    const [{ totalSims }] = await query(
      'SELECT COUNT(*) AS totalSims FROM simulation WHERE SimulationOrder > 0 AND SimulationOrder <= ?',
      [CORE_SIM_LIMIT]
    ).catch(() => [{ totalSims: 0 }]);

    // Get all students who completed all required modules
    const completedModules = await query(`
      SELECT DISTINCT p.UserID
      FROM progress p
      JOIN module m ON m.ModuleID = p.ModuleID
      WHERE p.CompletionRate >= 100
        AND m.Is_Deleted = FALSE
        AND (m.Difficulty IS NULL OR LOWER(m.Difficulty) != 'supplementary')
      GROUP BY p.UserID
      HAVING COUNT(DISTINCT m.LessonOrder) = ?
    `, [totalModules]);

    let eligibleUserIds = completedModules.map(row => row.UserID);

    // If there are core simulations, filter for users who completed all of them
    if (Number(totalSims) > 0 && eligibleUserIds.length > 0) {
      const simTable = await query('SHOW TABLES LIKE \'simulation_progress\'').catch(() => []);

      if (simTable.length > 0) {
        const userPlaceholders = eligibleUserIds.map(() => '?').join(',');
        const completedAllSims = await query(`
          SELECT DISTINCT sp.UserID
          FROM simulation_progress sp
          JOIN simulation s ON s.SimulationID = sp.SimulationID
          WHERE sp.UserID IN (${userPlaceholders})
            AND s.SimulationOrder > 0 AND s.SimulationOrder <= ?
            AND sp.CompletionStatus = 'completed'
          GROUP BY sp.UserID
          HAVING COUNT(DISTINCT s.SimulationID) = ?
        `, [...eligibleUserIds, CORE_SIM_LIMIT, totalSims]).catch(() => []);

        eligibleUserIds = completedAllSims.map(row => row.UserID);
      }
    }

    res.json({ count: eligibleUserIds.length });
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

// GET /api/admin/dashboard/notifications - Rare-event admin notifications.
// Only surfaces events that warrant admin attention:
//   - A learner has completed and passed every active lesson (course finished)
//   - A learner submitted an issue report
//   - (TODO) A learner requested a password reset, once that flow exists
router.get('/dashboard/notifications', async (req, res) => {
  try {
    await ensureModuleAdminColumns();

    const notifications = [];

    // Stable per-event ID lets the frontend dismiss specific notifications.
    const buildId = (type, ...parts) => `${type}:${parts.join(':')}`;

    // Learners who finished every active module (one notification per learner).
    const fullyCompleted = await query(`
      SELECT u.UserID, u.Name, MAX(p.DateCompletion) AS LastCompletion
      FROM user u
      JOIN progress p ON p.UserID = u.UserID
      JOIN module m ON p.ModuleID = m.ModuleID
      WHERE u.Role = 'student'
        AND m.Is_Deleted = FALSE
        AND p.CompletionRate >= 100
        AND p.DateCompletion IS NOT NULL
      GROUP BY u.UserID, u.Name
      HAVING COUNT(DISTINCT p.ModuleID) >= (
        SELECT COUNT(*) FROM module WHERE Is_Deleted = FALSE
      )
      ORDER BY LastCompletion DESC
      LIMIT 50
    `);

    // Check which of those learners also completed all core simulations
    const CERT_SIM_LIMIT = 20;
    let simTableAvailable = false;
    let totalCoreSims = 0;
    try {
      const simCheck = await query('SHOW TABLES LIKE \'simulation_progress\'');
      simTableAvailable = simCheck.length > 0;
      if (simTableAvailable) {
        const [{ cnt }] = await query(
          'SELECT COUNT(*) AS cnt FROM simulation WHERE SimulationOrder > 0 AND SimulationOrder <= ?',
          [CERT_SIM_LIMIT]
        );
        totalCoreSims = Number(cnt);
      }
    } catch {}

    for (const r of fullyCompleted) {
      let certEligible = false;
      if (simTableAvailable && totalCoreSims > 0) {
        try {
          const [{ completedSims }] = await query(`
            SELECT COUNT(*) AS completedSims
            FROM simulation_progress sp
            JOIN simulation s ON s.SimulationID = sp.SimulationID
            WHERE sp.UserID = ? AND s.SimulationOrder > 0 AND s.SimulationOrder <= ?
              AND sp.CompletionStatus = 'completed'
          `, [r.UserID, CERT_SIM_LIMIT]);
          certEligible = Number(completedSims) >= totalCoreSims;
        } catch {}
      } else {
        certEligible = true; // No sim table yet — lesson completion is sufficient
      }

      if (certEligible) {
        notifications.push({
          id: buildId('cert_eligible', r.UserID),
          date: r.LastCompletion,
          message: `${r.Name} is eligible for certification — completed all lessons and simulations.`,
          type: 'cert_eligible'
        });
      } else {
        notifications.push({
          id: buildId('all_lessons_completed', r.UserID),
          date: r.LastCompletion,
          message: `${r.Name} completed and passed every lesson.`,
          type: 'all_lessons_completed'
        });
      }
    }

    // Helper to strip HTML tags
    const stripHtmlTags = (html = '') => {
      return String(html || '').replace(/<[^>]*>/g, '').trim();
    };

    // Issue reports (rare, admin-actionable).
    const issues = await query(`
      SELECT r.ReportID, u.Name, r.created_at, r.IssueType, r.LessonTitle
      FROM issue_reports r
      JOIN user u ON r.UserID = u.UserID
      ORDER BY r.created_at DESC
      LIMIT 50
    `);
    issues.forEach((i) => {
      const cleanLessonTitle = i.LessonTitle ? stripHtmlTags(i.LessonTitle) : '';
      notifications.push({
        id: buildId('issue', i.ReportID),
        date: i.created_at,
        message: `${i.Name} reported an issue: ${i.IssueType}${cleanLessonTitle ? ` in ${cleanLessonTitle}` : ''}.`,
        type: 'issue'
      });
    });

    // Password reset requests from learners.
    try {
      const resetRequests = await query(`
        SELECT r.RequestID, r.Username, r.RequestedAt
        FROM password_reset_requests r
        WHERE r.Resolved = FALSE
        ORDER BY r.RequestedAt DESC
        LIMIT 50
      `);
      resetRequests.forEach((r) => {
        notifications.push({
          id: buildId('password_reset', r.RequestID),
          date: r.RequestedAt,
          message: `${r.Username} requested a password reset.`,
          type: 'password_reset',
          requestId: r.RequestID,
        });
      });
    } catch {
      // Table may not exist yet if no request has been submitted — safe to skip.
    }

    notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
    const formatted = notifications.map((n) => ({
      ...n,
      date: new Date(n.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    }));

    res.json(formatted);
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

    // Create a notification for the user who submitted the report
    const reports = await query('SELECT UserID, IssueType FROM issue_reports WHERE ReportID = ?', [id]);
    if (reports.length > 0) {
      const { UserID, IssueType } = reports[0];
      await query(`
        CREATE TABLE IF NOT EXISTS user_notifications (
          NotificationID INT AUTO_INCREMENT PRIMARY KEY,
          UserID INT NOT NULL,
          Type VARCHAR(50) NOT NULL,
          Title VARCHAR(255) NOT NULL,
          Message TEXT NOT NULL,
          IsRead BOOLEAN DEFAULT FALSE,
          ReferenceID INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE
        )
      `);
      await query(
        'INSERT INTO user_notifications (UserID, Type, Title, Message, ReferenceID) VALUES (?, ?, ?, ?, ?)',
        [
          UserID,
          'report_resolved',
          'Problem Report Resolved',
          `Your reported issue (${IssueType}) has been reviewed and resolved by the admin.`,
          Number(id),
        ]
      );
    }

    res.json({ message: 'Report marked as resolved' });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update report status'
    });
  }
});

// POST /api/admin/users/:id/reset-password - Reset a learner's password to the default
router.post('/users/:id/reset-password', [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const defaultPassword = 'user1234';
    const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
    const hashedPassword = await bcrypt.hash(defaultPassword, rounds);

    const result = await query(
      'UPDATE user SET Password = ? WHERE UserID = ?',
      [hashedPassword, id]
    );

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // Create a notification reminding the user to change their default password
    await query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        NotificationID INT AUTO_INCREMENT PRIMARY KEY,
        UserID INT NOT NULL,
        Type VARCHAR(50) NOT NULL,
        Title VARCHAR(255) NOT NULL,
        Message TEXT NOT NULL,
        IsRead BOOLEAN DEFAULT FALSE,
        ReferenceID INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE
      )
    `);
    await query(
      'INSERT INTO user_notifications (UserID, Type, Title, Message) VALUES (?, ?, ?, ?)',
      [
        Number(id),
        'password_reset',
        'Password Has Been Reset',
        'Your account password was reset to the default by an admin. Please go to your Profile settings and change your password to keep your account secure.',
      ]
    );

    res.json({ ok: true, UserID: Number(id), defaultPassword });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reset password' });
  }
});

// =====================
// Simulation editor API
// =====================

const clearSimulationAdminCaches = () => {
  clearNamespace('simulations:list');
  clearNamespace('simulations:item');
};

// Simulations 1..CORE_SIMULATION_LIMIT are part of the core curriculum and feed
// the algorithm. Anything beyond is "supplementary" — admin-creatable and
// admin-deletable, never moves the learner's mastery numbers.
const CORE_SIMULATION_LIMIT = 20;

const { ensureCoreSimulationPlaceholders } = require('../utils/coreSimulationBackfill');

// GET /api/admin/simulations - List all simulations (admin view)
router.get('/simulations', async (req, res) => {
  try {
    await ensureSimulationTable();

    if (await detectSimulationTableMissing()) {
      return res.json([]);
    }

    const backfillResult = await ensureCoreSimulationPlaceholders();
    if (backfillResult?.inserted > 0) {
      clearNamespace('simulations:list');
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
      simulationSelectField(columns, 'LessonNumber', 'NULL'),
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
        LessonNumber: row.LessonNumber != null ? Number(row.LessonNumber) : null,
        activityOrder,
        hasAdminOverride: Boolean(Number(row.HasAdminOverride || 0)) || hasSimulationOverride(row.SimulationID)
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

// POST /api/admin/simulations - Create a new simulation activity.
// mode = 'core' fills the lowest empty SimulationOrder in 1..CORE_SIMULATION_LIMIT
//   and refuses if every core slot is already taken.
// mode = 'supplementary' (default) slots after the core range so the new sim
//   is excluded from the algorithm.
router.post('/simulations', [
  body('SimulationTitle').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('ModuleID').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('Module ID must be a positive integer'),
  body('ActivityType').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
  body('Description').optional({ nullable: true, checkFalsy: true }).trim(),
  body('mode').optional({ nullable: true, checkFalsy: true }).isIn(['core', 'supplementary']).withMessage("mode must be 'core' or 'supplementary'"),
  handleValidationErrors
], async (req, res) => {
  try {
    await ensureSimulationTable();
    const columns = await ensureSimulationAdminColumns();

    const { SimulationTitle, ModuleID, ActivityType, Description } = req.body;
    const mode = String(req.body.mode || 'supplementary').toLowerCase();

    const rawModuleId = Number(ModuleID);
    const resolvedModuleId = Number.isFinite(rawModuleId) && rawModuleId > 0 ? rawModuleId : null;

    let nextOrder;
    if (mode === 'core') {
      // Find the lowest SimulationOrder in 1..CORE_SIMULATION_LIMIT that
      // doesn't already exist. If every core slot is taken, refuse.
      const [coreRows] = await pool.query(
        'SELECT SimulationOrder FROM simulation WHERE SimulationOrder BETWEEN 1 AND ?',
        [CORE_SIMULATION_LIMIT]
      );
      const coreTaken = new Set(coreRows.map((r) => Number(r.SimulationOrder)));
      let firstFreeCoreSlot = null;
      for (let n = 1; n <= CORE_SIMULATION_LIMIT; n += 1) {
        if (!coreTaken.has(n)) { firstFreeCoreSlot = n; break; }
      }
      if (firstFreeCoreSlot === null) {
        return res.status(409).json({
          error: 'Conflict',
          message: `All ${CORE_SIMULATION_LIMIT} core simulation slots are already filled. Use the supplementary option instead.`
        });
      }
      nextOrder = firstFreeCoreSlot;
    } else {
      // Supplementary — slot strictly after the core range.
      const [maxRows] = await pool.query('SELECT COALESCE(MAX(SimulationOrder), 0) AS maxOrder FROM simulation');
      const observedMax = Number(maxRows?.[0]?.maxOrder || 0);
      nextOrder = Math.max(observedMax, CORE_SIMULATION_LIMIT) + 1;
    }

    // Mirror the canonical seed in ensureSimulationTable so every column the
    // production schema marks as NOT NULL gets a value. (Production was
    // throwing ER_NO_DEFAULT_FOR_FIELD because Instructions / etc. lacked a
    // default and we weren't supplying one.)
    const cols = [];
    const vals = [];
    const push = (name, value) => {
      if (!columns.has(name)) return;
      cols.push(name);
      vals.push(value);
    };

    push('SimulationTitle', SimulationTitle);
    push('Description', Description || '');
    push('ActivityType', ActivityType || 'Disassembling');
    push('MaxScore', 100);
    push('TimeLimit', 0);
    push('Instructions', '');
    push('SimulationOrder', nextOrder);
    push('Is_Locked', false);
    if (columns.has('ModuleID')) push('ModuleID', resolvedModuleId);

    // SimulationTitle is the one column we can't fall back on — and the
    // schema enforces it NOT NULL — so guard explicitly.
    if (!cols.includes('SimulationTitle')) {
      cols.unshift('SimulationTitle');
      vals.unshift(SimulationTitle);
    }

    const placeholders = cols.map(() => '?');
    const [result] = await pool.query(
      `INSERT INTO simulation (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders.join(', ')})`,
      vals
    );

    clearSimulationAdminCaches();

    res.status(201).json({
      SimulationID: result.insertId,
      SimulationTitle,
      ModuleID: resolvedModuleId,
      ActivityType: ActivityType || null,
      Description: Description || null,
      SimulationOrder: nextOrder
    });
  } catch (error) {
    console.error('Create simulation error:', {
      code: error?.code,
      message: error?.message
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to create simulation: ${error?.code || error?.message || 'unknown error'}`
    });
  }
});

// PATCH /api/admin/simulations/:id - Update lightweight simulation metadata (e.g. SkillType)
router.patch('/simulations/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid simulation ID'),
  body('SkillType').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('ActivityType').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('LessonNumber').optional({ nullable: true }).isInt({ min: 1 }).withMessage('LessonNumber must be a positive integer'),
  handleValidationErrors
], async (req, res) => {
  try {
    await ensureSimulationTable();
    let columns = await ensureSimulationAdminColumns();

    const id = Number(req.params.id);
    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body, 'SkillType')) {
      if (!columns.has('SkillType')) {
        try {
          await pool.query('ALTER TABLE simulation ADD COLUMN SkillType VARCHAR(100) NULL');
          columns = await getSimulationAdminColumnSet({ forceRefresh: true });
        } catch (alterError) {
          if (alterError?.code !== 'ER_DUP_FIELDNAME') throw alterError;
        }
      }
      updates.push('`SkillType` = ?');
      values.push(req.body.SkillType ? String(req.body.SkillType).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'ActivityType')) {
      if (!columns.has('ActivityType')) {
        try {
          await pool.query('ALTER TABLE simulation ADD COLUMN ActivityType VARCHAR(100) NULL');
          columns = await getSimulationAdminColumnSet({ forceRefresh: true });
        } catch (alterError) {
          if (alterError?.code !== 'ER_DUP_FIELDNAME') throw alterError;
        }
      }
      updates.push('`ActivityType` = ?');
      values.push(req.body.ActivityType ? String(req.body.ActivityType).trim() : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'LessonNumber')) {
      if (!columns.has('LessonNumber')) {
        try {
          await pool.query('ALTER TABLE simulation ADD COLUMN LessonNumber INT NULL');
          columns = await getSimulationAdminColumnSet({ forceRefresh: true });
        } catch (alterError) {
          if (alterError?.code !== 'ER_DUP_FIELDNAME') throw alterError;
        }
      }
      updates.push('`LessonNumber` = ?');
      const ln = req.body.LessonNumber;
      values.push(ln != null ? Number(ln) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'No updatable fields provided' });
    }

    values.push(id);
    const [result] = await pool.query(
      `UPDATE simulation SET ${updates.join(', ')} WHERE SimulationID = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Simulation not found' });
    }

    clearSimulationAdminCaches();
    res.json({
      ok: true,
      SimulationID: id,
      SkillType: req.body.SkillType ?? null,
      ActivityType: req.body.ActivityType ?? null,
      LessonNumber: req.body.LessonNumber != null ? Number(req.body.LessonNumber) : null,
    });
  } catch (error) {
    console.error('Patch simulation error:', { code: error?.code, message: error?.message });
    res.status(500).json({ error: 'Internal Server Error', message: `Failed to update simulation: ${error?.code || error?.message || 'unknown error'}` });
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
      simulationSelectField(columns, 'LessonNumber', 'NULL'),
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
    const overrideZoneData = simulation.ZoneData || readSimulationOverride(id);
    const { activityOrder, source, config } = getSimulationConfig(simulation, { overrideZoneData });

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
        SimulationOrder: simulation.SimulationOrder,
        LessonNumber: simulation.LessonNumber != null ? Number(simulation.LessonNumber) : null,
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
    await ensureSimulationTable();
    const columns = await ensureSimulationAdminColumns();

    const selectFields = [
      '`SimulationID`',
      '`SimulationTitle`',
      simulationSelectField(columns, 'SimulationOrder', '0')
    ];

    const [rows] = await pool.query(
      `SELECT ${selectFields.join(', ')} FROM simulation WHERE SimulationID = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Simulation not found' });
    }

    const activityOrder = resolveActivityOrder(rows[0]);
    const normalized = normalizeStoredConfig(config, activityOrder);
    const compacted = compactStoredConfig(normalized);

    const fields = [];
    const values = [];
    const hasZoneDataColumn = columns.has('ZoneData');
    let overrideWritten = false;

    try {
      overrideWritten = writeSimulationOverride(id, compacted);
    } catch (writeError) {
      console.warn('Simulation override write failed; continuing with database save when possible:', {
        code: writeError?.code,
        errno: writeError?.errno,
        message: writeError?.message
      });
    }

    if (hasZoneDataColumn) {
      fields.push('ZoneData = ?');
      values.push(JSON.stringify(compacted));
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

    if (fields.length > 0) {
      values.push(id);
      try {
        await pool.query(`UPDATE simulation SET ${fields.join(', ')} WHERE SimulationID = ?`, values);
      } catch (updateError) {
        console.warn('Simulation DB save failed; keeping file override fallback:', {
          code: updateError?.code,
          errno: updateError?.errno,
          message: updateError?.message
        });

        if (overrideWritten) {
          return res.json({
            message: 'Simulation saved using local override storage.',
            activityOrder,
            config: compacted,
            source: 'file-override',
            fallbackReason: updateError?.code || updateError?.message || 'database-save-failed'
          });
        }

        throw updateError;
      }
    }
    clearSimulationAdminCaches();

    if (hasZoneDataColumn) {
      try {
        clearSimulationOverride(id);
      } catch (clearError) {
        console.warn('Simulation override cleanup failed after database save:', {
          code: clearError?.code,
          errno: clearError?.errno,
          message: clearError?.message
        });
      }
    } else {
      return res.json({
        message: 'Simulation saved using local override storage.',
        activityOrder,
        config: compacted,
        source: 'file-override'
      });
    }

    res.json({ message: 'Simulation saved', activityOrder, config: compacted });
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

    if (columns.has('ZoneData')) {
      await pool.query('UPDATE simulation SET ZoneData = NULL WHERE SimulationID = ?', [id]);
    }

    clearSimulationOverride(id);
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

// DELETE /api/admin/simulations/:id - Permanently delete a simulation.
router.delete('/simulations/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid simulation ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT SimulationID FROM simulation WHERE SimulationID = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Simulation not found' });
    }

    await pool.query('DELETE FROM simulation WHERE SimulationID = ?', [id]);
    clearSimulationAdminCaches();
    res.json({ ok: true, SimulationID: Number(id) });
  } catch (error) {
    console.error('Delete simulation error:', { code: error?.code, message: error?.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to delete simulation: ${error?.code || error?.message || 'unknown error'}`
    });
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

// ─── Certificate Template ────────────────────────────────────────────────────

const CERT_TEMPLATE_DIR = path.join(__dirname, '..', 'uploads', 'cert-template');
const CERT_META_FILE = path.join(CERT_TEMPLATE_DIR, 'meta.json');
const CORE_SIM_LIMIT = 20;

const ensureCertDir = () => fs.mkdirSync(CERT_TEMPLATE_DIR, { recursive: true });

const getCertMeta = () => {
  try {
    if (fs.existsSync(CERT_META_FILE)) {
      return JSON.parse(fs.readFileSync(CERT_META_FILE, 'utf8'));
    }
  } catch {}
  return null;
};

const certStorage = multer.diskStorage({
  destination: (req, file, cb) => { ensureCertDir(); cb(null, CERT_TEMPLATE_DIR); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `template${ext}`);
  }
});

const certUpload = multer({
  storage: certStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    const okPdf = ext === '.pdf' && mime === 'application/pdf';
    const okImage = /^\.(webp|png|jpe?g|gif|bmp|tiff?)$/.test(ext) && mime.startsWith('image/');
    if (okPdf || okImage) return cb(null, true);
    cb(new Error('Only PDF or image files (WebP, PNG, JPG, GIF, BMP, TIFF) are allowed (max 10 MB).'));
  }
});

// GET /api/admin/certificate/template — current template metadata
router.get('/certificate/template', authenticate, requireAdmin, (req, res) => {
  const meta = getCertMeta();
  if (!meta) return res.json({ template: null });
  res.json({ template: meta });
});

// POST /api/admin/certificate/template — upload / replace template
router.post('/certificate/template', authenticate, requireAdmin,
  (req, res, next) => {
    certUpload.single('template')(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? 'File exceeds the 10 MB limit.'
          : (err.message || 'Upload failed.');
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const meta = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };
    ensureCertDir();
    fs.writeFileSync(CERT_META_FILE, JSON.stringify(meta, null, 2));
    res.json({ message: 'Certificate template uploaded.', template: meta });
  }
);

// DELETE /api/admin/certificate/template — remove template
router.delete('/certificate/template', authenticate, requireAdmin, (req, res) => {
  const meta = getCertMeta();
  if (!meta) return res.status(404).json({ error: 'No template found.' });
  const filePath = path.join(CERT_TEMPLATE_DIR, meta.filename);
  try { fs.unlinkSync(filePath); } catch {}
  try { fs.unlinkSync(CERT_META_FILE); } catch {}
  res.json({ message: 'Certificate template removed.' });
});

// GET /api/admin/certificate/eligible — list users eligible for certification
router.get('/certificate/eligible', authenticate, requireAdmin, async (req, res) => {
  try {
    // Count total non-supplementary active modules
    const [{ totalModules }] = await query(`
      SELECT COUNT(DISTINCT LessonOrder) AS totalModules
      FROM module
      WHERE Is_Deleted = FALSE AND (Difficulty IS NULL OR LOWER(Difficulty) != 'supplementary')
    `);

    // Count core simulations
    const simCheck = await query('SHOW TABLES LIKE \'simulation_progress\'');
    const hasSimTable = simCheck.length > 0;

    let totalSims = 0;
    if (hasSimTable) {
      const [{ cnt }] = await query(
        `SELECT COUNT(*) AS cnt FROM simulation WHERE SimulationOrder > 0 AND SimulationOrder <= ?`,
        [CORE_SIM_LIMIT]
      );
      totalSims = cnt;
    }

    // Learners who completed all modules
    const lessonEligible = await query(`
      SELECT u.UserID, u.Name
      FROM user u
      WHERE u.Role = 'student' AND u.is_archived = FALSE
        AND (
          SELECT COUNT(DISTINCT m.LessonOrder)
          FROM progress p
          JOIN module m ON m.ModuleID = p.ModuleID
          WHERE p.UserID = u.UserID
            AND p.CompletionRate >= 100
            AND m.Is_Deleted = FALSE
            AND (m.Difficulty IS NULL OR LOWER(m.Difficulty) != 'supplementary')
        ) >= ?
    `, [totalModules]);

    if (!hasSimTable || totalSims === 0) {
      return res.json({ eligible: lessonEligible, totalModules, totalSims });
    }

    // Filter by simulation completion
    const eligible = [];
    for (const u of lessonEligible) {
      const [{ completedSims }] = await query(`
        SELECT COUNT(*) AS completedSims
        FROM simulation_progress sp
        JOIN simulation s ON s.SimulationID = sp.SimulationID
        WHERE sp.UserID = ? AND s.SimulationOrder > 0 AND s.SimulationOrder <= ?
          AND sp.CompletionStatus = 'completed'
      `, [u.UserID, CORE_SIM_LIMIT]);
      if (Number(completedSims) >= totalSims) eligible.push(u);
    }

    res.json({ eligible, totalModules, totalSims });
  } catch (err) {
    console.error('Certificate eligibility error:', err);
    res.status(500).json({ error: 'Failed to fetch eligibility data.' });
  }
});

const DEFAULT_CERT_TEXT_CONFIG = {
  name: { x: 15, y: 42, width: 70, height: 12 },
  date: { x: 25, y: 57, width: 50, height: 8 }
};

const hexToRgbPdf = (hex = '#000000') => {
  const h = hex.replace('#', '').padEnd(6, '0');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  };
};

// PUT /api/admin/certificate/template/config — save text placement config
router.put('/certificate/template/config', authenticate, requireAdmin, async (req, res) => {
  const meta = getCertMeta();
  if (!meta) return res.status(404).json({ error: 'No template uploaded yet.' });

  const { textConfig } = req.body;
  if (!textConfig || typeof textConfig !== 'object') {
    return res.status(400).json({ error: 'textConfig is required.' });
  }

  const updated = { ...meta, textConfig };
  ensureCertDir();
  fs.writeFileSync(CERT_META_FILE, JSON.stringify(updated, null, 2));
  res.json({ message: 'Text positions saved.', template: updated });
});

// POST /api/admin/certificate/generate-and-notify/:userId — generate certificate and notify learner
router.post('/certificate/generate-and-notify/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Invalid user ID.' });

    const meta = getCertMeta();
    if (!meta) return res.status(404).json({ error: 'No certificate template uploaded yet.' });

    // Check eligibility
    const users = await query('SELECT Name, UserID FROM user WHERE UserID = ? AND Role = ? AND is_archived = FALSE', [userId, 'student']);
    if (!users.length) return res.status(404).json({ error: 'User not found or not eligible.' });

    const userName = users[0].Name;

    // Check if already notified
    const existingNotif = await query(
      'SELECT NotificationID FROM user_notifications WHERE UserID = ? AND Type = ? LIMIT 1',
      [userId, 'certificate_ready']
    );

    if (existingNotif.length > 0) {
      return res.json({ message: 'User already notified about certificate.', alreadyNotified: true });
    }

    // Create the notification
    await query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        NotificationID INT AUTO_INCREMENT PRIMARY KEY,
        UserID INT NOT NULL,
        Type VARCHAR(50) NOT NULL,
        Title VARCHAR(255) NOT NULL,
        Message TEXT NOT NULL,
        IsRead BOOLEAN DEFAULT FALSE,
        ReferenceID INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE
      )
    `);

    await query(
      'INSERT INTO user_notifications (UserID, Type, Title, Message) VALUES (?, ?, ?, ?)',
      [
        userId,
        'certificate_ready',
        'Your Certificate is Ready',
        `Congratulations! Your certificate is ready for download.`
      ]
    );

    res.json({
      message: 'Certificate notification sent to learner.',
      userId: Number(userId),
      userName,
      notified: true
    });
  } catch (err) {
    console.error('Certificate generate-and-notify error:', err);
    res.status(500).json({ error: 'Failed to notify learner.' });
  }
});

// POST /api/admin/certificate/notify-all-eligible — generate and notify all newly-eligible learners
router.post('/certificate/notify-all-eligible', authenticate, requireAdmin, async (req, res) => {
  try {
    await ensureModuleAdminColumns();

    const meta = getCertMeta();
    if (!meta) return res.status(404).json({ error: 'No certificate template uploaded yet.' });

    // Count total non-supplementary modules
    const [{ totalModules }] = await query(`
      SELECT COUNT(DISTINCT LessonOrder) AS totalModules
      FROM module
      WHERE Is_Deleted = FALSE AND (Difficulty IS NULL OR LOWER(Difficulty) != 'supplementary')
    `);

    // Count core simulations
    const simCheck = await query('SHOW TABLES LIKE \'simulation_progress\'');
    const hasSimTable = simCheck.length > 0;

    let totalSims = 0;
    if (hasSimTable) {
      const [{ cnt }] = await query(
        `SELECT COUNT(*) AS cnt FROM simulation WHERE SimulationOrder > 0 AND SimulationOrder <= ?`,
        [CORE_SIM_LIMIT]
      );
      totalSims = Number(cnt);
    }

    // Find eligible learners
    const lessonEligible = await query(`
      SELECT DISTINCT u.UserID, u.Name
      FROM user u
      WHERE u.Role = 'student' AND u.is_archived = FALSE
        AND (
          SELECT COUNT(DISTINCT m.LessonOrder)
          FROM progress p
          JOIN module m ON m.ModuleID = p.ModuleID
          WHERE p.UserID = u.UserID
            AND p.CompletionRate >= 100
            AND m.Is_Deleted = FALSE
            AND (m.Difficulty IS NULL OR LOWER(m.Difficulty) != 'supplementary')
        ) >= ?
    `, [totalModules]);

    let eligibleUserIds = lessonEligible.map(row => row.UserID);

    // If there are core simulations, filter for users who completed all of them
    if (hasSimTable && totalSims > 0 && eligibleUserIds.length > 0) {
      const userPlaceholders = eligibleUserIds.map(() => '?').join(',');
      const completedAllSims = await query(`
        SELECT DISTINCT sp.UserID
        FROM simulation_progress sp
        JOIN simulation s ON s.SimulationID = sp.SimulationID
        WHERE sp.UserID IN (${userPlaceholders})
          AND s.SimulationOrder > 0 AND s.SimulationOrder <= ?
          AND sp.CompletionStatus = 'completed'
        GROUP BY sp.UserID
        HAVING COUNT(DISTINCT s.SimulationID) = ?
      `, [...eligibleUserIds, CORE_SIM_LIMIT, totalSims]);

      eligibleUserIds = completedAllSims.map(row => row.UserID);
    }

    // Filter out already-notified users
    const placeholders = eligibleUserIds.map(() => '?').join(',');
    if (placeholders) {
      const alreadyNotified = await query(`
        SELECT DISTINCT UserID FROM user_notifications
        WHERE UserID IN (${placeholders}) AND Type = 'certificate_ready'
      `, eligibleUserIds);
      const notifiedSet = new Set(alreadyNotified.map(row => row.UserID));
      eligibleUserIds = eligibleUserIds.filter(id => !notifiedSet.has(id));
    }

    // Ensure table exists
    await query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        NotificationID INT AUTO_INCREMENT PRIMARY KEY,
        UserID INT NOT NULL,
        Type VARCHAR(50) NOT NULL,
        Title VARCHAR(255) NOT NULL,
        Message TEXT NOT NULL,
        IsRead BOOLEAN DEFAULT FALSE,
        ReferenceID INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (UserID) REFERENCES user(UserID) ON DELETE CASCADE
      )
    `);

    // Create notifications for eligible users
    const notifiedUsers = [];
    for (const userId of eligibleUserIds) {
      const user = lessonEligible.find(u => u.UserID === userId);
      if (user) {
        await query(
          'INSERT INTO user_notifications (UserID, Type, Title, Message) VALUES (?, ?, ?, ?)',
          [
            userId,
            'certificate_ready',
            'Your Certificate is Ready',
            `Congratulations! Your certificate is ready for download.`
          ]
        );
        notifiedUsers.push({ userId, name: user.Name });
      }
    }

    res.json({
      message: `Notified ${notifiedUsers.length} eligible learner(s).`,
      count: notifiedUsers.length,
      notifiedUsers
    });
  } catch (err) {
    console.error('Certificate notify-all-eligible error:', err);
    res.status(500).json({ error: 'Failed to notify eligible learners.' });
  }
});

// GET /api/admin/certificate/generate/:userId — return filled certificate
// For image templates: returns { type:'image', templateUrl, userName, date, textConfig }
// For PDF: streams the pdf-lib-stamped PDF using saved textConfig positions
router.get('/certificate/generate/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Invalid user ID.' });

    const meta = getCertMeta();
    if (!meta) return res.status(404).json({ error: 'No certificate template uploaded yet. Go to Admin Settings to upload one.' });

    const users = await query('SELECT Name FROM user WHERE UserID = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'User not found.' });
    const userName = users[0].Name;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const templatePath = path.join(CERT_TEMPLATE_DIR, meta.filename);
    if (!fs.existsSync(templatePath)) return res.status(404).json({ error: 'Template file missing on server. Please re-upload.' });

    const saved = meta.textConfig || {};
    const textConfig = {
      name: { ...DEFAULT_CERT_TEXT_CONFIG.name, ...(saved.name || {}) },
      date: { ...DEFAULT_CERT_TEXT_CONFIG.date, ...(saved.date || {}) }
    };

    if (meta.mimetype.startsWith('image/')) {
      return res.json({
        type: 'image',
        templateUrl: `/uploads/cert-template/${meta.filename}`,
        userName,
        date,
        textConfig
      });
    }

    // PDF: stamp name + date using pdf-lib at saved positions
    let PDFDocument, rgb, StandardFonts;
    try {
      ({ PDFDocument, rgb, StandardFonts } = require('pdf-lib'));
    } catch {
      return res.status(500).json({ error: 'pdf-lib is not installed. Run: npm install pdf-lib in the backend directory.' });
    }

    const existingBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingBytes);

    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const pages = pdfDoc.getPages();
    const page = pages[0];
    const { width, height } = page.getSize();

    const drawField = (text, zone) => {
      // zone: { x, y, width, height } all percentages (0-100), origin top-left
      const zoneLeft   = (zone.x / 100) * width;
      const zoneW      = (zone.width  / 100) * width;
      const zoneH      = (zone.height / 100) * height;
      // PDF y-axis is bottom-up, so convert the bottom edge of the zone
      const pdfYBottom = (1 - (zone.y + zone.height) / 100) * height;

      // Auto-size font to ~55% of zone height (clamped 8–120)
      const autoSize = Math.max(8, Math.min(120, Math.floor(zoneH * 0.55)));
      const textWidth = boldFont.widthOfTextAtSize(text, autoSize);

      // Center text horizontally and vertically within the zone
      const drawX = zoneLeft + Math.max(0, (zoneW - textWidth) / 2);
      const drawY = pdfYBottom + (zoneH - autoSize) / 2;

      page.drawText(text, { x: Math.max(0, drawX), y: Math.max(0, drawY), size: autoSize, font: boldFont, color: rgb(0, 0, 0) });
    };

    drawField(userName, textConfig.name);
    drawField(date, textConfig.date);

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate_${userId}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Certificate generate error:', err);
    res.status(500).json({ error: 'Failed to generate certificate.' });
  }
});

// GET /api/admin/certificate/render/:userId — render certificate image with overlaid text
// Returns PNG for image templates, PDF for PDF templates
router.get('/certificate/render/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Invalid user ID.' });

    const meta = getCertMeta();
    if (!meta) return res.status(404).json({ error: 'No certificate template uploaded yet.' });

    const users = await query('SELECT Name FROM user WHERE UserID = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'User not found.' });
    const userName = users[0].Name;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const templatePath = path.join(CERT_TEMPLATE_DIR, meta.filename);
    if (!fs.existsSync(templatePath)) return res.status(404).json({ error: 'Template file missing on server.' });

    const saved = meta.textConfig || {};
    const textConfig = {
      name: { ...DEFAULT_CERT_TEXT_CONFIG.name, ...(saved.name || {}) },
      date: { ...DEFAULT_CERT_TEXT_CONFIG.date, ...(saved.date || {}) }
    };

    // For PDF: use existing pdf-lib approach
    if (meta.mimetype === 'application/pdf') {
      let PDFDocument, rgb, StandardFonts;
      try {
        ({ PDFDocument, rgb, StandardFonts } = require('pdf-lib'));
      } catch {
        return res.status(500).json({ error: 'pdf-lib is not installed.' });
      }

      const existingBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(existingBytes);
      const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      const pages = pdfDoc.getPages();
      const page = pages[0];
      const { width, height } = page.getSize();

      const drawField = (text, zone) => {
        const zoneLeft   = (zone.x / 100) * width;
        const zoneW      = (zone.width  / 100) * width;
        const zoneH      = (zone.height / 100) * height;
        const pdfYBottom = (1 - (zone.y + zone.height) / 100) * height;
        const autoSize = Math.max(8, Math.min(120, Math.floor(zoneH * 0.55)));
        const textWidth = boldFont.widthOfTextAtSize(text, autoSize);
        const drawX = zoneLeft + Math.max(0, (zoneW - textWidth) / 2);
        const drawY = pdfYBottom + (zoneH - autoSize) / 2;
        page.drawText(text, { x: Math.max(0, drawX), y: Math.max(0, drawY), size: autoSize, font: boldFont, color: rgb(0, 0, 0) });
      };

      drawField(userName, textConfig.name);
      drawField(date, textConfig.date);

      const pdfBytes = await pdfDoc.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="certificate_${userName.replace(/\s+/g, '_')}_${Date.now()}.pdf"`);
      res.send(Buffer.from(pdfBytes));
      return;
    }

    // For image templates: use sharp to composite text
    let sharp;
    try {
      sharp = require('sharp');
    } catch {
      return res.status(500).json({ error: 'sharp is not installed.' });
    }

    const image = await sharp(templatePath);
    const metadata = await image.metadata();

    // Calculate text positions in pixels
    const nameX = Math.round((textConfig.name.x / 100) * metadata.width);
    const nameY = Math.round((textConfig.name.y / 100) * metadata.height);
    const nameW = Math.round((textConfig.name.width / 100) * metadata.width);
    const nameH = Math.round((textConfig.name.height / 100) * metadata.height);

    const dateX = Math.round((textConfig.date.x / 100) * metadata.width);
    const dateY = Math.round((textConfig.date.y / 100) * metadata.height);
    const dateW = Math.round((textConfig.date.width / 100) * metadata.width);
    const dateH = Math.round((textConfig.date.height / 100) * metadata.height);

    // Auto-size font based on zone height
    const nameFontSize = Math.max(8, Math.min(120, Math.floor(nameH * 0.55)));
    const dateFontSize = Math.max(8, Math.min(120, Math.floor(dateH * 0.55)));

    // Create SVG overlays for text with proper encoding
    const createTextSvg = (text, w, h, fontSize) => {
      // Escape text for XML
      const escaped = String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      return `<?xml version="1.0" encoding="UTF-8"?><svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><text x="${w/2}" y="${h/2}" font-size="${fontSize}" font-family="Arial, Helvetica, DejaVu Sans, Liberation Sans, sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="black">${escaped}</text></svg>`;
    };

    const nameSvg = createTextSvg(userName, nameW, nameH, nameFontSize);
    const dateSvg = createTextSvg(date, dateW, dateH, dateFontSize);

    // Composite text onto image
    const pngBuffer = await image
      .composite([
        { input: Buffer.from(nameSvg, 'utf8'), left: nameX, top: nameY },
        { input: Buffer.from(dateSvg, 'utf8'), left: dateX, top: dateY }
      ])
      .png()
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${userName.replace(/\s+/g, '_')}_${Date.now()}.png"`);
    res.send(pngBuffer);
  } catch (err) {
    console.error('Certificate render error:', err);
    res.status(500).json({ error: 'Failed to render certificate.' });
  }
});

// GET /api/user/certificate/download — public endpoint for users to download their certificate
router.get('/certificate/download', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

    const meta = getCertMeta();
    if (!meta) return res.status(404).json({ error: 'No certificate template uploaded yet.' });

    const users = await query('SELECT Name FROM user WHERE UserID = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'User not found.' });
    const userName = users[0].Name;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const templatePath = path.join(CERT_TEMPLATE_DIR, meta.filename);
    if (!fs.existsSync(templatePath)) return res.status(404).json({ error: 'Template file missing on server.' });

    const saved = meta.textConfig || {};
    const textConfig = {
      name: { ...DEFAULT_CERT_TEXT_CONFIG.name, ...(saved.name || {}) },
      date: { ...DEFAULT_CERT_TEXT_CONFIG.date, ...(saved.date || {}) }
    };

    // For PDF: use pdf-lib approach
    if (meta.mimetype === 'application/pdf') {
      let PDFDocument, rgb, StandardFonts;
      try {
        ({ PDFDocument, rgb, StandardFonts } = require('pdf-lib'));
      } catch {
        return res.status(500).json({ error: 'pdf-lib is not installed.' });
      }

      const existingBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(existingBytes);
      const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      const pages = pdfDoc.getPages();
      const page = pages[0];
      const { width, height } = page.getSize();

      const drawField = (text, zone) => {
        const zoneLeft   = (zone.x / 100) * width;
        const zoneW      = (zone.width  / 100) * width;
        const zoneH      = (zone.height / 100) * height;
        const pdfYBottom = (1 - (zone.y + zone.height) / 100) * height;
        const autoSize = Math.max(8, Math.min(120, Math.floor(zoneH * 0.55)));
        const textWidth = boldFont.widthOfTextAtSize(text, autoSize);
        const drawX = zoneLeft + Math.max(0, (zoneW - textWidth) / 2);
        const drawY = pdfYBottom + (zoneH - autoSize) / 2;
        page.drawText(text, { x: Math.max(0, drawX), y: Math.max(0, drawY), size: autoSize, font: boldFont, color: rgb(0, 0, 0) });
      };

      drawField(userName, textConfig.name);
      drawField(date, textConfig.date);

      const pdfBytes = await pdfDoc.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="certificate_${userName.replace(/\s+/g, '_')}_${Date.now()}.pdf"`);
      res.send(Buffer.from(pdfBytes));
      return;
    }

    // For image templates: use sharp to composite text
    let sharp;
    try {
      sharp = require('sharp');
    } catch {
      return res.status(500).json({ error: 'sharp is not installed.' });
    }

    const image = await sharp(templatePath);
    const metadata = await image.metadata();

    const nameX = Math.round((textConfig.name.x / 100) * metadata.width);
    const nameY = Math.round((textConfig.name.y / 100) * metadata.height);
    const nameW = Math.round((textConfig.name.width / 100) * metadata.width);
    const nameH = Math.round((textConfig.name.height / 100) * metadata.height);

    const dateX = Math.round((textConfig.date.x / 100) * metadata.width);
    const dateY = Math.round((textConfig.date.y / 100) * metadata.height);
    const dateW = Math.round((textConfig.date.width / 100) * metadata.width);
    const dateH = Math.round((textConfig.date.height / 100) * metadata.height);

    const nameFontSize = Math.max(8, Math.min(120, Math.floor(nameH * 0.55)));
    const dateFontSize = Math.max(8, Math.min(120, Math.floor(dateH * 0.55)));

    const createTextSvg = (text, w, h, fontSize) => {
      // Escape text for XML
      const escaped = String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      return `<?xml version="1.0" encoding="UTF-8"?><svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><text x="${w/2}" y="${h/2}" font-size="${fontSize}" font-family="Arial, Helvetica, DejaVu Sans, Liberation Sans, sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="black">${escaped}</text></svg>`;
    };

    const nameSvg = createTextSvg(userName, nameW, nameH, nameFontSize);
    const dateSvg = createTextSvg(date, dateW, dateH, dateFontSize);

    const pngBuffer = await image
      .composite([
        { input: Buffer.from(nameSvg, 'utf8'), left: nameX, top: nameY },
        { input: Buffer.from(dateSvg, 'utf8'), left: dateX, top: dateY }
      ])
      .png()
      .toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${userName.replace(/\s+/g, '_')}_${Date.now()}.png"`);
    res.send(pngBuffer);
  } catch (err) {
    console.error('Certificate download error:', err);
    res.status(500).json({ error: 'Failed to download certificate.' });
  }
});

module.exports = router;
