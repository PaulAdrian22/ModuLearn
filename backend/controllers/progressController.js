// Progress Controller
// Handles user progress tracking

const { query, getConnection } = require('../config/database');

let progressColumnsReady = false;
let hasModuleLessonLanguageColumn = null;
let hasUserPreferredLanguageColumn = null;

const normalizeLessonLanguage = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'english') return 'English';
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

  return 'English';
};

const getLanguagePredicate = (moduleAlias = 'm') =>
  `COALESCE(NULLIF(TRIM(${moduleAlias}.LessonLanguage), ''), 'English') = ?`;

const getHasModuleLessonLanguageColumn = async () => {
  if (hasModuleLessonLanguageColumn === true) {
    return true;
  }

  const existingColumns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'module'
        AND COLUMN_NAME = 'LessonLanguage'`
  );

  hasModuleLessonLanguageColumn = existingColumns.length > 0 ? true : null;
  return existingColumns.length > 0;
};

const getHasUserPreferredLanguageColumn = async () => {
  if (hasUserPreferredLanguageColumn === true) {
    return true;
  }

  const existingColumns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user'
        AND COLUMN_NAME = 'preferred_language'`
  );

  hasUserPreferredLanguageColumn = existingColumns.length > 0 ? true : null;
  return existingColumns.length > 0;
};

const getUserPreferredLanguage = async (userId) => {
  const hasPreferredLanguageColumn = await getHasUserPreferredLanguageColumn();
  if (!hasPreferredLanguageColumn) {
    return 'English';
  }

  const users = await query(
    'SELECT preferred_language AS preferredLanguage FROM user WHERE UserID = ? LIMIT 1',
    [userId]
  );

  return normalizeLessonLanguage(users[0]?.preferredLanguage || 'English');
};

const getLanguageFilterContext = async (userId) => {
  const hasLessonLanguage = await getHasModuleLessonLanguageColumn();
  if (!hasLessonLanguage) {
    return {
      hasLessonLanguage: false,
      preferredLanguage: null,
    };
  }

  const preferredLanguage = await getUserPreferredLanguage(userId);
  return {
    hasLessonLanguage: true,
    preferredLanguage,
  };
};

const ensureProgressColumns = async () => {
  if (progressColumnsReady) {
    return;
  }

  const existingColumns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'progress'
        AND COLUMN_NAME IN ('ActiveSeconds')`
  );

  const columnSet = new Set(existingColumns.map((column) => String(column.COLUMN_NAME || '')));

  if (!columnSet.has('ActiveSeconds')) {
    await query(
      `ALTER TABLE progress
       ADD COLUMN ActiveSeconds INT NOT NULL DEFAULT 0 AFTER CompletionRate`
    );
    console.log('Added ActiveSeconds column to progress table.');
  }

  progressColumnsReady = true;
};

const getAccessibleModuleContext = async ({ userId, moduleId }) => {
  const { hasLessonLanguage, preferredLanguage } = await getLanguageFilterContext(userId);

  let moduleSql =
    'SELECT ModuleID, ModuleTitle, LessonOrder, Is_Unlocked FROM module WHERE ModuleID = ?';
  const moduleParams = [moduleId];

  if (hasLessonLanguage && preferredLanguage) {
    moduleSql += ` AND ${getLanguagePredicate('module')}`;
    moduleParams.push(preferredLanguage);
  }

  const modules = await query(moduleSql, moduleParams);

  if (modules.length > 0) {
    return {
      hasLessonLanguage,
      preferredLanguage,
      module: modules[0],
      isForbiddenByLanguage: false,
    };
  }

  if (hasLessonLanguage && preferredLanguage) {
    const existingModule = await query(
      'SELECT ModuleID FROM module WHERE ModuleID = ? LIMIT 1',
      [moduleId]
    );

    if (existingModule.length > 0) {
      return {
        hasLessonLanguage,
        preferredLanguage,
        module: null,
        isForbiddenByLanguage: true,
      };
    }
  }

  return {
    hasLessonLanguage,
    preferredLanguage,
    module: null,
    isForbiddenByLanguage: false,
  };
};

const getCanonicalProgressRow = async ({ userId, preferredModuleId }) => {
  const rows = await query(
    `SELECT
        p.ProgressID,
        p.ModuleID,
        p.CompletionRate,
        p.DateStarted,
        p.DateCompletion,
        COALESCE(p.ActiveSeconds, 0) AS ActiveSeconds
       FROM progress p
      WHERE p.UserID = ?
        AND p.ModuleID = ?
      LIMIT 1`,
    [userId, preferredModuleId]
  );

  return rows[0] || null;
};

// Get user progress for all modules
const getUserProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { hasLessonLanguage, preferredLanguage } = await getLanguageFilterContext(userId);

    let sql;
    let params;

    if (hasLessonLanguage && preferredLanguage) {
      sql =
        `SELECT
          p.ProgressID,
          m.ModuleID,
          m.ModuleTitle,
          m.LessonOrder,
          m.Description,
          COALESCE(p.CompletionRate, 0) AS CompletionRate,
          p.DateStarted,
          p.DateCompletion,
          COALESCE(p.ActiveSeconds, 0) AS ActiveSeconds
         FROM module m
         LEFT JOIN (
           SELECT
             m2.LessonOrder,
             MAX(p1.ProgressID) AS ProgressID,
             MAX(COALESCE(p1.CompletionRate, 0)) AS CompletionRate,
             MIN(p1.DateStarted) AS DateStarted,
             MAX(p1.DateCompletion) AS DateCompletion,
             COALESCE(SUM(GREATEST(COALESCE(p1.ActiveSeconds, 0), 0)), 0) AS ActiveSeconds
            FROM progress p1
            JOIN module m2 ON m2.ModuleID = p1.ModuleID
           WHERE p1.UserID = ?
             AND ${getLanguagePredicate('m2')}
           GROUP BY m2.LessonOrder
         ) p ON p.LessonOrder = m.LessonOrder
         WHERE ${getLanguagePredicate('m')}
         ORDER BY m.LessonOrder`;
      params = [userId, preferredLanguage, preferredLanguage];
    } else {
      sql =
        `SELECT p.*, m.ModuleTitle, m.LessonOrder, m.Description
         FROM progress p
         JOIN module m ON p.ModuleID = m.ModuleID
         WHERE p.UserID = ?
         ORDER BY m.LessonOrder`;
      params = [userId];
    }
    
    const progress = await query(sql, params);
    
    res.json(progress);
    
  } catch (error) {
    console.error('Get user progress error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch progress'
    });
  }
};

// Get progress for specific module
const getModuleProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { moduleId } = req.params;
    const moduleContext = await getAccessibleModuleContext({ userId, moduleId });

    if (moduleContext.isForbiddenByLanguage) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Module is not available for your selected language'
      });
    }

    if (!moduleContext.module) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    const progress = await getCanonicalProgressRow({
      userId,
      lessonOrder: moduleContext.module.LessonOrder,
      preferredModuleId: Number(moduleId),
    });

    if (!progress) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Progress record not found'
      });
    }

    res.json({
      ...progress,
      ModuleTitle: moduleContext.module.ModuleTitle,
      LessonOrder: moduleContext.module.LessonOrder,
    });
    
  } catch (error) {
    console.error('Get module progress error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch module progress'
    });
  }
};

// Start module (create progress record)
const startModule = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { moduleId } = req.body;
    const moduleContext = await getAccessibleModuleContext({ userId, moduleId });

    if (moduleContext.isForbiddenByLanguage) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Module is not available for your selected language'
      });
    }

    if (!moduleContext.module) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    // Per-user unlock check: lesson 1 is always available; otherwise this
    // learner must have completed the previous lesson. The shared
    // module.Is_Unlocked column is intentionally ignored — it used to leak
    // unlock state across users when one learner finished a lesson.
    const lessonOrder = Number(moduleContext.module.LessonOrder || 0);
    if (lessonOrder > 1) {
      const { hasLessonLanguage, preferredLanguage } = moduleContext;
      const langClause = hasLessonLanguage && preferredLanguage
        ? ` AND ${getLanguagePredicate('m2')}`
        : '';
      const lockParams = hasLessonLanguage && preferredLanguage
        ? [userId, lessonOrder - 1, preferredLanguage]
        : [userId, lessonOrder - 1];
      const prevRows = await query(
        `SELECT MAX(COALESCE(p.CompletionRate, 0)) AS CompletionRate
           FROM progress p
           JOIN module m2 ON m2.ModuleID = p.ModuleID
          WHERE p.UserID = ? AND m2.LessonOrder = ?${langClause}`,
        lockParams
      );
      const prevCompletion = Number(prevRows?.[0]?.CompletionRate || 0);
      if (prevCompletion < 100) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Module is locked. Complete the previous lesson to unlock this one.'
        });
      }
    }

    const existingProgress = await getCanonicalProgressRow({
      userId,
      lessonOrder: moduleContext.module.LessonOrder,
      preferredModuleId: Number(moduleId),
    });

    if (existingProgress) {
      await query(
        'UPDATE progress SET DateStarted = CURRENT_TIMESTAMP WHERE ProgressID = ?',
        [existingProgress.ProgressID]
      );

      const reopenedProgress = await query(
        'SELECT * FROM progress WHERE ProgressID = ?',
        [existingProgress.ProgressID]
      );

      return res.json({
        message: 'Module opened',
        progress: reopenedProgress[0]
      });
    }
    
    // Create progress record
    const result = await query(
      'INSERT INTO progress (UserID, ModuleID, CompletionRate, DateStarted) VALUES (?, ?, 0, CURRENT_TIMESTAMP)',
      [userId, moduleContext.module.ModuleID]
    );
    
    const newProgress = await query(
      'SELECT * FROM progress WHERE ProgressID = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'Module started',
      progress: newProgress[0]
    });
    
  } catch (error) {
    console.error('Start module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start module'
    });
  }
};

// Update module progress
const updateProgress = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const userId = req.user.userId;
    const { moduleId, completionRate } = req.body;
    const moduleContext = await getAccessibleModuleContext({ userId, moduleId });

    if (moduleContext.isForbiddenByLanguage) {
      connection.release();
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Module is not available for your selected language'
      });
    }

    if (!moduleContext.module) {
      connection.release();
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    await connection.beginTransaction();

    const [progressRows] = await connection.execute(
      `SELECT
          p.ProgressID,
          p.ModuleID,
          p.CompletionRate
         FROM progress p
        WHERE p.UserID = ?
          AND p.ModuleID = ?
        LIMIT 1`,
      [userId, moduleContext.module.ModuleID]
    );

    if (progressRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        error: 'Not Found',
        message: 'Progress record not found. Start the module first.'
      });
    }

    const canonicalProgress = progressRows[0];
    
    // Update progress
    const isCompleted = completionRate >= 100;
    
    await connection.execute(
      `UPDATE progress
          SET CompletionRate = ?,
              DateCompletion = ${isCompleted ? 'CURRENT_TIMESTAMP' : 'NULL'}
        WHERE ProgressID = ?`,
      [completionRate, canonicalProgress.ProgressID]
    );

    // Unlocking the next lesson is now derived per-user at fetch time
    // (moduleController.getAllModules), based on this learner's progress.
    // We intentionally do NOT touch module.Is_Unlocked here — that column is
    // shared across users and writing to it would unlock the next lesson for
    // every learner, not just this one.

    await connection.commit();
    connection.release();
    
    const updatedProgress = await query(
      'SELECT * FROM progress WHERE ProgressID = ?',
      [canonicalProgress.ProgressID]
    );
    
    res.json({
      message: 'Progress updated successfully',
      progress: updatedProgress[0],
      moduleCompleted: isCompleted
    });
    
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Update progress error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update progress'
    });
  }
};

// Track active lesson time in seconds while learner is inside the lesson page.
const trackLessonTime = async (req, res) => {
  try {
    await ensureProgressColumns();

    const userId = req.user.userId;
    const { moduleId, timeSpentSeconds } = req.body;
    const safeTimeSpentSeconds = Math.max(0, Math.min(3600, Math.floor(Number(timeSpentSeconds || 0))));

    if (safeTimeSpentSeconds <= 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'timeSpentSeconds must be a positive integer'
      });
    }

    const moduleContext = await getAccessibleModuleContext({ userId, moduleId });

    if (moduleContext.isForbiddenByLanguage) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Module is not available for your selected language'
      });
    }

    if (!moduleContext.module) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    const progressRow = await getCanonicalProgressRow({
      userId,
      lessonOrder: moduleContext.module.LessonOrder,
      preferredModuleId: Number(moduleId),
    });

    if (!progressRow) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Progress record not found. Start the module first.'
      });
    }

    await query(
      `UPDATE progress
          SET ActiveSeconds = COALESCE(ActiveSeconds, 0) + ?
        WHERE ProgressID = ?`,
      [safeTimeSpentSeconds, progressRow.ProgressID]
    );

    const updatedRows = await query(
      'SELECT ProgressID, ActiveSeconds FROM progress WHERE ProgressID = ?',
      [progressRow.ProgressID]
    );

    const activeSeconds = Number(updatedRows[0]?.ActiveSeconds || 0);

    res.json({
      message: 'Lesson time tracked successfully',
      moduleId: Number(moduleId),
      activeSeconds,
      activeMinutes: Math.floor(activeSeconds / 60)
    });
  } catch (error) {
    console.error('Track lesson time error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to track lesson time'
    });
  }
};

module.exports = {
  getUserProgress,
  getModuleProgress,
  startModule,
  updateProgress,
  trackLessonTime
};
