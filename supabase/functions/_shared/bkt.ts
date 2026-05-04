// BKT engine — TypeScript port of backend/utils/bktEngine.js (math-only).
// Deno-compatible. Used by every BKT Edge Function.
//
// Variables:
//   Current L         per-skill mastery, P(L_{k,t})
//   Transition L      posterior after observing answer
//   Post-Test L       mastery after the learning step is applied
//   WMInitial         weighted mastery from initial assessment (10%)
//   MLesson           per-lesson mastery = max(review, simulation, final)
//   WMLesson          weighted lesson mastery (W_lesson * MLesson)
//   TMLesson          accumulated WMLesson across all lessons
//   OverallMastery    final per-skill mastery used for thresholding

export const CONSTANTS = {
  INITIAL_L: 0.01,
  // 0.85 matches the General Process diagram (Step 4: "Determine mastery by
  // ruling out if the OverallM >= 0.85"). Lesson-level threshold is also
  // 0.85. The thesis literature review cites Corbett & Anderson (1994) at
  // 0.95, but the operational design diagram explicitly specifies 0.85 and
  // is the source we follow for runtime behavior.
  MASTERY_THRESHOLD: 0.85,
  LESSON_MASTERY_THRESHOLD: 0.85,
  INITIAL_ASSESSMENT_WEIGHT: 0.1,
  LESSON_WEIGHT_TOTAL: 0.9,
  TOTAL_LESSONS: 7,
  TOTAL_SKILLS: 5,
  REVIEW_TIME_THRESHOLD: 30,
  REVIEW_COOLDOWN: 30,
  REVIEW_MAX_ATTEMPTS: 5,
  REVIEW_MIN_ATTEMPTS_FOR_EASY: 3,
  FINAL_SITUATIONAL_TIME_THRESHOLD: 120,
  FINAL_EASY_TIME_THRESHOLD: 60,
  FINAL_TOTAL_QUESTIONS: 30,                  // per diagram (was 45 in legacy)
  INITIAL_QUESTIONS_PER_LESSON: 5,            // 5 per lesson * 7 = 35 total
  INITIAL_TOTAL_QUESTIONS: 35,
  SIMULATION_TOTAL_STEPS: 35,
} as const;

export const SKILL_NAMES = [
  'Memorization',
  'Technical Comprehension',
  'Analytical Thinking',
  'Critical Thinking',
  'Problem Solving',
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export interface SkillParams {
  pInit: number;
  pGuess: number;
  pLearn: number;
  pSlip: number;
}

const SKILL_BKT_PARAMS: Record<string, SkillParams> = {
  'Memorization':            { pInit: 0.01, pGuess: 0.15, pLearn: 0.10, pSlip: 0.40 },
  'Technical Comprehension': { pInit: 0.01, pGuess: 0.15, pLearn: 0.10, pSlip: 0.40 },
  'Analytical Thinking':     { pInit: 0.01, pGuess: 0.14, pLearn: 0.11, pSlip: 0.43 },
  'Critical Thinking':       { pInit: 0.01, pGuess: 0.13, pLearn: 0.12, pSlip: 0.45 },
  'Problem Solving':         { pInit: 0.01, pGuess: 0.13, pLearn: 0.12, pSlip: 0.45 },
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function getSkillParams(skillName: string): SkillParams {
  return SKILL_BKT_PARAMS[skillName] ?? SKILL_BKT_PARAMS['Memorization'];
}

// Step 1: Transition L
export function computeTransitionL(currentL: number, skillName: string, isCorrect: boolean): number {
  const { pGuess: G, pSlip: S } = getSkillParams(skillName);
  let t: number;
  if (isCorrect) {
    const num = currentL * (1 - S);
    const den = currentL * (1 - S) + (1 - currentL) * G;
    t = den > 0 ? num / den : currentL;
  } else {
    const num = currentL * S;
    const den = currentL * S + (1 - currentL) * (1 - G);
    t = den > 0 ? num / den : currentL;
  }
  return clamp(t);
}

// Step 2: Post-Test L
export function computePostTestL(transitionL: number, skillName: string): number {
  const { pLearn: T } = getSkillParams(skillName);
  return clamp(transitionL + (1 - transitionL) * T);
}

export interface InteractionResult {
  baseL_before: number;
  transitionL: number;
  postTestL: number;
  currentL_after: number;
}

export function itemInteraction(currentL: number, skillName: string, isCorrect: boolean): InteractionResult {
  const transitionL = computeTransitionL(currentL, skillName, isCorrect);
  const postTestL = computePostTestL(transitionL, skillName);
  return {
    baseL_before: round6(currentL),
    transitionL: round6(transitionL),
    postTestL: round6(postTestL),
    currentL_after: round6(postTestL),
  };
}

// ============================================================
// Initial Assessment
// ============================================================
export const computeWMInitial = (initialL: number) =>
  round6(CONSTANTS.INITIAL_ASSESSMENT_WEIGHT * initialL);

export const computeRemainingL = (wmInitial: number) =>
  round6(1 - wmInitial);

// ============================================================
// Lesson mastery
// ============================================================
export const computeWLesson = () =>
  round6(CONSTANTS.LESSON_WEIGHT_TOTAL / CONSTANTS.TOTAL_LESSONS);

export const computeMLesson = (reviewL: number, finalL: number, simulationL: number) =>
  round6(Math.max(reviewL || 0, finalL || 0, simulationL || 0));

export const computeWMLesson = (mLesson: number, wLesson: number) =>
  round6(wLesson * mLesson);

export const computeTMLesson = (wmLessons: number[]) =>
  round6(wmLessons.reduce((s, v) => s + (v || 0), 0));

export interface LessonMastery {
  mLesson: number;
  wLesson: number;
  wmLesson: number;
  isPassed: boolean;
}

export function computeLessonMastery(reviewL: number, simulationL: number, finalL: number): LessonMastery {
  const mLesson = computeMLesson(reviewL, finalL, simulationL);
  const wLesson = computeWLesson();
  const wmLesson = computeWMLesson(mLesson, wLesson);
  return { mLesson, wLesson, wmLesson, isPassed: mLesson >= CONSTANTS.LESSON_MASTERY_THRESHOLD };
}

// ============================================================
// Overall mastery
// ============================================================
// Per Step 4 of the General Process diagram:
//     M_k^overall = M_k^IA + M_k^lessons   (i.e. WMInitial + TMLesson)
// The legacy JS engine ignored WMInitial; we restore the diagram's formula.
export function computeOverallMastery(wmInitial: number, tmLesson: number) {
  const overallMastery = round6((wmInitial || 0) + (tmLesson || 0));
  return {
    overallMastery,
    isMastered: overallMastery >= CONSTANTS.MASTERY_THRESHOLD,
  };
}

export function computeOverallMasteryPercent(totalMastered: number, totalQuestions: number): number {
  if (totalQuestions === 0) return 0;
  return round2((totalMastered / totalQuestions) * 100);
}

// ============================================================
// Time-based rules
// ============================================================
export interface ReviewTimeRule {
  finalVersionType: 'Easy' | 'Situational' | null;
  needsRedoDiscussion: boolean;
  cooldownSeconds: number;
}

export function applyReviewTimeRules(responseTime: number, attemptNumber: number, isCorrect: boolean): ReviewTimeRule {
  if (!isCorrect) {
    return { finalVersionType: null, needsRedoDiscussion: true, cooldownSeconds: CONSTANTS.REVIEW_COOLDOWN };
  }
  if (attemptNumber >= CONSTANTS.REVIEW_MIN_ATTEMPTS_FOR_EASY) {
    return { finalVersionType: 'Easy', needsRedoDiscussion: false, cooldownSeconds: 0 };
  }
  if (responseTime < CONSTANTS.REVIEW_TIME_THRESHOLD && attemptNumber > 1) {
    return { finalVersionType: 'Situational', needsRedoDiscussion: false, cooldownSeconds: 0 };
  }
  return { finalVersionType: 'Easy', needsRedoDiscussion: false, cooldownSeconds: 0 };
}

export interface FinalTimeRule {
  needToAnswerAgain: boolean;
}

export function applyFinalTimeRules(responseTime: number, questionType: 'Easy' | 'Situational', isCorrect: boolean): FinalTimeRule {
  if (questionType === 'Situational') {
    if (responseTime < CONSTANTS.FINAL_SITUATIONAL_TIME_THRESHOLD && isCorrect) {
      return { needToAnswerAgain: false };
    }
  } else if (questionType === 'Easy') {
    if (responseTime < CONSTANTS.FINAL_EASY_TIME_THRESHOLD && isCorrect) {
      return { needToAnswerAgain: false };
    }
  }
  return { needToAnswerAgain: true };
}

// ============================================================
// Proficiency
// ============================================================
export function getProficiencyLevel(pKnown: number): string {
  if (pKnown >= 0.95) return 'Mastered';
  if (pKnown >= 0.70) return 'Advanced';
  if (pKnown >= 0.50) return 'Intermediate';
  if (pKnown >= 0.30) return 'Beginner';
  return 'Novice';
}

// Normalize legacy assessment-type strings to the canonical set.
const ASSESSMENT_TYPE_MAP: Record<string, string> = {
  review: 'Review',
  quiz: 'Review',
  final: 'Final',
  'post-test': 'Final',
  posttest: 'Final',
  simulation: 'Simulation',
  diagnostic: 'Diagnostic',
  initial: 'Initial',
};
export function normalizeAssessmentType(input: string | null | undefined): string {
  return ASSESSMENT_TYPE_MAP[String(input ?? '').trim().toLowerCase()] ?? 'Review';
}
