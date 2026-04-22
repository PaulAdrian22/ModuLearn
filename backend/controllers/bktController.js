/**
 * ==============================================
 * BKT CONTROLLER
 * Bayesian Knowledge Tracing - Full Implementation
 * ==============================================
 * 
 * Handles all BKT operations:
 * - Skill initialization
 * - Initial assessment processing
 * - Lesson assessment processing (Diagnostic, Review, Simulation, Final)
 * - Lesson mastery computation
 * - Overall mastery computation
 * - Time-based rules
 * - Retake logic
 * - Question selection
 * - Recommendations
 */

const { query, getConnection } = require('../config/database');
const bkt = require('../utils/bktEngine');

let assessmentTimeColumnReady = false;
const SUPPLEMENTARY_DIFFICULTY = 'supplementary';
const ASSESSMENT_PASSING_SCORE = 75;

const ensureAssessmentTimeSpentColumn = async () => {
  if (assessmentTimeColumnReady) {
    return true;
  }

  const existingColumns = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'assessment'
        AND COLUMN_NAME = 'TimeSpentSeconds'`
  );

  if (existingColumns.length === 0) {
    await query(
      `ALTER TABLE assessment
       ADD COLUMN TimeSpentSeconds INT NOT NULL DEFAULT 0 AFTER TotalScore`
    );
    console.log('Added TimeSpentSeconds column to assessment table.');
  }

  assessmentTimeColumnReady = true;
  return true;
};

const normalizeDifficultyValue = (value = '') => String(value || '').trim().toLowerCase();

const normalizeQuestionLookupText = (value = '') =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const normalizeSkillTagValue = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  const canonicalSkill = bkt.SKILL_NAMES.find((skillName) => skillName.toLowerCase() === normalized);
  return canonicalSkill || String(value || '').trim();
};

const normalizeQuestionTypeValue = (value = '') => String(value || '').trim().toLowerCase();

const buildModuleFinalQuestionPool = async (connection, totalLessons) => {
  const [modules] = await connection.execute(
    `SELECT ModuleID, LessonOrder, finalQuestions
     FROM module
     WHERE LessonOrder BETWEEN 1 AND ?`,
    [totalLessons]
  );

  const optionsLookup = new Map();
  const questionPool = [];

  for (const moduleRow of modules) {
    const moduleId = Number.parseInt(moduleRow?.ModuleID, 10);
    const lessonOrder = Number.parseInt(moduleRow?.LessonOrder, 10);
    if (!Number.isFinite(moduleId)) {
      continue;
    }
    if (!Number.isFinite(lessonOrder)) {
      continue;
    }

    let finalQuestions = [];

    if (Array.isArray(moduleRow?.finalQuestions)) {
      finalQuestions = moduleRow.finalQuestions;
    } else if (typeof moduleRow?.finalQuestions === 'string' && moduleRow.finalQuestions.trim()) {
      try {
        const parsed = JSON.parse(moduleRow.finalQuestions);
        if (Array.isArray(parsed)) {
          finalQuestions = parsed;
        }
      } catch (parseError) {
        // Ignore malformed JSON rows and continue with available modules.
      }
    }

    for (let index = 0; index < finalQuestions.length; index += 1) {
      const question = finalQuestions[index];
      const questionText = String(question?.question || question?.QuestionText || '').trim();
      const normalizedQuestionText = normalizeQuestionLookupText(questionText);
      if (!normalizedQuestionText) {
        continue;
      }

      const normalizedSkillTag = normalizeSkillTagValue(
        question?.skill || question?.skillTag || question?.SkillTag || ''
      );
      if (!normalizedSkillTag) {
        continue;
      }

      const normalizedQuestionType = normalizeQuestionTypeValue(
        question?.questionType || question?.QuestionType || ''
      );
      if (!normalizedQuestionType) {
        continue;
      }

      const options = (Array.isArray(question?.options) ? question.options : [])
        .map((option) => String(option || '').trim())
        .filter(Boolean)
        .slice(0, 4);

      if (options.length < 2) {
        continue;
      }

      const rawQuestionId =
        question?.id ||
        question?.QuestionID ||
        `${moduleId}-${lessonOrder}-${index + 1}`;

      const questionId = String(rawQuestionId).trim() || `${moduleId}-${lessonOrder}-${index + 1}`;

      questionPool.push({
        QuestionID: questionId,
        ModuleID: moduleId,
        QuestionText: questionText,
        OptionA: options[0] || '',
        OptionB: options[1] || '',
        OptionC: options[2] || '',
        OptionD: options[3] || '',
        CorrectAnswer: question?.correctAnswer,
        SkillTag: normalizedSkillTag,
        QuestionType: 'Situational',
        LessonOrder: lessonOrder
      });

      const key = `${moduleId}::${normalizedQuestionText}::${normalizedSkillTag}::${normalizedQuestionType}`;

      if (!optionsLookup.has(key)) {
        optionsLookup.set(key, options);
      }
    }
  }

  return {
    optionsLookup,
    questionPool
  };
};

const getModuleBktContext = async (connection, moduleId) => {
  const normalizedModuleId = Number.parseInt(moduleId, 10);

  if (!Number.isFinite(normalizedModuleId) || normalizedModuleId <= 0) {
    return {
      moduleId: null,
      moduleExists: false,
      difficulty: null,
      isSupplementary: false
    };
  }

  const [modules] = await connection.execute(
    'SELECT ModuleID, Difficulty FROM module WHERE ModuleID = ? LIMIT 1',
    [normalizedModuleId]
  );

  if (modules.length === 0) {
    return {
      moduleId: normalizedModuleId,
      moduleExists: false,
      difficulty: null,
      isSupplementary: false
    };
  }

  const difficulty = modules[0].Difficulty;

  return {
    moduleId: normalizedModuleId,
    moduleExists: true,
    difficulty,
    isSupplementary: normalizeDifficultyValue(difficulty) === SUPPLEMENTARY_DIFFICULTY
  };
};

// ==============================================
// 1. INITIALIZATION
// ==============================================

/**
 * Initialize all 5 skills for a user with Base L = 0.01
 * Called when student first enters the system (before Initial Assessment).
 * 
 * POST /api/bkt/initialize-all
 */
const initializeAllSkills = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;

    const results = [];

    for (const skillName of bkt.SKILL_NAMES) {
      const params = bkt.getSkillParams(skillName);

      // Check if already initialized
      const [existing] = await connection.execute(
        'SELECT BkID FROM bkt_model WHERE UserID = ? AND SkillName = ?',
        [userId, skillName]
      );

      if (existing.length === 0) {
        // Insert new BKT model entry
        await connection.execute(
          `INSERT INTO bkt_model (UserID, SkillName, PKnown, PLearn, PSlip, PGuess, BaseL, CurrentL, PostTestL)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.000000)`,
          [userId, skillName, params.pInit, params.pLearn, params.pSlip, params.pGuess, params.pInit, params.pInit]
        );

        // Initialize overall mastery record
        await connection.execute(
          `INSERT INTO bkt_overall_mastery (UserID, SkillName, InitialL, WMInitial, RemainingL, TMLesson, OverallMastery, IsMastered)
           VALUES (?, ?, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000, FALSE)
           ON DUPLICATE KEY UPDATE UserID = UserID`,
          [userId, skillName]
        );

        results.push({ skillName, status: 'initialized', baseL: params.pInit });
      } else {
        results.push({ skillName, status: 'already_initialized' });
      }
    }

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: 'All skills initialized',
      skills: results,
      totalSkills: bkt.SKILL_NAMES.length,
      baseL: bkt.CONSTANTS.INITIAL_L
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Initialize all skills error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to initialize skills' });
  }
};

/**
 * Initialize a single skill for a user.
 * 
 * POST /api/bkt/initialize
 * Body: { skillName }
 */
const initializeSkillKnowledge = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { skillName } = req.body;

    if (!bkt.SKILL_NAMES.includes(skillName)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Invalid skill name. Must be one of: ${bkt.SKILL_NAMES.join(', ')}`
      });
    }

    const existing = await query(
      'SELECT BkID FROM bkt_model WHERE UserID = ? AND SkillName = ?',
      [userId, skillName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'Skill already initialized' });
    }

    const params = bkt.getSkillParams(skillName);

    await query(
      `INSERT INTO bkt_model (UserID, SkillName, PKnown, PLearn, PSlip, PGuess, BaseL, CurrentL, PostTestL)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.000000)`,
      [userId, skillName, params.pInit, params.pLearn, params.pSlip, params.pGuess, params.pInit, params.pInit]
    );

    res.status(201).json({
      message: 'Skill initialized',
      skillName,
      baseL: params.pInit,
      params: { pGuess: params.pGuess, pLearn: params.pLearn, pSlip: params.pSlip }
    });
  } catch (error) {
    console.error('Initialize skill error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to initialize skill' });
  }
};

// ==============================================
// 2. GET KNOWLEDGE STATES
// ==============================================

/**
 * Get all knowledge states for current user.
 * 
 * GET /api/bkt/knowledge-states
 */
const getUserKnowledgeStates = async (req, res) => {
  try {
    const userId = req.user.userId;

    const knowledgeStates = await query(
      `SELECT bm.*, 
              om.InitialL, om.WMInitial, om.RemainingL, om.TMLesson, 
              om.OverallMastery, om.IsMastered, om.OverallMasteryPercent,
              om.TotalQuestionsMastered, om.TotalQuestions
       FROM bkt_model bm
       LEFT JOIN bkt_overall_mastery om ON bm.UserID = om.UserID AND bm.SkillName = om.SkillName
       WHERE bm.UserID = ?
       ORDER BY bm.SkillName`,
      [userId]
    );

    // Add proficiency level
    const enriched = knowledgeStates.map(state => ({
      ...state,
      proficiencyLevel: bkt.getProficiencyLevel(parseFloat(state.OverallMastery) || 0)
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Get knowledge states error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch knowledge states' });
  }
};

/**
 * Get knowledge state for a specific skill.
 * 
 * GET /api/bkt/knowledge-states/:skillName
 */
const getSkillKnowledgeState = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { skillName } = req.params;

    const states = await query(
      `SELECT bm.*, 
              om.InitialL, om.WMInitial, om.RemainingL, om.TMLesson, 
              om.OverallMastery, om.IsMastered, om.OverallMasteryPercent
       FROM bkt_model bm
       LEFT JOIN bkt_overall_mastery om ON bm.UserID = om.UserID AND bm.SkillName = om.SkillName
       WHERE bm.UserID = ? AND bm.SkillName = ?`,
      [userId, skillName]
    );

    if (states.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Knowledge state not found for this skill' });
    }

    const state = states[0];
    state.proficiencyLevel = bkt.getProficiencyLevel(parseFloat(state.OverallMastery) || 0);

    res.json(state);
  } catch (error) {
    console.error('Get skill knowledge state error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch skill knowledge state' });
  }
};

// ==============================================
// 3. INITIAL ASSESSMENT
// ==============================================

/**
 * Start an Initial Assessment session.
 * Selects 35 questions (5 per lesson across lessons 1-7, all situational).
 * 
 * POST /api/bkt/initial-assessment/start
 */
const startInitialAssessment = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;

    // Check if initial assessment already completed
    const [existingOverall] = await connection.execute(
      'SELECT OverallMasteryID FROM bkt_overall_mastery WHERE UserID = ? AND InitialL > 0 LIMIT 1',
      [userId]
    );

    if (existingOverall.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        error: 'Already Completed',
        message: 'Initial assessment has already been completed'
      });
    }

    // Create assessment record
    const [assessmentResult] = await connection.execute(
      `INSERT INTO assessment (UserID, AssessmentType, ResultStatus) VALUES (?, 'Initial', 'In Progress')`,
      [userId]
    );
    const assessmentId = assessmentResult.insertId;

    const {
      optionsLookup,
      questionPool: moduleFinalQuestionPool
    } = await buildModuleFinalQuestionPool(connection, bkt.CONSTANTS.TOTAL_LESSONS);

    // Get all situational questions from core lessons with lesson order context.
    const [questionRows] = await connection.execute(
      `SELECT
          q.QuestionID,
          q.ModuleID,
          q.QuestionText,
          q.CorrectAnswer,
          q.SkillTag,
          q.QuestionType,
          m.LessonOrder
       FROM question q
       INNER JOIN module m ON q.ModuleID = m.ModuleID
       WHERE q.QuestionType = 'Situational'
         AND q.SkillTag IS NOT NULL
         AND m.LessonOrder BETWEEN 1 AND ?
       ORDER BY m.LessonOrder ASC, q.SkillTag ASC, q.QuestionID ASC`,
      [bkt.CONSTANTS.TOTAL_LESSONS]
    );

    const allQuestions = questionRows
      .map((question) => {
        const normalizedSkillTag = normalizeSkillTagValue(question.SkillTag);
        const lookupKey = `${question.ModuleID}::${normalizeQuestionLookupText(question.QuestionText)}::${normalizedSkillTag}::${normalizeQuestionTypeValue(question.QuestionType)}`;
        const options = optionsLookup.get(lookupKey) || [];

        return {
          ...question,
          SkillTag: normalizedSkillTag,
          OptionA: options[0] || '',
          OptionB: options[1] || '',
          OptionC: options[2] || '',
          OptionD: options[3] || ''
        };
      })
      .filter((question) => {
        const optionCount = [question.OptionA, question.OptionB, question.OptionC, question.OptionD]
          .map((option) => String(option || '').trim())
          .filter(Boolean)
          .length;

        return optionCount >= 2;
      });

    // Select 5 per lesson with skill diversity priority.
    // Prefer the question table source when available, but fall back to module finalQuestions.
    let selectedQuestions = bkt.selectInitialAssessmentQuestions(allQuestions);

    if (selectedQuestions.length < bkt.CONSTANTS.INITIAL_TOTAL_QUESTIONS) {
      selectedQuestions = bkt.selectInitialAssessmentQuestions(moduleFinalQuestionPool);
    }

    if (selectedQuestions.length < bkt.CONSTANTS.INITIAL_TOTAL_QUESTIONS) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        error: 'Insufficient Questions',
        message: `Initial assessment requires ${bkt.CONSTANTS.INITIAL_TOTAL_QUESTIONS} situational questions (5 per lesson across ${bkt.CONSTANTS.TOTAL_LESSONS} lessons).`
      });
    }

    // Get current skill states
    const [skillStates] = await connection.execute(
      'SELECT SkillName, CurrentL FROM bkt_model WHERE UserID = ?',
      [userId]
    );

    const skillStatesMap = {};
    for (const state of skillStates) {
      skillStatesMap[state.SkillName] = parseFloat(state.CurrentL);
    }

    // Create session
    const [sessionResult] = await connection.execute(
      `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, Status, SkillStatesStart, AssignedQuestions, TotalQuestions)
       VALUES (?, ?, 'Initial', 'Active', ?, ?, ?)`,
      [
        userId,
        assessmentId,
        JSON.stringify(skillStatesMap),
        JSON.stringify(selectedQuestions.map(q => q.QuestionID)),
        selectedQuestions.length
      ]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: 'Initial assessment started',
      sessionId: sessionResult.insertId,
      assessmentId,
      totalQuestions: selectedQuestions.length,
      questionsPerLesson: bkt.CONSTANTS.INITIAL_QUESTIONS_PER_LESSON,
      questions: selectedQuestions.map(q => ({
        questionId: q.QuestionID,
        moduleId: q.ModuleID,
        lessonOrder: q.LessonOrder,
        questionText: q.QuestionText,
        options: [q.OptionA, q.OptionB, q.OptionC, q.OptionD].filter((option) => String(option || '').trim() !== ''),
        skillTag: q.SkillTag,
        questionType: q.QuestionType
      }))
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Start initial assessment error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to start initial assessment' });
  }
};

/**
 * Submit a single answer during any assessment.
 * Applies Item Interaction and tracks BKT state.
 * 
 * POST /api/bkt/submit-answer
 * Body: { sessionId, questionId, userAnswer, responseTime }
 */
const submitAnswer = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const { sessionId, questionId, userAnswer, responseTime = 0 } = req.body;

    // Get session
    const [sessions] = await connection.execute(
      'SELECT * FROM bkt_session WHERE SessionID = ? AND UserID = ? AND Status = ?',
      [sessionId, userId, 'Active']
    );

    if (sessions.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Not Found', message: 'Active session not found' });
    }

    const session = sessions[0];

    // Get question
    const [questions] = await connection.execute(
      'SELECT * FROM question WHERE QuestionID = ?',
      [questionId]
    );

    if (questions.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Not Found', message: 'Question not found' });
    }

    const question = questions[0];
    const skillName = question.SkillTag;
    const isCorrect = userAnswer.trim().toLowerCase() === question.CorrectAnswer.trim().toLowerCase();

    const moduleContext = await getModuleBktContext(connection, session.ModuleID);
    if (moduleContext.moduleExists && moduleContext.isSupplementary) {
      if (session.AssessmentID) {
        await connection.execute(
          `INSERT INTO user_answer (AssessmentID, QuestionID, UserAnswer, IsCorrect, ResponseTime, SkillTag)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [session.AssessmentID, questionId, userAnswer, isCorrect, responseTime, skillName]
        );
      }

      await connection.execute(
        'UPDATE bkt_session SET QuestionsAnswered = QuestionsAnswered + 1 WHERE SessionID = ?',
        [sessionId]
      );

      await connection.commit();
      connection.release();

      return res.json({
        message: 'Answer submitted. BKT update skipped for supplementary lesson.',
        questionId,
        skillName,
        isCorrect,
        correctAnswer: isCorrect ? null : question.CorrectAnswer,
        bktSkipped: true,
        assessmentType: session.AssessmentType
      });
    }

    // Get current L for this skill
    const [skillStates] = await connection.execute(
      'SELECT CurrentL FROM bkt_model WHERE UserID = ? AND SkillName = ?',
      [userId, skillName]
    );

    if (skillStates.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: 'Not Initialized', message: `Skill ${skillName} not initialized` });
    }

    const currentL = parseFloat(skillStates[0].CurrentL);

    // ============ ITEM INTERACTION ============
    // This is where the BKT algorithm runs
    const interaction = bkt.itemInteraction(currentL, skillName, isCorrect);

    // Update Current L in bkt_model
    await connection.execute(
      'UPDATE bkt_model SET CurrentL = ?, PostTestL = ?, PKnown = ?, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
      [interaction.currentL_after, interaction.postTestL, interaction.currentL_after, userId, skillName]
    );

    // Record item response with full BKT state snapshot
    await connection.execute(
      `INSERT INTO bkt_item_response 
       (UserID, AssessmentID, QuestionID, ModuleID, SkillName, AssessmentType, IsCorrect, ResponseTime, AttemptNumber,
        BaseL_Before, TransitionL, PostTestL, CurrentL_After)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        userId, session.AssessmentID, questionId, session.ModuleID,
        skillName, session.AssessmentType, isCorrect, responseTime,
        interaction.baseL_before, interaction.transitionL, interaction.postTestL, interaction.currentL_after
      ]
    );

    // Record user answer
    if (session.AssessmentID) {
      await connection.execute(
        `INSERT INTO user_answer (AssessmentID, QuestionID, UserAnswer, IsCorrect, ResponseTime, SkillTag)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [session.AssessmentID, questionId, userAnswer, isCorrect, responseTime, skillName]
      );
    }

    // Update session question count
    await connection.execute(
      'UPDATE bkt_session SET QuestionsAnswered = QuestionsAnswered + 1 WHERE SessionID = ?',
      [sessionId]
    );

    // Apply time-based rules if Review or Final assessment
    let timeRuleResult = null;
    if (session.AssessmentType === 'Review') {
      timeRuleResult = bkt.applyReviewTimeRules(responseTime, 1, isCorrect);

      await connection.execute(
        `INSERT INTO bkt_time_rule (UserID, QuestionID, ModuleID, AssessmentType, ResponseTime, AttemptNumber, IsCorrect, QuestionType, FinalVersionType, NeedsRedoDiscussion)
         VALUES (?, ?, ?, 'Review', ?, 1, ?, ?, ?, ?)`,
        [userId, questionId, session.ModuleID, responseTime, isCorrect,
         question.QuestionType, timeRuleResult.finalVersionType, timeRuleResult.needsRedoDiscussion]
      );
    } else if (session.AssessmentType === 'Final') {
      timeRuleResult = bkt.applyFinalTimeRules(responseTime, question.QuestionType, isCorrect);

      await connection.execute(
        `INSERT INTO bkt_time_rule (UserID, QuestionID, ModuleID, AssessmentType, ResponseTime, AttemptNumber, IsCorrect, QuestionType, NeedToAnswerAgain)
         VALUES (?, ?, ?, 'Final', ?, 1, ?, ?, ?)`,
        [userId, questionId, session.ModuleID, responseTime, isCorrect,
         question.QuestionType, timeRuleResult.needToAnswerAgain]
      );
    }

    await connection.commit();
    connection.release();

    res.json({
      message: 'Answer submitted',
      questionId,
      skillName,
      isCorrect,
      correctAnswer: isCorrect ? null : question.CorrectAnswer,
      bktUpdate: {
        baseL_before: interaction.baseL_before,
        transitionL: interaction.transitionL,
        postTestL: interaction.postTestL,
        currentL_after: interaction.currentL_after
      },
      timeRule: timeRuleResult,
      assessmentType: session.AssessmentType
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Submit answer error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to submit answer' });
  }
};

/**
 * Complete the Initial Assessment.
 * Computes WMInitial, RemainingL for each skill.
 * 
 * POST /api/bkt/initial-assessment/complete
 * Body: { sessionId }
 */
const completeInitialAssessment = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const { sessionId } = req.body;

    // Get session
    const [sessions] = await connection.execute(
      `SELECT * FROM bkt_session WHERE SessionID = ? AND UserID = ? AND AssessmentType = 'Initial' AND Status = 'Active'`,
      [sessionId, userId]
    );

    if (sessions.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Not Found', message: 'Active initial assessment session not found' });
    }

    const session = sessions[0];

    // Get current L for all skills (this is the final Post-Test L from item interactions)
    const [skillStates] = await connection.execute(
      'SELECT SkillName, CurrentL FROM bkt_model WHERE UserID = ?',
      [userId]
    );

    const results = {};

    for (const state of skillStates) {
      const skillName = state.SkillName;
      const initialL = parseFloat(state.CurrentL);

      // Compute WMInitial = 0.1 * InitialL
      const wmInitial = bkt.computeWMInitial(initialL);

      // Compute RemainingL = 1.0 - WMInitial
      const remainingL = bkt.computeRemainingL(wmInitial);

      // Update overall mastery record
      await connection.execute(
        `INSERT INTO bkt_overall_mastery (UserID, SkillName, InitialL, WMInitial, RemainingL, TMLesson, OverallMastery, IsMastered)
         VALUES (?, ?, ?, ?, ?, 0.000000, 0.000000, FALSE)
         ON DUPLICATE KEY UPDATE
           InitialL = VALUES(InitialL),
           WMInitial = VALUES(WMInitial),
           RemainingL = VALUES(RemainingL),
           updated_at = CURRENT_TIMESTAMP`,
        [userId, skillName, initialL, wmInitial, remainingL]
      );

      // Store assessment mastery
      await connection.execute(
        `INSERT INTO bkt_assessment_mastery (UserID, ModuleID, SkillName, AssessmentType, MasteryValue)
         VALUES (?, NULL, ?, 'Initial', ?)
         ON DUPLICATE KEY UPDATE MasteryValue = ?`,
        [userId, skillName, initialL, initialL]
      );

      // Get answer stats for this skill
      const [stats] = await connection.execute(
        `SELECT COUNT(*) as total, SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) as correct
         FROM bkt_item_response WHERE UserID = ? AND AssessmentID = ? AND SkillName = ?`,
        [userId, session.AssessmentID, skillName]
      );

      results[skillName] = {
        initialL,
        wmInitial,
        remainingL,
        questionsAnswered: stats[0].total || 0,
        questionsCorrect: stats[0].correct || 0,
        proficiencyLevel: bkt.getProficiencyLevel(wmInitial)
      };
    }

    // Get final skill states
    const [finalStates] = await connection.execute(
      'SELECT SkillName, CurrentL FROM bkt_model WHERE UserID = ?',
      [userId]
    );
    const skillStatesEnd = {};
    finalStates.forEach(s => { skillStatesEnd[s.SkillName] = parseFloat(s.CurrentL); });

    // Complete session
    await connection.execute(
      `UPDATE bkt_session SET Status = 'Completed', SkillStatesEnd = ?, CompletedAt = CURRENT_TIMESTAMP WHERE SessionID = ?`,
      [JSON.stringify(skillStatesEnd), sessionId]
    );

    // Complete assessment
    if (session.AssessmentID) {
      const [totalStats] = await connection.execute(
        `SELECT COUNT(*) as total, SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) as correct
         FROM user_answer WHERE AssessmentID = ?`,
        [session.AssessmentID]
      );

      const totalQ = totalStats[0].total || 0;
      const correctQ = totalStats[0].correct || 0;
      const score = totalQ > 0 ? (correctQ / totalQ) * 100 : 0;

      await connection.execute(
        `UPDATE assessment SET TotalScore = ?, ResultStatus = 'Pass' WHERE AssessmentID = ?`,
        [score.toFixed(2), session.AssessmentID]
      );
    }

    await connection.commit();
    connection.release();

    res.json({
      message: 'Initial assessment completed',
      sessionId,
      skills: results,
      nextStep: 'Proceed to Lesson 1'
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Complete initial assessment error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to complete initial assessment' });
  }
};

// ==============================================
// 4. LESSON ASSESSMENTS
// ==============================================

/**
 * Start a Diagnostic Assessment for a lesson.
 * Diagnostic has NO direct effect on mastery.
 * 
 * POST /api/bkt/lesson/:moduleId/diagnostic/start
 */
const startDiagnostic = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);

    // Get review questions for this lesson (easy questions)
    const [reviewQuestions] = await connection.execute(
      `SELECT QuestionID, QuestionText, CorrectAnswer, SkillTag, QuestionType 
       FROM question 
       WHERE ModuleID = ? AND QuestionType = 'Easy' AND SkillTag IS NOT NULL
       ORDER BY SkillTag`,
      [moduleId]
    );

    // Select diagnostic questions (half of review, 5 or 10)
    const selectedQuestions = bkt.selectDiagnosticQuestions(reviewQuestions);

    // Create assessment
    const [assessmentResult] = await connection.execute(
      `INSERT INTO assessment (UserID, ModuleID, AssessmentType, ResultStatus) VALUES (?, ?, 'Diagnostic', 'In Progress')`,
      [userId, moduleId]
    );

    // Create session
    const [sessionResult] = await connection.execute(
      `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, AssignedQuestions, TotalQuestions)
       VALUES (?, ?, 'Diagnostic', ?, 'Active', ?, ?)`,
      [userId, assessmentResult.insertId, moduleId,
       JSON.stringify(selectedQuestions.map(q => q.QuestionID)), selectedQuestions.length]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: 'Diagnostic started',
      sessionId: sessionResult.insertId,
      assessmentId: assessmentResult.insertId,
      moduleId,
      totalQuestions: selectedQuestions.length,
      note: 'Diagnostic has no direct effect on mastery. It determines question removal/retention in the lesson.',
      questions: selectedQuestions.map(q => ({
        questionId: q.QuestionID,
        questionText: q.QuestionText,
        skillTag: q.SkillTag
      }))
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Start diagnostic error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to start diagnostic' });
  }
};

/**
 * Submit a diagnostic answer.
 * No BKT update - only tracks correct/incorrect for question removal.
 * 
 * POST /api/bkt/lesson/:moduleId/diagnostic/submit
 * Body: { sessionId, questionId, userAnswer, equivalentQuestionId }
 */
const submitDiagnosticAnswer = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);
    const { sessionId, questionId, userAnswer, equivalentQuestionId } = req.body;

    // Get question
    const [questions] = await connection.execute(
      'SELECT * FROM question WHERE QuestionID = ?',
      [questionId]
    );

    if (questions.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Not Found', message: 'Question not found' });
    }

    const question = questions[0];
    const isCorrect = userAnswer.trim().toLowerCase() === question.CorrectAnswer.trim().toLowerCase();

    // Record diagnostic result
    await connection.execute(
      `INSERT INTO bkt_diagnostic_result (UserID, ModuleID, QuestionID, SkillName, IsCorrect, RemoveFromLesson, EquivalentQuestionID)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, moduleId, questionId, question.SkillTag, isCorrect,
       isCorrect, // If correct → remove equivalent from lesson
       equivalentQuestionId || null]
    );

    // Record user answer
    const [session] = await connection.execute(
      'SELECT AssessmentID FROM bkt_session WHERE SessionID = ?',
      [sessionId]
    );

    if (session.length > 0 && session[0].AssessmentID) {
      await connection.execute(
        'INSERT INTO user_answer (AssessmentID, QuestionID, UserAnswer, IsCorrect, SkillTag) VALUES (?, ?, ?, ?, ?)',
        [session[0].AssessmentID, questionId, userAnswer, isCorrect, question.SkillTag]
      );
    }

    // Update session
    await connection.execute(
      'UPDATE bkt_session SET QuestionsAnswered = QuestionsAnswered + 1 WHERE SessionID = ?',
      [sessionId]
    );

    await connection.commit();
    connection.release();

    res.json({
      message: 'Diagnostic answer submitted',
      questionId,
      isCorrect,
      correctAnswer: isCorrect ? null : question.CorrectAnswer,
      action: isCorrect ? 'Equivalent question removed from lesson' : 'Equivalent question retained in lesson',
      removeFromLesson: isCorrect
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Submit diagnostic answer error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to submit diagnostic answer' });
  }
};

/**
 * Start a Review Assessment for a lesson.
 * 
 * POST /api/bkt/lesson/:moduleId/review/start
 */
const startReviewAssessment = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);
    const { questionCount = 10 } = req.body; // 10 or 20

    // Get easy questions for this lesson
    const [lessonQuestions] = await connection.execute(
      `SELECT QuestionID, QuestionText, CorrectAnswer, SkillTag, QuestionType 
       FROM question 
       WHERE ModuleID = ? AND QuestionType = 'Easy' AND SkillTag IS NOT NULL`,
      [moduleId]
    );

    // Check diagnostic results - remove questions that student already got correct
    const [diagnosticResults] = await connection.execute(
      `SELECT EquivalentQuestionID FROM bkt_diagnostic_result 
       WHERE UserID = ? AND ModuleID = ? AND RemoveFromLesson = TRUE AND EquivalentQuestionID IS NOT NULL`,
      [userId, moduleId]
    );

    const removedQuestionIds = new Set(diagnosticResults.map(r => r.EquivalentQuestionID));
    const filteredQuestions = lessonQuestions.filter(q => !removedQuestionIds.has(q.QuestionID));

    const selectedQuestions = bkt.selectReviewQuestions(filteredQuestions, questionCount);

    // Store current L for each skill before assessment
    const [skillStates] = await connection.execute(
      'SELECT SkillName, CurrentL FROM bkt_model WHERE UserID = ?',
      [userId]
    );

    // Create assessment
    const [assessmentResult] = await connection.execute(
      `INSERT INTO assessment (UserID, ModuleID, AssessmentType, ResultStatus) VALUES (?, ?, 'Review', 'In Progress')`,
      [userId, moduleId]
    );

    // Create session
    const [sessionResult] = await connection.execute(
      `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, SkillStatesStart, AssignedQuestions, TotalQuestions)
       VALUES (?, ?, 'Review', ?, 'Active', ?, ?, ?)`,
      [userId, assessmentResult.insertId, moduleId,
       JSON.stringify(Object.fromEntries(skillStates.map(s => [s.SkillName, parseFloat(s.CurrentL)]))),
       JSON.stringify(selectedQuestions.map(q => q.QuestionID)),
       selectedQuestions.length]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: 'Review assessment started',
      sessionId: sessionResult.insertId,
      assessmentId: assessmentResult.insertId,
      moduleId,
      totalQuestions: selectedQuestions.length,
      questions: selectedQuestions.map(q => ({
        questionId: q.QuestionID,
        questionText: q.QuestionText,
        skillTag: q.SkillTag,
        questionType: q.QuestionType
      }))
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Start review assessment error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to start review assessment' });
  }
};

/**
 * Start a Simulation Assessment for a lesson.
 * 
 * POST /api/bkt/lesson/:moduleId/simulation/start
 */
const startSimulationAssessment = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);

    // Get situational questions/steps for simulation
    const [lessonQuestions] = await connection.execute(
      `SELECT QuestionID, QuestionText, CorrectAnswer, SkillTag, QuestionType 
       FROM question 
       WHERE ModuleID = ? AND QuestionType = 'Situational' AND SkillTag IS NOT NULL`,
      [moduleId]
    );

    const selectedQuestions = bkt.selectSimulationQuestions(lessonQuestions);

    const [skillStates] = await connection.execute(
      'SELECT SkillName, CurrentL FROM bkt_model WHERE UserID = ?',
      [userId]
    );

    const [assessmentResult] = await connection.execute(
      `INSERT INTO assessment (UserID, ModuleID, AssessmentType, ResultStatus) VALUES (?, ?, 'Simulation', 'In Progress')`,
      [userId, moduleId]
    );

    const [sessionResult] = await connection.execute(
      `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, SkillStatesStart, AssignedQuestions, TotalQuestions)
       VALUES (?, ?, 'Simulation', ?, 'Active', ?, ?, ?)`,
      [userId, assessmentResult.insertId, moduleId,
       JSON.stringify(Object.fromEntries(skillStates.map(s => [s.SkillName, parseFloat(s.CurrentL)]))),
       JSON.stringify(selectedQuestions.map(q => q.QuestionID)),
       selectedQuestions.length]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: 'Simulation assessment started',
      sessionId: sessionResult.insertId,
      assessmentId: assessmentResult.insertId,
      moduleId,
      totalQuestions: selectedQuestions.length,
      totalSteps: bkt.CONSTANTS.SIMULATION_TOTAL_STEPS,
      questions: selectedQuestions.map(q => ({
        questionId: q.QuestionID,
        questionText: q.QuestionText,
        skillTag: q.SkillTag,
        questionType: q.QuestionType
      }))
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Start simulation assessment error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to start simulation assessment' });
  }
};

/**
 * Start a Final Assessment for a lesson.
 * 
 * POST /api/bkt/lesson/:moduleId/final/start
 */
const startFinalAssessment = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);

    // Get all questions for this lesson (both Easy and Situational)
    const [lessonQuestions] = await connection.execute(
      `SELECT QuestionID, QuestionText, CorrectAnswer, SkillTag, QuestionType 
       FROM question 
       WHERE ModuleID = ? AND SkillTag IS NOT NULL`,
      [moduleId]
    );

    // Get time rules from review to influence question selection
    const [timeRules] = await connection.execute(
      `SELECT * FROM bkt_time_rule WHERE UserID = ? AND ModuleID = ? AND AssessmentType = 'Review'`,
      [userId, moduleId]
    );

    const selectedQuestions = bkt.selectFinalQuestions(lessonQuestions, timeRules);

    const [skillStates] = await connection.execute(
      'SELECT SkillName, CurrentL FROM bkt_model WHERE UserID = ?',
      [userId]
    );

    const [assessmentResult] = await connection.execute(
      `INSERT INTO assessment (UserID, ModuleID, AssessmentType, ResultStatus) VALUES (?, ?, 'Final', 'In Progress')`,
      [userId, moduleId]
    );

    const [sessionResult] = await connection.execute(
      `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, SkillStatesStart, AssignedQuestions, TotalQuestions)
       VALUES (?, ?, 'Final', ?, 'Active', ?, ?, ?)`,
      [userId, assessmentResult.insertId, moduleId,
       JSON.stringify(Object.fromEntries(skillStates.map(s => [s.SkillName, parseFloat(s.CurrentL)]))),
       JSON.stringify(selectedQuestions.map(q => q.QuestionID)),
       selectedQuestions.length]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: 'Final assessment started',
      sessionId: sessionResult.insertId,
      assessmentId: assessmentResult.insertId,
      moduleId,
      totalQuestions: selectedQuestions.length,
      questions: selectedQuestions.map(q => ({
        questionId: q.QuestionID,
        questionText: q.QuestionText,
        skillTag: q.SkillTag,
        questionType: q.QuestionType
      }))
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Start final assessment error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to start final assessment' });
  }
};

/**
 * Complete a lesson assessment (Review, Simulation, or Final).
 * Assigns Post-Test L to the appropriate variable, then clears Post-Test L.
 * If all three are done, computes MLesson.
 * 
 * POST /api/bkt/lesson/:moduleId/complete
 * Body: { sessionId }
 */
const completeLessonAssessment = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);
    const { sessionId } = req.body;

    // Get session
    const [sessions] = await connection.execute(
      `SELECT * FROM bkt_session WHERE SessionID = ? AND UserID = ? AND Status = 'Active'`,
      [sessionId, userId]
    );

    if (sessions.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Not Found', message: 'Active session not found' });
    }

    const session = sessions[0];
    const assessmentType = session.AssessmentType;

    const moduleContext = await getModuleBktContext(connection, moduleId);
    if (moduleContext.moduleExists && moduleContext.isSupplementary) {
      const [currentStates] = await connection.execute(
        'SELECT SkillName, CurrentL FROM bkt_model WHERE UserID = ?',
        [userId]
      );

      const skillStatesEnd = {};
      currentStates.forEach((state) => {
        skillStatesEnd[state.SkillName] = parseFloat(state.CurrentL);
      });

      await connection.execute(
        `UPDATE bkt_session SET Status = 'Completed', SkillStatesEnd = ?, CompletedAt = CURRENT_TIMESTAMP WHERE SessionID = ?`,
        [JSON.stringify(skillStatesEnd), sessionId]
      );

      if (session.AssessmentID) {
        const [totalStats] = await connection.execute(
          `SELECT COUNT(*) as total, SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) as correct
           FROM user_answer WHERE AssessmentID = ?`,
          [session.AssessmentID]
        );

        const totalQ = totalStats[0].total || 0;
        const correctQ = totalStats[0].correct || 0;
        const score = totalQ > 0 ? (correctQ / totalQ) * 100 : 0;

        await connection.execute(
          `UPDATE assessment SET TotalScore = ?, ResultStatus = ? WHERE AssessmentID = ?`,
          [score.toFixed(2), score >= ASSESSMENT_PASSING_SCORE ? 'Pass' : 'Fail', session.AssessmentID]
        );
      }

      await connection.commit();
      connection.release();

      return res.json({
        message: `${assessmentType} assessment completed. BKT update skipped for supplementary lesson.`,
        sessionId,
        moduleId,
        assessmentType,
        bktSkipped: true,
        skills: {}
      });
    }

    // Get final CurrentL for each skill (this is the Post-Test L from item interactions)
    const [skillStates] = await connection.execute(
      'SELECT SkillName, CurrentL, PostTestL FROM bkt_model WHERE UserID = ?',
      [userId]
    );

    const skillResults = {};

    for (const state of skillStates) {
      const skillName = state.SkillName;
      const assessmentL = parseFloat(state.CurrentL);

      // Store assessment mastery
      await connection.execute(
        `INSERT INTO bkt_assessment_mastery (UserID, ModuleID, SkillName, AssessmentType, MasteryValue)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE MasteryValue = ?`,
        [userId, moduleId, skillName, assessmentType, assessmentL, assessmentL]
      );

      // Update lesson mastery table
      const fieldMap = {
        'Review': 'ReviewL',
        'Simulation': 'SimulationL',
        'Final': 'FinalL'
      };

      const field = fieldMap[assessmentType];
      if (field) {
        // Upsert lesson mastery
        await connection.execute(
          `INSERT INTO bkt_lesson_mastery (UserID, ModuleID, SkillName, ${field})
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE ${field} = ?`,
          [userId, moduleId, skillName, assessmentL, assessmentL]
        );
      }

      // Clear Post-Test L in bkt_model (as per spec: "clear value of Post-Test L")
      await connection.execute(
        'UPDATE bkt_model SET PostTestL = 0.000000, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
        [userId, skillName]
      );

      // Get answer stats
      const [stats] = await connection.execute(
        `SELECT COUNT(*) as total, SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) as correct
         FROM bkt_item_response WHERE UserID = ? AND AssessmentID = ? AND SkillName = ?`,
        [userId, session.AssessmentID, skillName]
      );

      skillResults[skillName] = {
        assessmentL,
        questionsAnswered: stats[0].total || 0,
        questionsCorrect: stats[0].correct || 0
      };
    }

    // Complete session
    const skillStatesEnd = {};
    skillStates.forEach(s => { skillStatesEnd[s.SkillName] = parseFloat(s.CurrentL); });

    await connection.execute(
      `UPDATE bkt_session SET Status = 'Completed', SkillStatesEnd = ?, CompletedAt = CURRENT_TIMESTAMP WHERE SessionID = ?`,
      [JSON.stringify(skillStatesEnd), sessionId]
    );

    // Complete assessment record
    if (session.AssessmentID) {
      const [totalStats] = await connection.execute(
        `SELECT COUNT(*) as total, SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) as correct
         FROM user_answer WHERE AssessmentID = ?`,
        [session.AssessmentID]
      );

      const totalQ = totalStats[0].total || 0;
      const correctQ = totalStats[0].correct || 0;
      const score = totalQ > 0 ? (correctQ / totalQ) * 100 : 0;

      await connection.execute(
        `UPDATE assessment SET TotalScore = ?, ResultStatus = ? WHERE AssessmentID = ?`,
        [score.toFixed(2), score >= ASSESSMENT_PASSING_SCORE ? 'Pass' : 'Fail', session.AssessmentID]
      );
    }

    await connection.commit();
    connection.release();

    res.json({
      message: `${assessmentType} assessment completed`,
      sessionId,
      moduleId,
      assessmentType,
      skills: skillResults
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Complete lesson assessment error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to complete lesson assessment' });
  }
};

// ==============================================
// 5. LESSON MASTERY COMPUTATION
// ==============================================

/**
 * Compute lesson mastery after all assessments are done.
 * MLesson = max(ReviewL, SimulationL, FinalL)
 * WMLesson = W_lesson * MLesson
 * 
 * POST /api/bkt/lesson/:moduleId/compute-mastery
 */
const computeLessonMasteryEndpoint = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);

    const moduleContext = await getModuleBktContext(connection, moduleId);
    if (moduleContext.moduleExists && moduleContext.isSupplementary) {
      await connection.rollback();
      connection.release();
      return res.json({
        message: 'Supplementary lessons are excluded from BKT lesson mastery computation.',
        moduleId,
        needsRetake: false,
        bktSkipped: true,
        skills: {}
      });
    }

    // Get lesson mastery records
    const [lessonMasteries] = await connection.execute(
      'SELECT * FROM bkt_lesson_mastery WHERE UserID = ? AND ModuleID = ?',
      [userId, moduleId]
    );

    if (lessonMasteries.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        error: 'Not Found',
        message: 'No lesson mastery records found. Complete Review, Simulation, and Final assessments first.'
      });
    }

    const wLesson = bkt.computeWLesson();
    const results = {};
    let needsRetake = false;

    for (const lm of lessonMasteries) {
      const skillName = lm.SkillName;
      const reviewL = parseFloat(lm.ReviewL) || 0;
      const simulationL = parseFloat(lm.SimulationL) || 0;
      const finalL = parseFloat(lm.FinalL) || 0;

      // MLesson = max(ReviewL, SimulationL, FinalL)
      const mastery = bkt.computeLessonMastery(reviewL, simulationL, finalL);

      // Update lesson mastery record
      await connection.execute(
        `UPDATE bkt_lesson_mastery 
         SET MLesson = ?, WLesson = ?, WMLesson = ?, IsPassed = ?
         WHERE UserID = ? AND ModuleID = ? AND SkillName = ?`,
        [mastery.mLesson, mastery.wLesson, mastery.wmLesson, mastery.isPassed,
         userId, moduleId, skillName]
      );

      // Check if any skill needs retake
      if (!mastery.isPassed) {
        needsRetake = true;
      }

      results[skillName] = {
        reviewL,
        simulationL,
        finalL,
        mLesson: mastery.mLesson,
        wLesson: mastery.wLesson,
        wmLesson: mastery.wmLesson,
        isPassed: mastery.isPassed,
        proficiency: bkt.getProficiencyLevel(mastery.mLesson)
      };
    }

    // If retake needed, increment retake counter
    if (needsRetake) {
      await connection.execute(
        'UPDATE bkt_lesson_mastery SET RetakeCount = RetakeCount + 1 WHERE UserID = ? AND ModuleID = ? AND IsPassed = FALSE',
        [userId, moduleId]
      );
    }

    await connection.commit();
    connection.release();

    res.json({
      message: 'Lesson mastery computed',
      moduleId,
      lessonMasteryThreshold: bkt.CONSTANTS.LESSON_MASTERY_THRESHOLD,
      needsRetake,
      retakeNote: needsRetake
        ? 'MLesson < 0.85 for one or more skills. Retake needed. Correct answers become statements, incorrect answers will be asked again.'
        : 'All skills passed! Proceed to next lesson or compute overall mastery.',
      skills: results
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Compute lesson mastery error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to compute lesson mastery' });
  }
};

// ==============================================
// 6. OVERALL MASTERY COMPUTATION
// ==============================================

/**
 * Compute overall mastery across all lessons.
 * M_k^{overall} = M_k^{IA} + M_k^{lessons}
 * Where M_k^{lessons} = TMLesson = sum of all WMLesson
 * 
 * POST /api/bkt/compute-overall-mastery
 */
const computeOverallMasteryEndpoint = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;

    const results = {};
    let allMastered = true;

    for (const skillName of bkt.SKILL_NAMES) {
      // Get WMInitial
      const [overallRecords] = await connection.execute(
        'SELECT * FROM bkt_overall_mastery WHERE UserID = ? AND SkillName = ?',
        [userId, skillName]
      );

      if (overallRecords.length === 0) continue;

      const record = overallRecords[0];
      const wmInitial = parseFloat(record.WMInitial) || 0;

      // Get all WMLesson values for this skill
      const [lessonMasteries] = await connection.execute(
        `SELECT lm.WMLesson
         FROM bkt_lesson_mastery lm
         LEFT JOIN module m ON lm.ModuleID = m.ModuleID
         WHERE lm.UserID = ? AND lm.SkillName = ? AND lm.IsPassed = TRUE
           AND (m.ModuleID IS NULL OR LOWER(COALESCE(m.Difficulty, '')) <> ?)`,
        [userId, skillName, SUPPLEMENTARY_DIFFICULTY]
      );

      const wmLessonValues = lessonMasteries.map(lm => parseFloat(lm.WMLesson) || 0);
      const tmLesson = bkt.computeTMLesson(wmLessonValues);

      // Overall Mastery = WMInitial + TMLesson
      const { overallMastery, isMastered } = bkt.computeOverallMastery(wmInitial, tmLesson);

      if (!isMastered) allMastered = false;

      // Get total questions stats for (m/n)*100
      const [questionStats] = await connection.execute(
        `SELECT COUNT(*) as totalQuestions,
                SUM(CASE WHEN ir.IsCorrect = 1 THEN 1 ELSE 0 END) as totalMastered
         FROM bkt_item_response ir
         LEFT JOIN module m ON ir.ModuleID = m.ModuleID
         WHERE ir.UserID = ? AND ir.SkillName = ?
           AND (ir.ModuleID IS NULL OR LOWER(COALESCE(m.Difficulty, '')) <> ?)`,
        [userId, skillName, SUPPLEMENTARY_DIFFICULTY]
      );

      const totalQuestions = questionStats[0].totalQuestions || 0;
      const totalMastered = questionStats[0].totalMastered || 0;
      const masteryPercent = bkt.computeOverallMasteryPercent(totalMastered, totalQuestions);

      // Update overall mastery
      await connection.execute(
        `UPDATE bkt_overall_mastery 
         SET TMLesson = ?, OverallMastery = ?, IsMastered = ?,
             TotalQuestionsMastered = ?, TotalQuestions = ?, OverallMasteryPercent = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE UserID = ? AND SkillName = ?`,
        [tmLesson, overallMastery, isMastered,
         totalMastered, totalQuestions, masteryPercent,
         userId, skillName]
      );

      // Also update bkt_model PKnown to reflect overall mastery
      await connection.execute(
        'UPDATE bkt_model SET PKnown = ?, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
        [overallMastery, userId, skillName]
      );

      results[skillName] = {
        wmInitial,
        tmLesson,
        overallMastery,
        isMastered,
        masteryPercent,
        totalQuestions,
        totalMastered,
        lessonsCompleted: lessonMasteries.length,
        proficiency: bkt.getProficiencyLevel(overallMastery)
      };
    }

    await connection.commit();
    connection.release();

    res.json({
      message: 'Overall mastery computed',
      masteryThreshold: bkt.CONSTANTS.MASTERY_THRESHOLD,
      allSkillsMastered: allMastered,
      skills: results,
      recommendation: !allMastered
        ? bkt.recommendNextSkill(
            Object.entries(results).map(([name, data]) => ({
              skillName: name,
              overallMastery: data.overallMastery
            }))
          )
        : null
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Compute overall mastery error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to compute overall mastery' });
  }
};

// ==============================================
// 7. RETAKE ENDPOINTS
// ==============================================

/**
 * Get retake information for a lesson.
 * Determines which questions to ask again vs show as statements.
 * 
 * GET /api/bkt/lesson/:moduleId/retake-info
 */
const getRetakeInfo = async (req, res) => {
  try {
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);

    // Get lesson mastery for all skills
    const lessonMasteries = await query(
      'SELECT * FROM bkt_lesson_mastery WHERE UserID = ? AND ModuleID = ?',
      [userId, moduleId]
    );

    const skillsNeedingRetake = lessonMasteries
      .filter(lm => parseFloat(lm.MLesson) < bkt.CONSTANTS.LESSON_MASTERY_THRESHOLD)
      .map(lm => lm.SkillName);

    if (skillsNeedingRetake.length === 0) {
      return res.json({
        needsRetake: false,
        message: 'All skills passed for this lesson'
      });
    }

    // Get previous responses for this lesson's assessments
    const previousResponses = await query(
      `SELECT ir.QuestionID, ir.SkillName, ir.IsCorrect, ir.AssessmentType
       FROM bkt_item_response ir
       WHERE ir.UserID = ? AND ir.ModuleID = ? AND ir.AssessmentType IN ('Review', 'Final')
       ORDER BY ir.created_at DESC`,
      [userId, moduleId]
    );

    const { questionsToRetake, questionsAsStatements } = bkt.prepareRetakeQuestions(previousResponses);

    // Get time rules for final assessment
    const timeRules = await query(
      `SELECT * FROM bkt_time_rule WHERE UserID = ? AND ModuleID = ? AND AssessmentType = 'Final'`,
      [userId, moduleId]
    );

    // Filter based on time rules
    const filteredRetake = questionsToRetake.filter(qId => {
      const rule = timeRules.find(tr => tr.QuestionID === qId);
      return !rule || rule.NeedToAnswerAgain;
    });

    res.json({
      needsRetake: true,
      skillsNeedingRetake,
      questionsToRetake: filteredRetake,
      questionsAsStatements,
      retakeCount: lessonMasteries[0]?.RetakeCount || 0,
      note: 'Correct answers become statements. Incorrect answers will be asked again.'
    });
  } catch (error) {
    console.error('Get retake info error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get retake info' });
  }
};

/**
 * Get final assessment attempt history for a module.
 * Returns previous scores, dates, and total attempt count.
 *
 * GET /api/bkt/lesson/:moduleId/final/history
 */
const getFinalAssessmentHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);

    const attempts = await query(
      `SELECT AssessmentID, TotalScore, ResultStatus, DateTaken
       FROM assessment
       WHERE UserID = ? AND ModuleID = ? AND AssessmentType = 'Final' AND ResultStatus != 'In Progress'
       ORDER BY DateTaken DESC`,
      [userId, moduleId]
    );

    res.json({
      totalAttempts: attempts.length,
      attempts: attempts.map((a, idx) => ({
        attemptNumber: attempts.length - idx,
        score: parseFloat(a.TotalScore),
        status: a.ResultStatus,
        date: a.DateTaken
      }))
    });
  } catch (error) {
    console.error('Get final assessment history error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get assessment history' });
  }
};

// ==============================================
// 8. BATCH UPDATE (Backward Compatible)
// ==============================================

/**
 * Batch update BKT knowledge states for multiple skill-tagged answers.
 * This is the legacy endpoint used by existing frontend components.
 * 
 * POST /api/bkt/batch-update
 * Body: { answers: [{ skill, isCorrect, responseTime? }] }
 */
const batchUpdateKnowledge = async (req, res) => {
  const connection = await getConnection();
  let transactionStarted = false;
  try {
    await ensureAssessmentTimeSpentColumn();
    await connection.beginTransaction();
    transactionStarted = true;
    const userId = req.user.userId;
    const { answers, assessmentType = 'Review', moduleId = null } = req.body;

    const assessmentTypeMap = {
      review: 'Review',
      quiz: 'Review',
      final: 'Final',
      'post-test': 'Final',
      posttest: 'Final',
      simulation: 'Simulation',
      diagnostic: 'Diagnostic',
      initial: 'Initial'
    };

    const normalizedAssessmentType =
      assessmentTypeMap[String(assessmentType || 'Review').trim().toLowerCase()] || 'Review';

    const parsedModuleId = Number.parseInt(moduleId, 10);
    const normalizedModuleId = Number.isFinite(parsedModuleId) ? parsedModuleId : null;
    const moduleContext = await getModuleBktContext(connection, normalizedModuleId);
    const skipBktUpdates = moduleContext.moduleExists && moduleContext.isSupplementary;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: 'Bad Request', message: 'answers array is required' });
    }

    const explicitTimeSpentSeconds = Math.max(0, Math.floor(Number(req.body.timeSpentSeconds || 0)));
    const derivedTimeSpentSeconds = answers.reduce(
      (sum, answer) => sum + Math.max(0, Number(answer?.responseTime || 0)),
      0
    );
    const totalTimeSpentSeconds = explicitTimeSpentSeconds > 0
      ? explicitTimeSpentSeconds
      : derivedTimeSpentSeconds;

    // Group answers by skill (skip 'No Skill' questions)
    const skillAnswers = {};
    for (const answer of answers) {
      const skill = answer.skill || 'Memorization';
      if (skill === 'No Skill') continue;
      if (!skillAnswers[skill]) skillAnswers[skill] = [];
      skillAnswers[skill].push({
        isCorrect: answer.isCorrect,
        responseTime: answer.responseTime || 0,
        questionType: answer.questionType || 'Easy'
      });
    }

    const results = [];
    const timeRuleResults = [];
    let persistedAssessment = null;

    const [historyStats] = await connection.execute(
      `SELECT COUNT(*) as completedCount
       FROM assessment
       WHERE UserID = ?
         AND LOWER(COALESCE(AssessmentType, '')) <> 'initial'
         AND ResultStatus <> 'In Progress'`,
      [userId]
    );
    const priorNonInitialAssessments = parseInt(historyStats[0]?.completedCount || 0, 10);

    if (!skipBktUpdates) {
      for (const [skillName, answerList] of Object.entries(skillAnswers)) {
        const params = bkt.getSkillParams(skillName);

        // Get or create skill record
        const [existing] = await connection.execute(
          'SELECT * FROM bkt_model WHERE UserID = ? AND SkillName = ?',
          [userId, skillName]
        );

        let currentL;
        let previousPKnown;
        if (existing.length === 0) {
          currentL = params.pInit;
          previousPKnown = params.pInit;
          await connection.execute(
            `INSERT INTO bkt_model (UserID, SkillName, PKnown, PLearn, PSlip, PGuess, BaseL, CurrentL, PostTestL)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.000000)`,
            [userId, skillName, params.pInit, params.pLearn, params.pSlip, params.pGuess, params.pInit, params.pInit]
          );
        } else {
          currentL = parseFloat(existing[0].CurrentL ?? existing[0].PKnown ?? params.pInit);
          previousPKnown = parseFloat(existing[0].PKnown ?? existing[0].CurrentL ?? params.pInit);
        }

        const questionsAnswered = answerList.length;
        const correctCount = answerList.filter((answer) => Boolean(answer.isCorrect)).length;
        const accuracy = questionsAnswered > 0 ? (correctCount / questionsAnswered) : 0;

        // Step 1-3: Process each answer through item interaction iteratively
        // Each answer's Post-Test L becomes the Current L for the next answer (Step 3)
        for (const answer of answerList) {
          const interaction = bkt.itemInteraction(currentL, skillName, answer.isCorrect);
          currentL = interaction.currentL_after; // Step 3: Current L = Post-Test L

          // Apply time-based rules for Final Assessment
          if (normalizedAssessmentType === 'Final' && answer.responseTime !== undefined) {
            const questionType = answer.questionType || 'Easy';
            const timeRule = bkt.applyFinalTimeRules(answer.responseTime, questionType, answer.isCorrect);
            timeRuleResults.push({
              skill: skillName,
              isCorrect: answer.isCorrect,
              responseTime: answer.responseTime,
              questionType,
              ...timeRule
            });
          }
        }

        if (normalizedAssessmentType === 'Initial') {
          const initialL = currentL;
          const wmInitial = bkt.computeWMInitial(initialL);
          const remainingL = bkt.computeRemainingL(wmInitial);

          await connection.execute(
            `INSERT INTO bkt_overall_mastery (UserID, SkillName, InitialL, WMInitial, RemainingL, TMLesson, OverallMastery, IsMastered)
             VALUES (?, ?, ?, ?, ?, 0.000000, 0.000000, FALSE)
             ON DUPLICATE KEY UPDATE
               InitialL = VALUES(InitialL),
               WMInitial = VALUES(WMInitial),
               RemainingL = VALUES(RemainingL),
               updated_at = CURRENT_TIMESTAMP`,
            [userId, skillName, initialL, wmInitial, remainingL]
          );

          await connection.execute(
            `INSERT INTO bkt_assessment_mastery (UserID, ModuleID, SkillName, AssessmentType, MasteryValue)
             VALUES (?, NULL, ?, 'Initial', ?)
             ON DUPLICATE KEY UPDATE MasteryValue = VALUES(MasteryValue)`,
            [userId, skillName, initialL]
          );

          // Initial assessment should not change current mastery status/progress.
          await connection.execute(
            'UPDATE bkt_model SET PostTestL = 0.000000, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
            [userId, skillName]
          );

          results.push({
            skillName,
            previousPKnown,
            newPKnown: previousPKnown,
            isMastered: previousPKnown >= bkt.CONSTANTS.MASTERY_THRESHOLD,
            questionsAnswered,
            correctCount,
            initialL,
            wmInitial,
            remainingL,
            proficiencyLevel: bkt.getProficiencyLevel(previousPKnown)
          });
        } else {
          const gainCapByType = {
            Diagnostic: 0.08,
            Review: 0.12,
            Simulation: 0.16,
            Final: 0.20
          };

          const dropCapByType = {
            Diagnostic: 0.06,
            Review: 0.10,
            Simulation: 0.14,
            Final: 0.18
          };

          const baseGainCap = gainCapByType[normalizedAssessmentType] || 0.12;
          const baseDropCap = dropCapByType[normalizedAssessmentType] || 0.10;
          const questionWeight = Math.min(1, questionsAnswered / 20);
          const historyWeight = Math.min(1, (priorNonInitialAssessments + 1) / 10);
          const adaptiveConfidence = 0.35 + (0.65 * ((questionWeight + historyWeight) / 2));
          const maxGain = baseGainCap * adaptiveConfidence;
          const maxDrop = baseDropCap * adaptiveConfidence;
          const assessmentSignal = (0.65 * currentL) + (0.35 * accuracy);
          const rawDelta = assessmentSignal - previousPKnown;
          const boundedDelta = rawDelta >= 0
            ? Math.min(rawDelta, maxGain)
            : Math.max(rawDelta, -maxDrop);
          const newPKnown = Math.max(0, Math.min(1, previousPKnown + boundedDelta));

          await connection.execute(
            'UPDATE bkt_model SET CurrentL = ?, PKnown = ?, PostTestL = 0.000000, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
            [newPKnown, newPKnown, userId, skillName]
          );

          results.push({
            skillName,
            previousPKnown,
            newPKnown,
            isMastered: newPKnown >= bkt.CONSTANTS.MASTERY_THRESHOLD,
            questionsAnswered,
            correctCount,
            proficiencyLevel: bkt.getProficiencyLevel(newPKnown)
          });
        }
      }
    }

    const scoredAnswers = answers.filter((answer) => typeof answer?.isCorrect === 'boolean');
    const totalAnswered = scoredAnswers.length;
    const totalCorrect = scoredAnswers.reduce(
      (sum, answer) => sum + (answer.isCorrect ? 1 : 0),
      0
    );
    const score = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
    const resultStatus = score >= ASSESSMENT_PASSING_SCORE ? 'Pass' : 'Fail';

    // Persist assessment summary so review/final attempts are reflected in mastery stats and token logic.
    try {
      const [moduleIdColumn] = await connection.execute("SHOW COLUMNS FROM assessment LIKE 'ModuleID'");
      const hasModuleIdColumn = moduleIdColumn.length > 0;

      const [insertResult] = hasModuleIdColumn
        ? await connection.execute(
            `INSERT INTO assessment (UserID, ModuleID, AssessmentType, TotalScore, TimeSpentSeconds, ResultStatus)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, normalizedModuleId, normalizedAssessmentType, score.toFixed(2), totalTimeSpentSeconds, resultStatus]
          )
        : await connection.execute(
            `INSERT INTO assessment (UserID, AssessmentType, TotalScore, TimeSpentSeconds, ResultStatus)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, normalizedAssessmentType, score.toFixed(2), totalTimeSpentSeconds, resultStatus]
          );

      persistedAssessment = {
        assessmentId: insertResult.insertId,
        assessmentType: normalizedAssessmentType,
        moduleId: normalizedModuleId,
        totalQuestions: totalAnswered,
        totalCorrect,
        score: Number(score.toFixed(2)),
        timeSpentSeconds: totalTimeSpentSeconds,
        resultStatus
      };
    } catch (persistError) {
      // Keep BKT update successful even if optional assessment persistence fails in older schemas.
      console.warn('Batch update assessment persistence skipped:', persistError.message);
    }

    if (transactionStarted) {
      await connection.commit();
      transactionStarted = false;
    }
    connection.release();

    res.json({
      message: skipBktUpdates
        ? 'Supplementary lesson assessment recorded. BKT update skipped.'
        : normalizedAssessmentType === 'Initial'
          ? 'Initial assessment recorded. Baseline mastery values were computed while mastery status remains unchanged until lesson assessments.'
          : 'Knowledge states updated',
      bktSkipped: skipBktUpdates,
      masteryThreshold: bkt.CONSTANTS.MASTERY_THRESHOLD,
      skills: results,
      timeRules: timeRuleResults.length > 0 ? timeRuleResults : undefined,
      assessment: persistedAssessment
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    connection.release();
    console.error('Batch update knowledge error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update knowledge states' });
  }
};

// ==============================================
// 9. RECOMMENDATION
// ==============================================

/**
 * Get recommendation for next skill to practice.
 * 
 * GET /api/bkt/recommendation
 */
const getRecommendation = async (req, res) => {
  try {
    const userId = req.user.userId;

    const overallMasteries = await query(
      `SELECT SkillName, OverallMastery, IsMastered, OverallMasteryPercent
       FROM bkt_overall_mastery WHERE UserID = ?`,
      [userId]
    );

    if (overallMasteries.length === 0) {
      // Fall back to bkt_model
      const knowledgeStates = await query(
        'SELECT SkillName, PKnown as overallMastery FROM bkt_model WHERE UserID = ? ORDER BY PKnown ASC',
        [userId]
      );

      if (knowledgeStates.length === 0) {
        return res.json({ message: 'No knowledge states found. Start learning to get recommendations.' });
      }

      const recommendation = bkt.recommendNextSkill(
        knowledgeStates.map(s => ({ skillName: s.SkillName, overallMastery: parseFloat(s.overallMastery) }))
      );

      return res.json({ recommendation });
    }

    const allMastered = overallMasteries.every(m => m.IsMastered);
    if (allMastered) {
      return res.json({
        message: 'All skills mastered! Excellent work!',
        recommendation: null,
        allMastered: true
      });
    }

    const recommendation = bkt.recommendNextSkill(
      overallMasteries.map(m => ({
        skillName: m.SkillName,
        overallMastery: parseFloat(m.OverallMastery)
      }))
    );

    // Get lesson progress info
    const lessonMasteries = await query(
      `SELECT DISTINCT ModuleID, IsPassed FROM bkt_lesson_mastery WHERE UserID = ? AND SkillName = ?`,
      [userId, recommendation?.skillName]
    );

    res.json({
      recommendation: recommendation ? {
        ...recommendation,
        lessonsCompleted: lessonMasteries.filter(l => l.IsPassed).length,
        lessonsRemaining: bkt.CONSTANTS.TOTAL_LESSONS - lessonMasteries.filter(l => l.IsPassed).length,
        estimatedAttempts: bkt.estimateAttemptsToMastery(
          recommendation.overallMastery,
          recommendation.skillName
        )
      } : null,
      allMastered: false
    });
  } catch (error) {
    console.error('Get recommendation error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get recommendation' });
  }
};

// ==============================================
// 10. LESSON MASTERY OVERVIEW
// ==============================================

/**
 * Get lesson mastery details for all lessons.
 * 
 * GET /api/bkt/lesson-mastery
 */
const getLessonMasteryOverview = async (req, res) => {
  try {
    const userId = req.user.userId;

    const masteries = await query(
      `SELECT lm.*, m.ModuleTitle, m.LessonOrder
       FROM bkt_lesson_mastery lm
       JOIN module m ON lm.ModuleID = m.ModuleID
       WHERE lm.UserID = ?
       ORDER BY m.LessonOrder, lm.SkillName`,
      [userId]
    );

    // Group by module
    const byModule = {};
    for (const m of masteries) {
      if (!byModule[m.ModuleID]) {
        byModule[m.ModuleID] = {
          moduleId: m.ModuleID,
          moduleTitle: m.ModuleTitle,
          lessonOrder: m.LessonOrder,
          skills: []
        };
      }
      byModule[m.ModuleID].skills.push({
        skillName: m.SkillName,
        reviewL: parseFloat(m.ReviewL),
        simulationL: parseFloat(m.SimulationL),
        finalL: parseFloat(m.FinalL),
        mLesson: parseFloat(m.MLesson),
        wmLesson: parseFloat(m.WMLesson),
        isPassed: m.IsPassed,
        retakeCount: m.RetakeCount
      });
    }

    res.json({
      lessons: Object.values(byModule),
      totalLessons: bkt.CONSTANTS.TOTAL_LESSONS,
      masteryThreshold: bkt.CONSTANTS.LESSON_MASTERY_THRESHOLD
    });
  } catch (error) {
    console.error('Get lesson mastery overview error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch lesson mastery overview' });
  }
};

/**
 * Get lesson mastery for a specific module.
 * 
 * GET /api/bkt/lesson-mastery/:moduleId
 */
const getLessonMastery = async (req, res) => {
  try {
    const userId = req.user.userId;
    const moduleId = parseInt(req.params.moduleId);

    const masteries = await query(
      `SELECT lm.*, m.ModuleTitle, m.LessonOrder
       FROM bkt_lesson_mastery lm
       JOIN module m ON lm.ModuleID = m.ModuleID
       WHERE lm.UserID = ? AND lm.ModuleID = ?`,
      [userId, moduleId]
    );

    if (masteries.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'No mastery records found for this lesson' });
    }

    const skills = masteries.map(m => ({
      skillName: m.SkillName,
      reviewL: parseFloat(m.ReviewL),
      simulationL: parseFloat(m.SimulationL),
      finalL: parseFloat(m.FinalL),
      mLesson: parseFloat(m.MLesson),
      wmLesson: parseFloat(m.WMLesson),
      isPassed: m.IsPassed,
      retakeCount: m.RetakeCount,
      proficiency: bkt.getProficiencyLevel(parseFloat(m.MLesson))
    }));

    const allPassed = skills.every(s => s.isPassed);

    res.json({
      moduleId,
      moduleTitle: masteries[0].ModuleTitle,
      lessonOrder: masteries[0].LessonOrder,
      allPassed,
      needsRetake: !allPassed,
      skills
    });
  } catch (error) {
    console.error('Get lesson mastery error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch lesson mastery' });
  }
};

// ==============================================
// 11. SESSION MANAGEMENT
// ==============================================

/**
 * Get active session for user.
 * 
 * GET /api/bkt/session/active
 */
const getActiveSession = async (req, res) => {
  try {
    const userId = req.user.userId;

    const sessions = await query(
      `SELECT * FROM bkt_session WHERE UserID = ? AND Status = 'Active' ORDER BY StartedAt DESC LIMIT 1`,
      [userId]
    );

    if (sessions.length === 0) {
      return res.json({ hasActiveSession: false });
    }

    const session = sessions[0];

    res.json({
      hasActiveSession: true,
      session: {
        sessionId: session.SessionID,
        assessmentType: session.AssessmentType,
        moduleId: session.ModuleID,
        questionsAnswered: session.QuestionsAnswered,
        totalQuestions: session.TotalQuestions,
        startedAt: session.StartedAt
      }
    });
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch active session' });
  }
};

/**
 * Abandon an active session (if student leaves mid-assessment).
 * 
 * POST /api/bkt/session/:sessionId/abandon
 */
const abandonSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;

    const result = await query(
      `UPDATE bkt_session SET Status = 'Abandoned', CompletedAt = CURRENT_TIMESTAMP 
       WHERE SessionID = ? AND UserID = ? AND Status = 'Active'`,
      [sessionId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Active session not found' });
    }

    res.json({ message: 'Session abandoned', sessionId });
  } catch (error) {
    console.error('Abandon session error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to abandon session' });
  }
};

// ==============================================
// 12. SINGLE UPDATE (Backward Compatible)
// ==============================================

/**
 * Update a single skill's knowledge state.
 * Legacy endpoint for backward compatibility.
 * 
 * POST /api/bkt/update
 * Body: { skillName, isCorrect }
 */
const updateKnowledge = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.userId;
    const { skillName, isCorrect } = req.body;

    const [states] = await connection.execute(
      'SELECT * FROM bkt_model WHERE UserID = ? AND SkillName = ?',
      [userId, skillName]
    );

    if (states.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Not Found', message: 'Skill not initialized' });
    }

    const currentL = parseFloat(states[0].CurrentL || states[0].PKnown);
    const interaction = bkt.itemInteraction(currentL, skillName, isCorrect);

    await connection.execute(
      'UPDATE bkt_model SET CurrentL = ?, PKnown = ?, PostTestL = ?, updated_at = CURRENT_TIMESTAMP WHERE UserID = ? AND SkillName = ?',
      [interaction.currentL_after, interaction.currentL_after, interaction.postTestL, userId, skillName]
    );

    await connection.commit();
    connection.release();

    res.json({
      message: 'Knowledge state updated',
      skillName,
      previousPKnown: currentL,
      newPKnown: interaction.currentL_after,
      bktUpdate: interaction,
      isMastered: interaction.currentL_after >= bkt.CONSTANTS.MASTERY_THRESHOLD,
      masteryThreshold: bkt.CONSTANTS.MASTERY_THRESHOLD
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Update knowledge error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update knowledge state' });
  }
};

// ==============================================
// EXPORTS
// ==============================================
module.exports = {
  // Initialization
  initializeAllSkills,
  initializeSkillKnowledge,

  // Knowledge States
  getUserKnowledgeStates,
  getSkillKnowledgeState,

  // Initial Assessment
  startInitialAssessment,
  completeInitialAssessment,

  // Lesson Assessments
  startDiagnostic,
  submitDiagnosticAnswer,
  startReviewAssessment,
  startSimulationAssessment,
  startFinalAssessment,
  completeLessonAssessment,

  // Answer Submission
  submitAnswer,

  // Mastery Computation
  computeLessonMasteryEndpoint,
  computeOverallMasteryEndpoint,

  // Retake
  getRetakeInfo,
  getFinalAssessmentHistory,

  // Legacy / Backward Compatible
  batchUpdateKnowledge,
  updateKnowledge,

  // Recommendation
  getRecommendation,

  // Lesson Mastery Views
  getLessonMasteryOverview,
  getLessonMastery,

  // Session Management
  getActiveSession,
  abandonSession
};
