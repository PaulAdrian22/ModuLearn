/**
 * ==============================================
 * BKT ENGINE - Bayesian Knowledge Tracing
 * ==============================================
 * 
 * Complete implementation of the BKT algorithm
 * for the MODULEARN adaptive learning platform.
 * 
 * Variables:
 *   P(L_{k,t})       - Base L / Current L: mastery value per skill
 *   P(L_{k,t}|X)     - Transition L: posterior after observing response
 *   P(L_{k,t+1})     - Post-Test L: mastery after learning transition
 *   M_k^{IA}         - WMInitial: weighted initial assessment mastery
 *   R_k              - Remaining L: remaining weight for lessons
 *   P(L_{k,j})       - MLesson(n): lesson mastery per skill
 *   M_{k,j}          - WMLesson(n): weighted lesson mastery
 *   TMLesson          - Total accumulated lesson mastery weight
 *   M_k^{overall}    - OverallM: overall mastery per skill
 * 
 * Skills (k=5):
 *   1. Memorization
 *   2. Technical Comprehension
 *   3. Analytical Thinking
 *   4. Critical Thinking
 *   5. Problem Solving
 * 
 * Lessons (n=7): 7 modules/lessons
 */

// ==============================================
// SKILL-SPECIFIC BKT PARAMETERS
// P(L) = 0.01 at start for all skills
// G = Guess, T = Transit/Learn, S = Slip
// ==============================================
const SKILL_BKT_PARAMS = {
  'Memorization': {
    pInit: 0.01,   // P(L) initial
    pGuess: 0.15,  // G
    pLearn: 0.10,  // T (Transit)
    pSlip: 0.40    // S
  },
  'Technical Comprehension': {
    pInit: 0.01,
    pGuess: 0.15,
    pLearn: 0.10,
    pSlip: 0.40
  },
  'Analytical Thinking': {
    pInit: 0.01,
    pGuess: 0.14,
    pLearn: 0.11,
    pSlip: 0.43
  },
  'Critical Thinking': {
    pInit: 0.01,
    pGuess: 0.13,
    pLearn: 0.12,
    pSlip: 0.45
  },
  'Problem Solving': {
    pInit: 0.01,
    pGuess: 0.13,
    pLearn: 0.12,
    pSlip: 0.45
  }
};

// ==============================================
// SYSTEM CONSTANTS
// ==============================================
const CONSTANTS = {
  INITIAL_L: 0.01,                        // Base L at start
  MASTERY_THRESHOLD: 0.85,                // OverallM >= 0.85 = mastered
  LESSON_MASTERY_THRESHOLD: 0.85,         // MLesson >= 0.85 = lesson passed
  INITIAL_ASSESSMENT_WEIGHT: 0.1,         // 10% weight for initial assessment
  LESSON_WEIGHT_TOTAL: 0.9,              // 90% weight for all lessons
  TOTAL_LESSONS: 7,                       // 7 lessons total
  TOTAL_SKILLS: 5,                        // 5 skills total

  // Question counts per assessment type
  INITIAL_QUESTIONS_PER_SKILL: 7,         // 7 questions per skill = 35 total
  INITIAL_TOTAL_QUESTIONS: 35,
  DIAGNOSTIC_QUESTIONS_MIN: 5,            // 5 or 10 questions
  DIAGNOSTIC_QUESTIONS_MAX: 10,
  REVIEW_QUESTIONS_MIN: 10,               // 10 or 20 questions
  REVIEW_QUESTIONS_MAX: 20,
  SIMULATION_TOTAL_STEPS: 35,             // 35 questions/steps
  FINAL_TOTAL_QUESTIONS: 30,              // 30 questions

  // Time-based rule thresholds (in seconds)
  REVIEW_TIME_THRESHOLD: 30,              // 30 seconds for review
  REVIEW_COOLDOWN: 30,                    // 30 second cooldown
  REVIEW_MAX_ATTEMPTS: 5,                 // 3-5 attempts before easy version
  REVIEW_MIN_ATTEMPTS_FOR_EASY: 3,
  FINAL_SITUATIONAL_TIME_THRESHOLD: 120,  // 2 minutes for situational
  FINAL_EASY_TIME_THRESHOLD: 60,          // 1 minute for easy
};

// ==============================================
// SKILL LIST
// ==============================================
const SKILL_NAMES = [
  'Memorization',
  'Technical Comprehension',
  'Analytical Thinking',
  'Critical Thinking',
  'Problem Solving'
];

// ==============================================
// CORE BKT FORMULAS
// ==============================================

/**
 * Get BKT parameters for a specific skill.
 * Falls back to Memorization params if skill not found.
 * 
 * @param {string} skillName - Name of the skill
 * @returns {object} { pInit, pGuess, pLearn, pSlip }
 */
const getSkillParams = (skillName) => {
  return SKILL_BKT_PARAMS[skillName] || SKILL_BKT_PARAMS['Memorization'];
};

/**
 * STEP 1 of Item Interaction: Compute Transition L
 * 
 * If correct (X_t = 1):
 *   P(L_{k,t} | X_t=1) = [P(L_{k,t}) * (1 - S_k)] / [P(L_{k,t}) * (1 - S_k) + (1 - P(L_{k,t})) * G_k]
 * 
 * If incorrect (X_t = 0):
 *   P(L_{k,t} | X_t=0) = [P(L_{k,t}) * S_k] / [P(L_{k,t}) * S_k + (1 - P(L_{k,t})) * (1 - G_k)]
 * 
 * @param {number} currentL - Current L value P(L_{k,t})
 * @param {string} skillName - Skill name to get G and S params
 * @param {boolean} isCorrect - Whether the answer was correct
 * @returns {number} Transition L value
 */
const computeTransitionL = (currentL, skillName, isCorrect) => {
  const params = getSkillParams(skillName);
  const G = params.pGuess;
  const S = params.pSlip;
  let transitionL;

  if (isCorrect) {
    // P(L | correct) = [P(L) * (1 - S)] / [P(L) * (1 - S) + (1 - P(L)) * G]
    const numerator = currentL * (1 - S);
    const denominator = currentL * (1 - S) + (1 - currentL) * G;
    transitionL = denominator > 0 ? numerator / denominator : currentL;
  } else {
    // P(L | incorrect) = [P(L) * S] / [P(L) * S + (1 - P(L)) * (1 - G)]
    const numerator = currentL * S;
    const denominator = currentL * S + (1 - currentL) * (1 - G);
    transitionL = denominator > 0 ? numerator / denominator : currentL;
  }

  return clamp(transitionL);
};

/**
 * STEP 2 of Item Interaction: Compute Post-Test L
 * 
 * P(L_{k,t+1}) = P(L_{k,t} | X_t) + [1 - P(L_{k,t} | X_t)] * T_k
 * 
 * @param {number} transitionL - Transition L value from Step 1
 * @param {string} skillName - Skill name to get T param
 * @returns {number} Post-Test L value
 */
const computePostTestL = (transitionL, skillName) => {
  const params = getSkillParams(skillName);
  const T = params.pLearn;

  // P(L_{k,t+1}) = P(L_{k,t}|X_t) + [1 - P(L_{k,t}|X_t)] * T_k
  const postTestL = transitionL + (1 - transitionL) * T;

  return clamp(postTestL);
};

/**
 * Complete Item Interaction: Transition L → Post-Test L → Update Current L
 * 
 * This is the complete BKT update for a single question-answer pair.
 * Returns all intermediate values for tracking.
 * 
 * @param {number} currentL - Current L value (Base L for 1st question, Current L for subsequent)
 * @param {string} skillName - Skill name
 * @param {boolean} isCorrect - Whether the answer was correct
 * @returns {object} { baseL_before, transitionL, postTestL, currentL_after }
 */
const itemInteraction = (currentL, skillName, isCorrect) => {
  const baseL_before = currentL;

  // Step 1: Compute Transition L
  const transitionL = computeTransitionL(currentL, skillName, isCorrect);

  // Step 2: Compute Post-Test L
  const postTestL = computePostTestL(transitionL, skillName);

  // Step 3: Set Current L = Post-Test L for next iteration
  const currentL_after = postTestL;

  return {
    baseL_before: round6(baseL_before),
    transitionL: round6(transitionL),
    postTestL: round6(postTestL),
    currentL_after: round6(currentL_after)
  };
};

/**
 * Process a full assessment (sequence of answers for one skill).
 * Iterates through all answers, applying Item Interaction for each.
 * Returns the final Post-Test L and all interaction details.
 * 
 * @param {number} baseL - Starting L value for this assessment
 * @param {string} skillName - Skill name
 * @param {Array<boolean>} answers - Array of correct/incorrect values
 * @returns {object} { finalPostTestL, interactions[] }
 */
const processAssessmentForSkill = (baseL, skillName, answers) => {
  let currentL = baseL;
  const interactions = [];

  for (let i = 0; i < answers.length; i++) {
    const result = itemInteraction(currentL, skillName, answers[i]);
    interactions.push({
      questionIndex: i,
      isCorrect: answers[i],
      ...result
    });
    // Set Current L = Post-Test L for next question
    currentL = result.currentL_after;
  }

  return {
    finalPostTestL: currentL,
    interactions
  };
};

// ==============================================
// INITIAL ASSESSMENT COMPUTATIONS
// ==============================================

/**
 * Compute WMInitial (Weighted Mastery for Initial Assessment)
 * 
 * M_k^{IA} = 0.1 * P(L_k^{IA})
 * 
 * @param {number} initialL - The Initial L value (final Post-Test L from initial assessment)
 * @returns {number} WMInitial value
 */
const computeWMInitial = (initialL) => {
  return round6(CONSTANTS.INITIAL_ASSESSMENT_WEIGHT * initialL);
};

/**
 * Compute Remaining L
 * 
 * R_k = 1.00 - M_k^{IA}
 * 
 * @param {number} wmInitial - The WMInitial value
 * @returns {number} Remaining L value
 */
const computeRemainingL = (wmInitial) => {
  return round6(1.0 - wmInitial);
};

/**
 * Process complete Initial Assessment for all skills.
 * 
 * @param {object} skillAnswers - { skillName: [true/false, ...] } for each skill
 * @returns {object} Per-skill results with InitialL, WMInitial, RemainingL
 */
const processInitialAssessment = (skillAnswers) => {
  const results = {};

  for (const skillName of SKILL_NAMES) {
    const answers = skillAnswers[skillName] || [];
    if (answers.length === 0) continue;

    const params = getSkillParams(skillName);
    const baseL = params.pInit; // 0.01

    // Process all answers for this skill
    const { finalPostTestL, interactions } = processAssessmentForSkill(baseL, skillName, answers);

    // Initial L = final Post-Test L
    const initialL = finalPostTestL;

    // WMInitial = 0.1 * Initial L
    const wmInitial = computeWMInitial(initialL);

    // Remaining L = 1.0 - WMInitial
    const remainingL = computeRemainingL(wmInitial);

    results[skillName] = {
      initialL,
      wmInitial,
      remainingL,
      questionsAnswered: answers.length,
      questionsCorrect: answers.filter(Boolean).length,
      interactions
    };
  }

  return results;
};

// ==============================================
// LESSON MASTERY COMPUTATIONS
// ==============================================

/**
 * Compute W_lesson (weight per lesson)
 * 
 * W_lesson = 0.9 / 7 (total lesson weight / total lessons)
 * 
 * @returns {number} Weight per lesson
 */
const computeWLesson = () => {
  return round6(CONSTANTS.LESSON_WEIGHT_TOTAL / CONSTANTS.TOTAL_LESSONS);
};

/**
 * Compute MLesson (lesson mastery per skill)
 * 
 * P(L_{k,j}) = max(P(L_k^{rev}), P(L_k^{final}), P(L_k^{sim}))
 * 
 * @param {number} reviewL - Review L for this skill (0 if not yet computed)
 * @param {number} finalL - Final L for this skill (0 if not yet computed)
 * @param {number} simulationL - Simulation L for this skill (0 if not yet computed)
 * @returns {number} MLesson value
 */
const computeMLesson = (reviewL, finalL, simulationL) => {
  return round6(Math.max(reviewL || 0, finalL || 0, simulationL || 0));
};

/**
 * Compute WMLesson (weighted lesson mastery per skill)
 * 
 * M_{k,j} = W_lesson * P(L_{k,j})
 * 
 * @param {number} mLesson - MLesson value
 * @param {number} wLesson - Weight per lesson (0.9/7)
 * @returns {number} WMLesson value
 */
const computeWMLesson = (mLesson, wLesson) => {
  return round6(wLesson * mLesson);
};

/**
 * Compute TMLesson (total accumulated lesson mastery)
 * Sum of all WMLesson values across completed lessons
 * 
 * @param {Array<number>} wmLessonValues - Array of WMLesson values for each completed lesson
 * @returns {number} TMLesson value
 */
const computeTMLesson = (wmLessonValues) => {
  return round6(wmLessonValues.reduce((sum, val) => sum + (val || 0), 0));
};

/**
 * Process a lesson assessment (Review, Simulation, or Final) for one skill.
 * Uses the Current L from the student's last state as the base.
 * 
 * @param {number} currentL - Starting Current L for this skill
 * @param {string} skillName - Skill name
 * @param {Array<boolean>} answers - Array of correct/incorrect values
 * @returns {object} { assessmentL, interactions }
 */
const processLessonAssessmentForSkill = (currentL, skillName, answers) => {
  const { finalPostTestL, interactions } = processAssessmentForSkill(currentL, skillName, answers);

  return {
    assessmentL: finalPostTestL,
    interactions
  };
};

/**
 * Compute complete lesson mastery after all assessments are done.
 * 
 * @param {number} reviewL - Review L per skill
 * @param {number} simulationL - Simulation L per skill
 * @param {number} finalL - Final L per skill
 * @returns {object} { mLesson, wLesson, wmLesson, isPassed }
 */
const computeLessonMastery = (reviewL, simulationL, finalL) => {
  const mLesson = computeMLesson(reviewL, finalL, simulationL);
  const wLesson = computeWLesson();
  const wmLesson = computeWMLesson(mLesson, wLesson);
  const isPassed = mLesson >= CONSTANTS.LESSON_MASTERY_THRESHOLD;

  return {
    mLesson,
    wLesson,
    wmLesson,
    isPassed
  };
};

// ==============================================
// OVERALL MASTERY COMPUTATION
// ==============================================

/**
 * Compute Overall Mastery for a skill
 * 
 * M_k^{overall} = M_k^{IA} + M_k^{lessons}
 * Where M_k^{lessons} = TMLesson (sum of all WMLesson)
 * 
 * @param {number} wmInitial - WMInitial value for the skill
 * @param {number} tmLesson - TMLesson value (sum of all WMLesson for this skill)
 * @returns {object} { overallMastery, isMastered }
 */
const computeOverallMastery = (wmInitial, tmLesson) => {
  const overallMastery = round6(wmInitial + tmLesson);
  const isMastered = overallMastery >= CONSTANTS.MASTERY_THRESHOLD;

  return {
    overallMastery,
    isMastered
  };
};

/**
 * Compute Overall Mastery Percent
 * 
 * Overall Mastery = (m / n) * 100
 * Where m = total questions mastered, n = total questions
 * 
 * @param {number} totalMastered - Total questions mastered (m)
 * @param {number} totalQuestions - Total questions/steps (n)
 * @returns {number} Overall mastery percentage
 */
const computeOverallMasteryPercent = (totalMastered, totalQuestions) => {
  if (totalQuestions === 0) return 0;
  return round2((totalMastered / totalQuestions) * 100);
};

// ==============================================
// TIME-BASED RULES
// ==============================================

/**
 * Apply time-based rules for Review Assessment
 * 
 * Rules:
 * - Time < 30s AND after first attempt AND correct → Situational version in Final
 * - Incorrect → Redo lesson discussion, 30s cooldown
 * - After 3-5 attempts → Easy version in Final
 * 
 * @param {number} responseTime - Response time in seconds
 * @param {number} attemptNumber - Current attempt number
 * @param {boolean} isCorrect - Whether answer was correct
 * @returns {object} { finalVersionType, needsRedoDiscussion, cooldownSeconds }
 */
const applyReviewTimeRules = (responseTime, attemptNumber, isCorrect) => {
  const result = {
    finalVersionType: null,       // 'Easy' or 'Situational' for the Final Assessment
    needsRedoDiscussion: false,   // Whether student needs to redo lesson discussion
    cooldownSeconds: 0            // Cooldown before retrying
  };

  if (!isCorrect) {
    // Incorrect → Redo lesson discussion with 30s cooldown
    result.needsRedoDiscussion = true;
    result.cooldownSeconds = CONSTANTS.REVIEW_COOLDOWN;
    return result;
  }

  // Correct answer
  if (attemptNumber >= CONSTANTS.REVIEW_MIN_ATTEMPTS_FOR_EASY) {
    // After 3-5 attempts → Easy version in Final Assessment
    result.finalVersionType = 'Easy';
  } else if (responseTime < CONSTANTS.REVIEW_TIME_THRESHOLD && attemptNumber > 1) {
    // Time < 30s AND after first attempt AND correct → Situational in Final
    result.finalVersionType = 'Situational';
  } else {
    // Normal correct answer
    result.finalVersionType = 'Easy';
  }

  return result;
};

/**
 * Apply time-based rules for Final Assessment
 * 
 * Rules:
 * - Time < 2min AND Situational AND correct → No need to answer on retake
 * - Time < 2min AND Situational AND incorrect → Need to answer on retake
 * - Time < 1min AND Easy AND correct → No need to answer on retake
 * - Time < 1min AND Easy AND incorrect → Need to answer on retake
 * 
 * @param {number} responseTime - Response time in seconds
 * @param {string} questionType - 'Easy' or 'Situational'
 * @param {boolean} isCorrect - Whether answer was correct
 * @returns {object} { needToAnswerAgain }
 */
const applyFinalTimeRules = (responseTime, questionType, isCorrect) => {
  const result = {
    needToAnswerAgain: true  // Default: needs to answer again on retake
  };

  if (questionType === 'Situational') {
    if (responseTime < CONSTANTS.FINAL_SITUATIONAL_TIME_THRESHOLD && isCorrect) {
      // Time < 2min AND Situational AND correct → No need to answer again
      result.needToAnswerAgain = false;
    }
    // Time < 2min AND Situational AND incorrect → Need to answer again (default)
  } else if (questionType === 'Easy') {
    if (responseTime < CONSTANTS.FINAL_EASY_TIME_THRESHOLD && isCorrect) {
      // Time < 1min AND Easy AND correct → No need to answer again
      result.needToAnswerAgain = false;
    }
    // Time < 1min AND Easy AND incorrect → Need to answer again (default)
  }

  return result;
};

// ==============================================
// DIAGNOSTIC LOGIC
// ==============================================

/**
 * Process diagnostic results.
 * Diagnostic has NO direct effect on mastery.
 * It only determines which questions to remove/retain in the lesson.
 * 
 * @param {Array<object>} answers - Array of { questionId, isCorrect, skillName, equivalentQuestionId }
 * @returns {Array<object>} Processed results with remove/retain decisions
 */
const processDiagnostic = (answers) => {
  return answers.map(answer => ({
    questionId: answer.questionId,
    skillName: answer.skillName,
    isCorrect: answer.isCorrect,
    // If correct → remove equivalent question within lesson
    // If incorrect → retain equivalent question within lesson
    removeFromLesson: answer.isCorrect,
    equivalentQuestionId: answer.equivalentQuestionId || null
  }));
};

// ==============================================
// RETAKE LOGIC
// ==============================================

/**
 * Check if a lesson needs retake.
 * 
 * If MLesson(n) < 0.85, lesson retake is needed until they pass.
 * On retake:
 * - Items answered correctly → turned into statements
 * - Items answered incorrectly → asked again
 * 
 * @param {number} mLesson - MLesson value for any skill
 * @returns {boolean} Whether retake is needed
 */
const needsLessonRetake = (mLesson) => {
  return mLesson < CONSTANTS.LESSON_MASTERY_THRESHOLD;
};

/**
 * Determine which questions to include in a retake assessment.
 * - Correct answers → turned to statements (not asked again)
 * - Incorrect answers → asked again
 * 
 * @param {Array<object>} previousResponses - Array of { questionId, isCorrect }
 * @returns {object} { questionsToRetake, questionsAsStatements }
 */
const prepareRetakeQuestions = (previousResponses) => {
  const questionsToRetake = [];
  const questionsAsStatements = [];

  for (const response of previousResponses) {
    if (response.isCorrect) {
      questionsAsStatements.push(response.questionId);
    } else {
      questionsToRetake.push(response.questionId);
    }
  }

  return { questionsToRetake, questionsAsStatements };
};

// ==============================================
// QUESTION SELECTION LOGIC
// ==============================================

/**
 * Select questions for Initial Assessment.
 * 35 questions total (7 per skill), all Situational, from overall question list.
 * 
 * @param {Array<object>} allQuestions - All available questions
 * @returns {Array<object>} Selected questions
 */
const selectInitialAssessmentQuestions = (allQuestions) => {
  const selected = [];

  for (const skillName of SKILL_NAMES) {
    const skillQuestions = allQuestions.filter(
      q => q.SkillTag === skillName && q.QuestionType === 'Situational'
    );

    // Select 7 per skill (no randomization for initial - knowledge is being assessed)
    const count = Math.min(CONSTANTS.INITIAL_QUESTIONS_PER_SKILL, skillQuestions.length);
    selected.push(...skillQuestions.slice(0, count));
  }

  return selected;
};

/**
 * Select questions for Diagnostic.
 * 5 or 10 questions (half of review questions), all Easy, from Review question list.
 * Equal distribution from each skill.
 * 
 * @param {Array<object>} reviewQuestions - Questions assigned to review for this lesson
 * @param {number} count - Number of questions to select (5 or 10)
 * @returns {Array<object>} Selected questions
 */
const selectDiagnosticQuestions = (reviewQuestions, count = null) => {
  // Default: half of review questions
  const totalCount = count || Math.ceil(reviewQuestions.length / 2);
  const perSkill = Math.ceil(totalCount / SKILL_NAMES.length);
  const selected = [];

  for (const skillName of SKILL_NAMES) {
    const skillQuestions = reviewQuestions.filter(
      q => q.SkillTag === skillName && q.QuestionType === 'Easy'
    );
    // Shuffle and pick
    const shuffled = shuffleArray([...skillQuestions]);
    selected.push(...shuffled.slice(0, perSkill));
  }

  return selected.slice(0, totalCount);
};

/**
 * Select questions for Review Assessment.
 * 10 or 20 questions, all Easy, inside the lesson.
 * Equal distribution from each skill.
 * 
 * @param {Array<object>} lessonQuestions - Questions assigned to this lesson
 * @param {number} count - Number of questions (10 or 20)
 * @returns {Array<object>} Selected questions
 */
const selectReviewQuestions = (lessonQuestions, count = 10) => {
  const perSkill = Math.ceil(count / SKILL_NAMES.length);
  const selected = [];

  for (const skillName of SKILL_NAMES) {
    const skillQuestions = lessonQuestions.filter(
      q => q.SkillTag === skillName && q.QuestionType === 'Easy'
    );
    const shuffled = shuffleArray([...skillQuestions]);
    selected.push(...shuffled.slice(0, perSkill));
  }

  return selected.slice(0, count);
};

/**
 * Select questions for Simulation Assessment.
 * 35 questions/steps, all Situational, equal variance of skill-tagged questions.
 * 
 * @param {Array<object>} lessonQuestions - Questions/steps for this lesson
 * @returns {Array<object>} Selected questions
 */
const selectSimulationQuestions = (lessonQuestions) => {
  const perSkill = Math.ceil(CONSTANTS.SIMULATION_TOTAL_STEPS / SKILL_NAMES.length);
  const selected = [];

  for (const skillName of SKILL_NAMES) {
    const skillQuestions = lessonQuestions.filter(
      q => q.SkillTag === skillName && q.QuestionType === 'Situational'
    );
    const shuffled = shuffleArray([...skillQuestions]);
    selected.push(...shuffled.slice(0, perSkill));
  }

  return selected.slice(0, CONSTANTS.SIMULATION_TOTAL_STEPS);
};

/**
 * Select questions for Final Assessment.
 * 30 questions, both Easy and Situational, inside the lesson.
 * Equal distribution from each skill.
 * Can include questions from Review question list.
 * 
 * @param {Array<object>} lessonQuestions - Questions assigned to this lesson
 * @param {Array<object>} timeRules - Time-based rules from review (affects Easy/Situational selection)
 * @returns {Array<object>} Selected questions
 */
const selectFinalQuestions = (lessonQuestions, timeRules = []) => {
  const perSkill = Math.ceil(CONSTANTS.FINAL_TOTAL_QUESTIONS / SKILL_NAMES.length);
  const selected = [];

  for (const skillName of SKILL_NAMES) {
    const skillQuestions = lessonQuestions.filter(q => q.SkillTag === skillName);
    const shuffled = shuffleArray([...skillQuestions]);
    selected.push(...shuffled.slice(0, perSkill));
  }

  return selected.slice(0, CONSTANTS.FINAL_TOTAL_QUESTIONS);
};

// ==============================================
// PROFICIENCY HELPERS
// ==============================================

/**
 * Get proficiency level based on overall mastery value.
 * 
 * @param {number} overallMastery - Overall mastery value
 * @returns {string} Proficiency level
 */
const getProficiencyLevel = (overallMastery) => {
  if (overallMastery >= 0.85) return 'Mastered';
  if (overallMastery >= 0.70) return 'Advanced';
  if (overallMastery >= 0.50) return 'Intermediate';
  if (overallMastery >= 0.30) return 'Beginner';
  return 'Novice';
};

/**
 * Check if a skill is mastered based on overall mastery.
 * 
 * @param {number} overallMastery - Overall mastery value
 * @returns {boolean} Whether the skill is mastered
 */
const isMastered = (overallMastery) => {
  return overallMastery >= CONSTANTS.MASTERY_THRESHOLD;
};

/**
 * Recommend next skill to practice.
 * Returns the skill with the lowest overall mastery.
 * 
 * @param {Array<object>} skillMasteries - Array of { skillName, overallMastery }
 * @returns {object|null} Recommended skill or null if all mastered
 */
const recommendNextSkill = (skillMasteries) => {
  const unmastered = skillMasteries
    .filter(s => s.overallMastery < CONSTANTS.MASTERY_THRESHOLD)
    .sort((a, b) => a.overallMastery - b.overallMastery);

  if (unmastered.length === 0) return null;

  return {
    skillName: unmastered[0].skillName,
    overallMastery: unmastered[0].overallMastery,
    proficiencyLevel: getProficiencyLevel(unmastered[0].overallMastery),
    reason: 'This skill needs the most practice'
  };
};

/**
 * Estimate attempts needed to reach mastery for a skill.
 * 
 * @param {number} currentL - Current L value
 * @param {string} skillName - Skill name
 * @param {number} threshold - Mastery threshold
 * @returns {number} Estimated number of correct answers needed
 */
const estimateAttemptsToMastery = (currentL, skillName, threshold = CONSTANTS.MASTERY_THRESHOLD) => {
  if (currentL >= threshold) return 0;

  const params = getSkillParams(skillName);
  let simL = currentL;
  let attempts = 0;

  // Simulate all-correct answers
  while (simL < threshold && attempts < 500) {
    const transL = computeTransitionL(simL, skillName, true);
    simL = computePostTestL(transL, skillName);
    attempts++;
  }

  return attempts;
};

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

/**
 * Clamp a value between 0 and 1.
 */
const clamp = (value) => {
  return Math.max(0, Math.min(1, value));
};

/**
 * Round to 6 decimal places.
 */
const round6 = (value) => {
  return parseFloat(value.toFixed(6));
};

/**
 * Round to 2 decimal places.
 */
const round2 = (value) => {
  return parseFloat(value.toFixed(2));
};

/**
 * Fisher-Yates shuffle for randomizing question order.
 */
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// ==============================================
// BACKWARD COMPATIBILITY
// (Keep old function signature for existing code)
// ==============================================

/**
 * Legacy function: Update knowledge state (single step).
 * Maps to the new itemInteraction function.
 * 
 * @param {number} pKnown - Current P(Known)
 * @param {number} pLearn - P(Learn/Transit)
 * @param {number} pSlip - P(Slip)
 * @param {number} pGuess - P(Guess)
 * @param {boolean} isCorrect - Whether answer was correct
 * @returns {number} Updated P(Known)
 */
const updateKnowledgeState = (pKnown, pLearn, pSlip, pGuess, isCorrect) => {
  let transitionL;

  if (isCorrect) {
    const numerator = pKnown * (1 - pSlip);
    const denominator = pKnown * (1 - pSlip) + (1 - pKnown) * pGuess;
    transitionL = denominator > 0 ? numerator / denominator : pKnown;
  } else {
    const numerator = pKnown * pSlip;
    const denominator = pKnown * pSlip + (1 - pKnown) * (1 - pGuess);
    transitionL = denominator > 0 ? numerator / denominator : pKnown;
  }

  const postTestL = transitionL + (1 - transitionL) * pLearn;
  return round6(clamp(postTestL));
};

// ==============================================
// MODULE EXPORTS
// ==============================================
module.exports = {
  // Constants
  SKILL_BKT_PARAMS,
  CONSTANTS,
  SKILL_NAMES,

  // Core BKT Formulas
  getSkillParams,
  computeTransitionL,
  computePostTestL,
  itemInteraction,
  processAssessmentForSkill,

  // Initial Assessment
  computeWMInitial,
  computeRemainingL,
  processInitialAssessment,

  // Lesson Mastery
  computeWLesson,
  computeMLesson,
  computeWMLesson,
  computeTMLesson,
  processLessonAssessmentForSkill,
  computeLessonMastery,

  // Overall Mastery
  computeOverallMastery,
  computeOverallMasteryPercent,

  // Time-Based Rules
  applyReviewTimeRules,
  applyFinalTimeRules,

  // Diagnostic
  processDiagnostic,

  // Retake Logic
  needsLessonRetake,
  prepareRetakeQuestions,

  // Question Selection
  selectInitialAssessmentQuestions,
  selectDiagnosticQuestions,
  selectReviewQuestions,
  selectSimulationQuestions,
  selectFinalQuestions,

  // Proficiency Helpers
  getProficiencyLevel,
  isMastered,
  recommendNextSkill,
  estimateAttemptsToMastery,

  // Utilities
  shuffleArray,

  // Backward Compatibility
  updateKnowledgeState
};
