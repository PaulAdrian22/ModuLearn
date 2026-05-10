// One-shot cleanup: reset module.Is_Unlocked to a sane state.
// Lesson unlock is now derived per-user from a learner's progress
// (see moduleController.getAllModules + progressController.startModule).
// The shared module.Is_Unlocked column is no longer read at runtime, but
// past versions wrote TRUE to it whenever ANY learner finished a lesson,
// leaking unlock state across users. This script resets it so:
//   - Lesson 1 stays Is_Unlocked = TRUE (matches seed default)
//   - Every other lesson is Is_Unlocked = FALSE
// Idempotent: safe to run multiple times.

const { query, closePool } = require('../../config/database');

async function resetUnlockFlag() {
  console.log('Resetting module.Is_Unlocked to per-lesson defaults...');

  // Make sure lesson 1 is unlocked (default seeded behavior).
  const r1 = await query(
    'UPDATE module SET Is_Unlocked = TRUE WHERE LessonOrder = 1 AND Is_Unlocked != TRUE'
  );
  console.log(`  Lesson 1 rows updated: ${r1?.affectedRows ?? 0}`);

  // Lock everything else (the column is now ignored at runtime, but keeping
  // it tidy means a fresh re-seed or future tooling won't be misled).
  const rRest = await query(
    'UPDATE module SET Is_Unlocked = FALSE WHERE LessonOrder <> 1 AND Is_Unlocked = TRUE'
  );
  console.log(`  Lesson 2+ rows reset to locked: ${rRest?.affectedRows ?? 0}`);

  console.log('Done.');
}

(async () => {
  try {
    await resetUnlockFlag();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    try { await closePool(); } catch { /* ignore */ }
  }
})();
