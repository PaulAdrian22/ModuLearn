// Push modified snapshot sections into the live module table.
// Usage:
//   node backend/push_lesson_sections.js 2
// Reads ../lessons/lesson<N>_after_import_snapshot.json and updates
// the matching module row's `sections` column.
const fs = require('fs');
const path = require('path');
const { query, closePool } = require('./config/database');

const lessonOrder = process.argv[2];
if (!lessonOrder || !/^\d+$/.test(lessonOrder)) {
  console.error('Usage: node backend/push_lesson_sections.js <lessonOrder>');
  process.exit(1);
}

const snapshotPath = path.join(__dirname, '..', 'lessons', `lesson${lessonOrder}_after_import_snapshot.json`);
if (!fs.existsSync(snapshotPath)) {
  console.error(`Snapshot not found: ${snapshotPath}`);
  process.exit(1);
}

const main = async () => {
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  const data = JSON.parse(raw);
  const mod = Array.isArray(data) ? data[0] : data;
  if (!mod || !Array.isArray(mod.sections)) {
    throw new Error('Snapshot missing sections array');
  }

  const rows = await query(
    'SELECT ModuleID, ModuleTitle FROM module WHERE LessonOrder = ? AND (Is_Deleted = 0 OR Is_Deleted IS NULL) ORDER BY ModuleID LIMIT 1',
    [Number(lessonOrder)]
  );
  if (rows.length === 0) {
    throw new Error(`No module found with LessonOrder=${lessonOrder}`);
  }
  const moduleId = rows[0].ModuleID;
  console.log(`Updating ModuleID=${moduleId} (${rows[0].ModuleTitle}) — ${mod.sections.length} sections`);

  await query('UPDATE module SET sections = ? WHERE ModuleID = ?', [JSON.stringify(mod.sections), moduleId]);
  console.log('OK');
};

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool && closePool());
