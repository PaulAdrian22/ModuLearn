// Canonical names for skills, assessment types, and question types.
//
// IMPORTANT: these values MUST match
//   * supabase/functions/_shared/bkt.ts        (Deno Edge Function path)
//   * python_services/bkt_engine.py            (Modal pyBKT path)
//   * supabase/migrations/*.sql CHECK constraints
//
// Pick a value from here in JSX/JS — never a literal string. The
// 'Problem-Solving' vs 'Problem Solving' silent-join bug we hit earlier
// came from a literal that drifted from the schema.

export const SKILLS = Object.freeze({
  MEMORIZATION:            'Memorization',
  TECHNICAL_COMPREHENSION: 'Technical Comprehension',
  ANALYTICAL_THINKING:     'Analytical Thinking',
  CRITICAL_THINKING:       'Critical Thinking',
  PROBLEM_SOLVING:         'Problem Solving',
});

export const SKILL_LIST = Object.freeze([
  SKILLS.MEMORIZATION,
  SKILLS.TECHNICAL_COMPREHENSION,
  SKILLS.ANALYTICAL_THINKING,
  SKILLS.CRITICAL_THINKING,
  SKILLS.PROBLEM_SOLVING,
]);

export const isValidSkill = (value) => SKILL_LIST.includes(value);

// ============================================================
// Assessment types — match assessments.type CHECK and the BKT engines.
// ============================================================
export const ASSESSMENT_TYPES = Object.freeze({
  INITIAL:    'Initial',
  DIAGNOSTIC: 'Diagnostic',
  REVIEW:     'Review',
  SIMULATION: 'Simulation',
  FINAL:      'Final',
});

export const ASSESSMENT_TYPE_LIST = Object.freeze(Object.values(ASSESSMENT_TYPES));

// ============================================================
// Question types
// ============================================================
export const QUESTION_TYPES = Object.freeze({
  EASY:        'Easy',
  SITUATIONAL: 'Situational',
});

// ============================================================
// Languages
// ============================================================
export const LANGUAGES = Object.freeze({
  ENGLISH: 'English',
  TAGLISH: 'Taglish',
});

// ============================================================
// Mastery thresholds — single source of truth on the frontend; engine
// values live in bkt.ts and bkt_engine.py and must stay in sync.
// 0.85 matches the General Process diagram's Step 4 rule.
// ============================================================
export const MASTERY_THRESHOLDS = Object.freeze({
  OVERALL:    0.85,
  LESSON:     0.85,
  // Proficiency level cutoffs — enrichment for UI display only.
  MASTERED:     0.95,
  ADVANCED:     0.70,
  INTERMEDIATE: 0.50,
  BEGINNER:     0.30,
});

export function proficiencyLabel(value) {
  const v = Number(value) || 0;
  if (v >= MASTERY_THRESHOLDS.MASTERED)     return 'Mastered';
  if (v >= MASTERY_THRESHOLDS.ADVANCED)     return 'Advanced';
  if (v >= MASTERY_THRESHOLDS.INTERMEDIATE) return 'Intermediate';
  if (v >= MASTERY_THRESHOLDS.BEGINNER)     return 'Beginner';
  return 'Novice';
}
