// Module Controller
// Handles CRUD operations for learning modules

const { query } = require('../config/database');
const { getCached, setCached, clearNamespace } = require('../utils/responseCache');

let hasModuleDeletedFlagColumn = null;
let hasModuleLessonLanguageColumn = null;
let hasUserPreferredLanguageColumn = null;

const normalizeLessonLanguage = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === 'english') return 'English';
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

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

const getHasModuleDeletedFlagColumn = async () => {
  if (hasModuleDeletedFlagColumn === true) {
    return true;
  }

  const existingColumns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'module'
        AND COLUMN_NAME = 'Is_Deleted'`
  );

  hasModuleDeletedFlagColumn = existingColumns.length > 0 ? true : null;
  return existingColumns.length > 0;
};

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

const resolveLanguageFilter = async ({ userId, requestedLanguage }) => {
  const requested = normalizeLessonLanguage(requestedLanguage);
  if (requested) return requested;

  if (!userId) return null;

  const hasPreferredLanguage = await getHasUserPreferredLanguageColumn();
  if (!hasPreferredLanguage) return 'English';

  const users = await query(
    'SELECT preferred_language AS preferredLanguage FROM user WHERE UserID = ? LIMIT 1',
    [userId]
  );

  if (!users.length) return 'English';
  return normalizeLessonLanguage(users[0].preferredLanguage) || 'English';
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

const ROADMAP_STAGE_LABELS = {
  introduction: 'Introduction',
  diagnostic: 'Diagnostic',
  lesson: 'Lesson',
  final: 'Final Assessment',
};

const ROADMAP_STAGE_ORDER = ['introduction', 'diagnostic', 'lesson', 'final'];

const normalizeRoadmapStages = (value = []) => {
  const parsedStages = toArray(value);
  const stageMap = new Map();

  parsedStages.forEach((stage) => {
    const stageType = String(stage?.type || '').trim().toLowerCase();
    if (!ROADMAP_STAGE_ORDER.includes(stageType) || stageMap.has(stageType)) {
      return;
    }

    const rawId = stage?.id;
    const normalizedId =
      rawId !== undefined && rawId !== null && String(rawId).trim()
        ? String(rawId)
        : stageType;

    const normalizedLabel = String(
      stage?.label || ROADMAP_STAGE_LABELS[stageType] || stageType
    ).trim();

    stageMap.set(stageType, {
      id: normalizedId,
      type: stageType,
      label: normalizedLabel || ROADMAP_STAGE_LABELS[stageType] || stageType,
    });
  });

  return ROADMAP_STAGE_ORDER.map((stageType) =>
    stageMap.get(stageType) || {
      id: stageType,
      type: stageType,
      label: ROADMAP_STAGE_LABELS[stageType],
    }
  );
};

const toObject = (value, fallback = null) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const extractInlineReviewQuestions = (sections = []) => {
  if (!Array.isArray(sections)) return [];

  return sections.reduce((allQuestions, section) => {
    const sectionType = String(section?.type || '').toLowerCase().trim();
    if (sectionType !== 'review-multiple-choice' && sectionType !== 'review - multiple choice') {
      return allQuestions;
    }

    const sectionQuestions = Array.isArray(section?.questions) ? section.questions : [];
    return [...allQuestions, ...sectionQuestions];
  }, []);
};

const normalizeQuestionTextKey = (value = '') => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeReviewQuestion = (question = {}, index = 0) => {
  const options = Array.isArray(question?.options) ? question.options.slice(0, 4) : [];
  while (options.length < 4) options.push('');

  const parsedCorrect = Number(question?.correctAnswer);
  const safeCorrectAnswer = Number.isFinite(parsedCorrect)
    ? Math.max(0, Math.min(3, Math.floor(parsedCorrect)))
    : 0;

  return {
    ...question,
    id: question?.id ?? `normalized-review-${index}`,
    question: String(question?.question || ''),
    skill: String(question?.skill || 'No Skill'),
    options,
    questionType: 'Easy',
    type: 'Easy',
    correctAnswer: safeCorrectAnswer,
  };
};

const buildNormalizedReviewQuestions = (reviewQuestions = [], sections = []) => {
  const explicitReviewQuestions = Array.isArray(reviewQuestions) ? reviewQuestions : [];
  const inlineReviewQuestions = extractInlineReviewQuestions(sections);

  const mergedQuestions = [];
  const seenQuestions = new Set();

  const pushUnique = (question) => {
    const questionKey = normalizeQuestionTextKey(question?.question);
    if (!questionKey || seenQuestions.has(questionKey)) return;
    seenQuestions.add(questionKey);
    mergedQuestions.push(question);
  };

  explicitReviewQuestions.forEach(pushUnique);
  inlineReviewQuestions.forEach(pushUnique);

  const normalizedQuestions = mergedQuestions.map((question, index) =>
    normalizeReviewQuestion(question, index)
  );

  if (normalizedQuestions.length === 0) return [];

  const reviewTarget = normalizedQuestions.length >= 20 ? 20 : 10;
  return normalizedQuestions.slice(0, Math.min(reviewTarget, normalizedQuestions.length));
};

const getPreferredDiagnosticQuestions = (storedDiagnosticQuestions = [], normalizedReviewQuestions = [], sections = []) => {
  const stored = toArray(storedDiagnosticQuestions);
  if (stored.length > 0) return stored;
  return buildDiagnosticFromReview(normalizedReviewQuestions, sections);
};

const buildDiagnosticFromReview = (reviewQuestions = [], sections = []) => {
  const explicitReviewQuestions = Array.isArray(reviewQuestions) ? reviewQuestions : [];
  const inlineReviewQuestions = extractInlineReviewQuestions(sections);
  const sourceQuestions = explicitReviewQuestions.length > 0 ? explicitReviewQuestions : inlineReviewQuestions;

  if (!sourceQuestions.length) return [];

  const diagnosticTarget = sourceQuestions.length >= 20 ? 10 : 5;
  const selectedCount = Math.min(diagnosticTarget, sourceQuestions.length);

  return sourceQuestions.slice(0, selectedCount).map((question, index) => {
    const options = Array.isArray(question?.options) ? question.options.slice(0, 4) : [];
    while (options.length < 4) options.push('');

    const parsedCorrect = Number(question?.correctAnswer);
    const safeCorrectAnswer = Number.isFinite(parsedCorrect)
      ? Math.max(0, Math.min(3, parsedCorrect))
      : 0;

    return {
      ...question,
      id: question?.id ?? `auto-diagnostic-${index}`,
      question: String(question?.question || ''),
      skill: String(question?.skill || 'No Skill'),
      options,
      correctAnswer: safeCorrectAnswer,
    };
  });
};

const getModuleCardStats = (moduleRow = {}) => {
  const sections = toArray(moduleRow.sections);
  const reviewQuestions = buildNormalizedReviewQuestions(moduleRow.reviewQuestions, sections);
  const finalQuestions = toArray(moduleRow.finalQuestions);
  const diagnosticQuestions = getPreferredDiagnosticQuestions(moduleRow.diagnosticQuestions, reviewQuestions, sections);

  const topicCount = sections.filter((section) => {
    const type = String(section?.type || '').toLowerCase().trim();
    return (
      type === 'topic' ||
      type === 'topic title' ||
      type === 'subtopic' ||
      type === 'subtopic title'
    );
  }).length;

  const inlineReviewCount = sections.filter((section) => {
    const type = String(section?.type || '').toLowerCase().trim();
    return (
      type === 'review-multiple-choice' ||
      type === 'review - multiple choice' ||
      type === 'review-drag-drop' ||
      type === 'review - drag and drop'
    );
  }).length;

  const assessmentCount =
    diagnosticQuestions.length + reviewQuestions.length + finalQuestions.length + inlineReviewCount;

  return { topicCount, assessmentCount };
};

const getRequestCacheKey = (req) => {
  return String(req?.originalUrl || req?.url || '').trim() || String(req?.path || '');
};

// Get all modules
const getAllModules = async (req, res) => {
  try {
    const hasDeletedFlag = await getHasModuleDeletedFlagColumn();
    const hasLessonLanguage = await getHasModuleLessonLanguageColumn();

    const { userId, language, includeAssessmentContent } = req.query;
    const shouldIncludeAssessmentContent = ['1', 'true', 'yes'].includes(
      String(includeAssessmentContent || '').trim().toLowerCase()
    );
    const languageFilter = await resolveLanguageFilter({ userId, requestedLanguage: language });
    const requestCacheKey = getRequestCacheKey(req);
    const cachedModules = getCached('modules:list', requestCacheKey);
    if (cachedModules) {
      return res.json(cachedModules);
    }
    
    let sql = `
      SELECT 
        m.ModuleID,
        m.ModuleTitle,
        m.Description,
        m.LessonOrder,
        m.Tesda_Reference,
        m.Is_Unlocked,
        m.Difficulty
    `;

    if (hasLessonLanguage) {
      sql += ',\n        m.LessonLanguage';
    }
    
    // If userId provided, include progress
    if (userId) {
      sql += `,
        p.ProgressID,
        p.CompletionRate,
        p.DateStarted,
        p.DateCompletion,
        p.LastOpenedAt,
        m.sections,
        m.diagnosticQuestions,
        m.reviewQuestions,
        m.finalQuestions
      FROM module m
      LEFT JOIN (
        SELECT
          m2.LessonOrder,
          MAX(p1.ProgressID) AS ProgressID,
          MAX(COALESCE(p1.CompletionRate, 0)) AS CompletionRate,
          MIN(p1.DateStarted) AS DateStarted,
          MAX(p1.DateCompletion) AS DateCompletion,
          MAX(
            CASE
              WHEN p1.DateCompletion IS NULL THEN p1.DateStarted
              WHEN p1.DateStarted IS NULL THEN p1.DateCompletion
              WHEN p1.DateStarted > p1.DateCompletion THEN p1.DateStarted
              ELSE p1.DateCompletion
            END
          ) AS LastOpenedAt
        FROM progress p1
        JOIN module m2 ON m2.ModuleID = p1.ModuleID
        WHERE p1.UserID = ?
        GROUP BY m2.LessonOrder
      ) p ON p.LessonOrder = m.LessonOrder
      `;

      const filters = [];
      const params = [userId];

      if (hasDeletedFlag) {
        filters.push('m.Is_Deleted = FALSE');
      }

      if (hasLessonLanguage && languageFilter) {
        filters.push("COALESCE(NULLIF(TRIM(m.LessonLanguage), ''), 'English') = ?");
        params.push(languageFilter);
      }

      if (filters.length > 0) {
        sql += ` WHERE ${filters.join(' AND ')}`;
      }
      
      const modules = await query(sql, params);
      modules.sort((a, b) => Number(a.LessonOrder || 0) - Number(b.LessonOrder || 0));

      const enrichedModules = modules.map((moduleRow) => {
        const { topicCount, assessmentCount } = getModuleCardStats(moduleRow);
        const {
          sections,
          diagnosticQuestions,
          reviewQuestions,
          finalQuestions,
          ...moduleData
        } = moduleRow;

        const assessmentContent = shouldIncludeAssessmentContent
          ? {
              sections: toArray(sections),
              diagnosticQuestions: toArray(diagnosticQuestions),
              reviewQuestions: toArray(reviewQuestions),
              finalQuestions: toArray(finalQuestions),
            }
          : {};

        return {
          ...moduleData,
          ...assessmentContent,
          topicCount,
          assessmentCount,
        };
      });

      setCached('modules:list', requestCacheKey, enrichedModules);

      return res.json(enrichedModules);
    }

    const filters = [];
    const params = [];

    if (hasDeletedFlag) {
      filters.push('m.Is_Deleted = FALSE');
    }

    if (hasLessonLanguage && languageFilter) {
      filters.push("COALESCE(NULLIF(TRIM(m.LessonLanguage), ''), 'English') = ?");
      params.push(languageFilter);
    }

    if (shouldIncludeAssessmentContent) {
      sql += ',\n        m.sections,\n        m.diagnosticQuestions,\n        m.reviewQuestions,\n        m.finalQuestions';
    }
    
    sql += ' FROM module m';
    if (filters.length > 0) {
      sql += ` WHERE ${filters.join(' AND ')}`;
    }
    sql += ' ORDER BY m.LessonOrder';

    const modules = await query(sql, params);

    if (shouldIncludeAssessmentContent) {
      const payload = modules.map((moduleRow) => ({
        ...moduleRow,
        sections: toArray(moduleRow.sections),
        diagnosticQuestions: toArray(moduleRow.diagnosticQuestions),
        reviewQuestions: toArray(moduleRow.reviewQuestions),
        finalQuestions: toArray(moduleRow.finalQuestions),
      }));

      setCached('modules:list', requestCacheKey, payload);
      return res.json(payload);
    }

    setCached('modules:list', requestCacheKey, modules);

    res.json(modules);
    
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch modules'
    });
  }
};

// Get module by ID
const getModuleById = async (req, res) => {
  try {
    const hasDeletedFlag = await getHasModuleDeletedFlagColumn();
    const hasLessonLanguage = await getHasModuleLessonLanguageColumn();

    const { id } = req.params;
    const { userId, language } = req.query;
    const languageFilter = await resolveLanguageFilter({ userId, requestedLanguage: language });
    const requestCacheKey = getRequestCacheKey(req);
    const cachedModule = getCached('modules:item', requestCacheKey);
    if (cachedModule) {
      return res.json(cachedModule);
    }
    
    let sql = `
      SELECT 
        m.ModuleID,
        m.ModuleTitle,
        m.Description,
        m.LessonOrder,
        m.Tesda_Reference,
        m.LessonTime,
        m.Difficulty,
        m.Is_Unlocked,
        m.sections,
        m.diagnosticQuestions,
        m.reviewQuestions,
        m.finalQuestions,
        m.finalInstruction,
        m.roadmapStages
    `;

    if (hasLessonLanguage) {
      sql += ',\n        m.LessonLanguage';
    }
    
    if (userId) {
      sql += `,
        p.CompletionRate,
        p.DateStarted,
        p.DateCompletion
      FROM module m
      LEFT JOIN (
        SELECT
          m2.LessonOrder,
          MAX(COALESCE(p1.CompletionRate, 0)) AS CompletionRate,
          MIN(p1.DateStarted) AS DateStarted,
          MAX(p1.DateCompletion) AS DateCompletion
        FROM progress p1
        JOIN module m2 ON m2.ModuleID = p1.ModuleID
        WHERE p1.UserID = ?
        GROUP BY m2.LessonOrder
      ) p ON p.LessonOrder = m.LessonOrder
      WHERE m.ModuleID = ?`;

      const params = [userId, id];

      if (hasDeletedFlag) {
        sql += ' AND m.Is_Deleted = FALSE';
      }

      if (hasLessonLanguage && languageFilter) {
        sql += " AND COALESCE(NULLIF(TRIM(m.LessonLanguage), ''), 'English') = ?";
        params.push(languageFilter);
      }
      
      const modules = await query(sql, params);
      
      if (modules.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Module not found'
        });
      }
      
      // MySQL JSON columns return objects directly, no need to parse
      const module = modules[0];
      
      module.sections = toArray(module.sections);
      module.reviewQuestions = buildNormalizedReviewQuestions(module.reviewQuestions, module.sections);
      module.finalQuestions = toArray(module.finalQuestions);
      module.roadmapStages = normalizeRoadmapStages(module.roadmapStages);
      module.diagnosticQuestions = getPreferredDiagnosticQuestions(
        module.diagnosticQuestions,
        module.reviewQuestions,
        module.sections
      );
      module.LessonTime = toObject(module.LessonTime, null);

      setCached('modules:item', requestCacheKey, module);
      
      return res.json(module);
    }
    
    sql += '\n      FROM module m WHERE m.ModuleID = ?';

    const params = [id];

    if (hasDeletedFlag) {
      sql += ' AND m.Is_Deleted = FALSE';
    }

    if (hasLessonLanguage && languageFilter) {
      sql += " AND COALESCE(NULLIF(TRIM(m.LessonLanguage), ''), 'English') = ?";
      params.push(languageFilter);
    }

    const modules = await query(sql, params);
    
    if (modules.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }
    
    // MySQL JSON columns return objects directly, no need to parse
    const module = modules[0];
    
    module.sections = toArray(module.sections);
    module.reviewQuestions = buildNormalizedReviewQuestions(module.reviewQuestions, module.sections);
    module.finalQuestions = toArray(module.finalQuestions);
    module.roadmapStages = normalizeRoadmapStages(module.roadmapStages);
    module.diagnosticQuestions = getPreferredDiagnosticQuestions(
      module.diagnosticQuestions,
      module.reviewQuestions,
      module.sections
    );
    module.LessonTime = toObject(module.LessonTime, null);

    setCached('modules:item', requestCacheKey, module);
    
    res.json(module);
    
  } catch (error) {
    console.error('Get module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch module'
    });
  }
};

// Create new module
const createModule = async (req, res) => {
  try {
    const { moduleTitle, description, lessonOrder, tesdaReference, isUnlocked } = req.body;
    
    // Ensure lesson 1 is always unlocked by default
    const shouldUnlock = lessonOrder === 1 ? true : (isUnlocked || false);
    
    const result = await query(
      'INSERT INTO module (ModuleTitle, Description, LessonOrder, Tesda_Reference, Is_Unlocked) VALUES (?, ?, ?, ?, ?)',
      [moduleTitle, description || null, lessonOrder, tesdaReference || null, shouldUnlock]
    );
    
    const newModule = await query(
      'SELECT * FROM module WHERE ModuleID = ?',
      [result.insertId]
    );

    clearNamespace('modules:list');
    clearNamespace('modules:item');
    
    res.status(201).json({
      message: 'Module created successfully',
      module: newModule[0]
    });
    
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create module'
    });
  }
};

// Update module
const updateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleTitle, description, lessonOrder, tesdaReference, isUnlocked } = req.body;
    
    // Check if module exists
    const existingModule = await query(
      'SELECT ModuleID, LessonOrder FROM module WHERE ModuleID = ?',
      [id]
    );
    
    if (existingModule.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    // Ensure lesson 1 is always unlocked
    const shouldUnlock = lessonOrder === 1 ? true : isUnlocked;
    
    await query(
      'UPDATE module SET ModuleTitle = ?, Description = ?, LessonOrder = ?, Tesda_Reference = ?, Is_Unlocked = ? WHERE ModuleID = ?',
      [moduleTitle, description, lessonOrder, tesdaReference, shouldUnlock, id]
    );
    
    const updatedModule = await query(
      'SELECT * FROM module WHERE ModuleID = ?',
      [id]
    );

    clearNamespace('modules:list');
    clearNamespace('modules:item');
    
    res.json({
      message: 'Module updated successfully',
      module: updatedModule[0]
    });
    
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update module'
    });
  }
};

// Delete module
const deleteModule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if module exists
    const existingModule = await query(
      'SELECT ModuleID, LessonOrder FROM module WHERE ModuleID = ?',
      [id]
    );
    
    if (existingModule.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Module not found'
      });
    }

    if (isProtectedLessonOrder(existingModule[0].LessonOrder)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Lessons 1-7 are protected and cannot be deleted.'
      });
    }
    
    await query('DELETE FROM module WHERE ModuleID = ?', [id]);

    clearNamespace('modules:list');
    clearNamespace('modules:item');
    
    res.json({
      message: 'Module deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete module'
    });
  }
};

// Get module questions
const getModuleQuestions = async (req, res) => {
  try {
    const { id } = req.params;
    
    const questions = await query(
      'SELECT * FROM question WHERE ModuleID = ? ORDER BY QuestionID',
      [id]
    );
    
    res.json(questions);
    
  } catch (error) {
    console.error('Get module questions error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch module questions'
    });
  }
};

module.exports = {
  getAllModules,
  getModuleById,
  createModule,
  updateModule,
  deleteModule,
  getModuleQuestions
};
