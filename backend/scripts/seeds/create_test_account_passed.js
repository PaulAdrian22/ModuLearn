// Creates a test student account that has passed all lessons, assessments, and simulations.
// Run from the backend/ directory:
//   node scripts/seeds/create_test_account_passed.js
//
// Credentials:  username: testpassed   password: Passed1234!

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { query, closePool } = require('../../config/database');

// ─── Config ──────────────────────────────────────────────────────────────────
const USERNAME   = 'testpassed';
const PASSWORD   = 'Passed1234!';
const NAME       = 'Test Passed';
const AGE        = 22;
const BACKGROUND = 'Senior High School';
const GENDER     = 'Male';

// ─── BKT constants ───────────────────────────────────────────────────────────
const SKILLS = [
  'Memorization',
  'Technical Comprehension',
  'Analytical Thinking',
  'Critical Thinking',
  'Problem Solving',
];

const SKILL_PARAMS = {
  'Memorization':            { pGuess: 0.15, pLearn: 0.10, pSlip: 0.40 },
  'Technical Comprehension': { pGuess: 0.15, pLearn: 0.10, pSlip: 0.40 },
  'Analytical Thinking':     { pGuess: 0.14, pLearn: 0.11, pSlip: 0.43 },
  'Critical Thinking':       { pGuess: 0.13, pLearn: 0.12, pSlip: 0.45 },
  'Problem Solving':         { pGuess: 0.13, pLearn: 0.12, pSlip: 0.45 },
};

const HIGH_L          = 0.950000;
const TOTAL_LESSONS   = 7;
const WM_INITIAL      = 0.1 * HIGH_L;                    // 0.095000
const WM_LESSON       = (0.9 / TOTAL_LESSONS) * HIGH_L;  // ≈ 0.122143
const TM_LESSON       = 0.9 * HIGH_L;                    // 0.855000 (sum of all 7)
const OVERALL_MASTERY = WM_INITIAL + TM_LESSON;           // 0.950000

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => n.toFixed(6);
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function ensureProgressColumns() {
  // Ensure ActiveSeconds column exists (added lazily by progressController)
  const cols = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'progress'
        AND COLUMN_NAME = 'ActiveSeconds'`
  );
  if (!cols.length) {
    await query(`ALTER TABLE progress ADD COLUMN ActiveSeconds INT NOT NULL DEFAULT 0 AFTER CompletionRate`);
    console.log('  Added ActiveSeconds column to progress table.');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    console.log('=== Creating test account: testpassed ===\n');

    await ensureProgressColumns();

    // ── 1. User ──────────────────────────────────────────────────────────────
    const existing = await query('SELECT UserID FROM user WHERE Username = ? LIMIT 1', [USERNAME]);
    if (existing.length) {
      console.log(`User "${USERNAME}" already exists (UserID ${existing[0].UserID}). Delete it first to re-seed.`);
      await closePool();
      return;
    }

    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
    const hashed = await bcrypt.hash(PASSWORD, bcryptRounds);

    await query(
      `INSERT INTO user (Name, Username, Password, Age, EducationalBackground, Gender, Role, last_login, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'student', NOW(), NOW())`,
      [NAME, USERNAME, hashed, AGE, BACKGROUND, GENDER]
    );

    const [{ UserID }] = await query('SELECT UserID FROM user WHERE Username = ? LIMIT 1', [USERNAME]);
    console.log(`✓ Created user "${USERNAME}" (UserID ${UserID})`);

    // ── 2. Get non-supplementary modules (ordered by LessonOrder) ─────────────
    const modules = await query(
      `SELECT ModuleID, ModuleTitle, LessonOrder
         FROM module
        WHERE (Difficulty IS NULL OR LOWER(Difficulty) != 'supplementary')
          AND Is_Deleted = FALSE
        ORDER BY LessonOrder ASC`
    );

    if (!modules.length) {
      console.error('No non-supplementary modules found. Import lessons first.');
      await closePool();
      return;
    }

    console.log(`\nFound ${modules.length} non-supplementary module(s):`);
    modules.forEach((m) => console.log(`  Lesson ${m.LessonOrder}: ${m.ModuleTitle} (ModuleID ${m.ModuleID})`));

    // ── 3. Initial assessment ─────────────────────────────────────────────────
    console.log('\n── Initial Assessment ──');
    await query(
      `INSERT INTO assessment (UserID, AssessmentType, DateTaken, TotalScore, ResultStatus, ModuleID, RetakeCount, TimeSpentSeconds)
       VALUES (?, 'Initial', NOW(), 100.00, 'Pass', NULL, 0, 1260)`,
      [UserID]
    );
    const [{ AssessmentID: initialAssessmentID }] = await query(
      `SELECT AssessmentID FROM assessment WHERE UserID = ? AND AssessmentType = 'Initial' ORDER BY AssessmentID DESC LIMIT 1`,
      [UserID]
    );

    await query(
      `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, QuestionsAnswered, TotalQuestions, StartedAt, CompletedAt)
       VALUES (?, ?, 'Initial', NULL, 'Completed', 35, 35, NOW(), NOW())`,
      [UserID, initialAssessmentID]
    );

    // bkt_model — one row per skill
    for (const skill of SKILLS) {
      const p = SKILL_PARAMS[skill];
      await query(
        `INSERT INTO bkt_model (UserID, SkillName, PKnown, PLearn, PSlip, PGuess, BaseL, CurrentL, PostTestL)
         VALUES (?, ?, ?, ?, ?, ?, 0.010000, ?, ?)
         ON DUPLICATE KEY UPDATE
           PKnown=VALUES(PKnown), CurrentL=VALUES(CurrentL), PostTestL=VALUES(PostTestL), updated_at=NOW()`,
        [UserID, skill, fmt(HIGH_L), fmt(p.pLearn), fmt(p.pSlip), fmt(p.pGuess), fmt(HIGH_L), fmt(HIGH_L)]
      );
    }
    console.log('  ✓ Initial assessment record + bkt_model');

    // bkt_overall_mastery — initial snapshot (will be updated after lessons)
    for (const skill of SKILLS) {
      await query(
        `INSERT INTO bkt_overall_mastery
           (UserID, SkillName, InitialL, WMInitial, RemainingL, TMLesson, OverallMastery, IsMastered)
         VALUES (?, ?, ?, ?, ?, 0.000000, ?, FALSE)
         ON DUPLICATE KEY UPDATE
           InitialL=VALUES(InitialL), WMInitial=VALUES(WMInitial), RemainingL=VALUES(RemainingL), updated_at=NOW()`,
        [UserID, skill, fmt(HIGH_L), fmt(WM_INITIAL), fmt(1.0 - WM_INITIAL), fmt(WM_INITIAL)]
      );
    }

    // ── 4. Per-lesson data ────────────────────────────────────────────────────
    const completedLessons = Math.min(modules.length, TOTAL_LESSONS);
    const actualWMLesson   = (0.9 / TOTAL_LESSONS) * HIGH_L;

    for (let i = 0; i < completedLessons; i++) {
      const { ModuleID, ModuleTitle, LessonOrder } = modules[i];
      console.log(`\n── Lesson ${LessonOrder}: ${ModuleTitle} (ModuleID ${ModuleID}) ──`);

      // Progress
      await query(
        `INSERT INTO progress (UserID, ModuleID, CompletionRate, ActiveSeconds, DateStarted, DateCompletion)
         VALUES (?, ?, 100.00, 3600, NOW(), NOW())
         ON DUPLICATE KEY UPDATE CompletionRate=100.00, ActiveSeconds=3600, DateCompletion=NOW()`,
        [UserID, ModuleID]
      );
      console.log('  ✓ progress (100%)');

      // Diagnostic assessment
      await query(
        `INSERT INTO assessment (UserID, AssessmentType, DateTaken, TotalScore, ResultStatus, ModuleID, RetakeCount, TimeSpentSeconds)
         VALUES (?, 'Diagnostic', NOW(), 100.00, 'Pass', ?, 0, 180)`,
        [UserID, ModuleID]
      );
      const [{ AssessmentID: diagID }] = await query(
        `SELECT AssessmentID FROM assessment
          WHERE UserID=? AND AssessmentType='Diagnostic' AND ModuleID=?
          ORDER BY AssessmentID DESC LIMIT 1`,
        [UserID, ModuleID]
      );
      await query(
        `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, QuestionsAnswered, TotalQuestions, StartedAt, CompletedAt)
         VALUES (?, ?, 'Diagnostic', ?, 'Completed', 5, 5, NOW(), NOW())`,
        [UserID, diagID, ModuleID]
      );

      // Review assessment
      await query(
        `INSERT INTO assessment (UserID, AssessmentType, DateTaken, TotalScore, ResultStatus, ModuleID, RetakeCount, TimeSpentSeconds)
         VALUES (?, 'Review', NOW(), 100.00, 'Pass', ?, 0, 600)`,
        [UserID, ModuleID]
      );
      const [{ AssessmentID: reviewID }] = await query(
        `SELECT AssessmentID FROM assessment
          WHERE UserID=? AND AssessmentType='Review' AND ModuleID=?
          ORDER BY AssessmentID DESC LIMIT 1`,
        [UserID, ModuleID]
      );
      await query(
        `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, QuestionsAnswered, TotalQuestions, StartedAt, CompletedAt)
         VALUES (?, ?, 'Review', ?, 'Completed', 10, 10, NOW(), NOW())`,
        [UserID, reviewID, ModuleID]
      );

      for (const skill of SKILLS) {
        await query(
          `INSERT INTO bkt_assessment_mastery (UserID, ModuleID, SkillName, AssessmentType, MasteryValue, QuestionsAnswered, QuestionsCorrect)
           VALUES (?, ?, ?, 'Review', ?, 10, 10)
           ON DUPLICATE KEY UPDATE MasteryValue=VALUES(MasteryValue), QuestionsAnswered=10, QuestionsCorrect=10, updated_at=NOW()`,
          [UserID, ModuleID, skill, fmt(HIGH_L)]
        );
      }

      // Final assessment
      await query(
        `INSERT INTO assessment (UserID, AssessmentType, DateTaken, TotalScore, ResultStatus, ModuleID, RetakeCount, TimeSpentSeconds)
         VALUES (?, 'Final', NOW(), 100.00, 'Pass', ?, 0, 1200)`,
        [UserID, ModuleID]
      );
      const [{ AssessmentID: finalID }] = await query(
        `SELECT AssessmentID FROM assessment
          WHERE UserID=? AND AssessmentType='Final' AND ModuleID=?
          ORDER BY AssessmentID DESC LIMIT 1`,
        [UserID, ModuleID]
      );
      await query(
        `INSERT INTO bkt_session (UserID, AssessmentID, AssessmentType, ModuleID, Status, QuestionsAnswered, TotalQuestions, StartedAt, CompletedAt)
         VALUES (?, ?, 'Final', ?, 'Completed', 45, 45, NOW(), NOW())`,
        [UserID, finalID, ModuleID]
      );

      for (const skill of SKILLS) {
        await query(
          `INSERT INTO bkt_assessment_mastery (UserID, ModuleID, SkillName, AssessmentType, MasteryValue, QuestionsAnswered, QuestionsCorrect)
           VALUES (?, ?, ?, 'Final', ?, 45, 45)
           ON DUPLICATE KEY UPDATE MasteryValue=VALUES(MasteryValue), QuestionsAnswered=45, QuestionsCorrect=45, updated_at=NOW()`,
          [UserID, ModuleID, skill, fmt(HIGH_L)]
        );
      }

      // bkt_lesson_mastery
      for (const skill of SKILLS) {
        await query(
          `INSERT INTO bkt_lesson_mastery
             (UserID, ModuleID, SkillName, ReviewL, SimulationL, FinalL, MLesson, WLesson, WMLesson, RetakeCount, IsPassed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, TRUE)
           ON DUPLICATE KEY UPDATE
             ReviewL=VALUES(ReviewL), SimulationL=VALUES(SimulationL), FinalL=VALUES(FinalL),
             MLesson=VALUES(MLesson), WLesson=VALUES(WLesson), WMLesson=VALUES(WMLesson),
             IsPassed=TRUE, updated_at=NOW()`,
          [UserID, ModuleID, skill,
           fmt(HIGH_L), fmt(HIGH_L), fmt(HIGH_L),
           fmt(HIGH_L),
           fmt(0.9 / TOTAL_LESSONS),
           fmt(actualWMLesson)]
        );
      }

      console.log('  ✓ Diagnostic, Review, Final assessments + BKT lesson mastery');
    }

    // ── 5. Update bkt_overall_mastery with final TMLesson ─────────────────────
    console.log('\n── Overall Mastery ──');
    const tmLesson = completedLessons * actualWMLesson;
    const overallMastery = WM_INITIAL + tmLesson;

    for (const skill of SKILLS) {
      await query(
        `UPDATE bkt_overall_mastery
            SET TMLesson=?, OverallMastery=?, IsMastered=TRUE, updated_at=NOW()
          WHERE UserID=? AND SkillName=?`,
        [fmt(tmLesson), fmt(overallMastery), UserID, skill]
      );
    }
    console.log(`  ✓ OverallMastery = ${overallMastery.toFixed(4)} (IsMastered = TRUE)`);

    // ── 6. Simulation progress ────────────────────────────────────────────────
    console.log('\n── Simulations ──');
    const coreSimulations = await query(
      `SELECT SimulationID, SimulationTitle, SimulationOrder
         FROM simulation
        WHERE SimulationOrder BETWEEN 1 AND 20
        ORDER BY SimulationOrder ASC`
    );

    if (coreSimulations.length) {
      for (const sim of coreSimulations) {
        await query(
          `INSERT INTO simulation_progress
             (UserID, SimulationID, Score, Attempts, TimeSpent, CompletionStatus, DateStarted, DateCompleted)
           VALUES (?, ?, 100.00, 1, 300, 'Completed', NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             Score=100.00, Attempts=1, CompletionStatus='Completed', DateCompleted=NOW()`,
          [UserID, sim.SimulationID]
        );
      }
      console.log(`  ✓ ${coreSimulations.length} core simulation(s) marked Completed`);
    } else {
      console.log('  (no core simulations found — skipped)');
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log('\n=== Done ===');
    console.log(`  Username : ${USERNAME}`);
    console.log(`  Password : ${PASSWORD}`);
    console.log(`  UserID   : ${UserID}`);
    console.log(`  Lessons  : ${completedLessons} of ${modules.length} lesson(s) fully seeded`);
    console.log(`  Mastery  : ${(overallMastery * 100).toFixed(1)}% overall`);

  } catch (err) {
    console.error('\nSeed failed:', err.message);
    console.error(err.stack);
  } finally {
    await closePool();
  }
}

main();
