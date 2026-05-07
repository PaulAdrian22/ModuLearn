const path = require('path');
const BACKEND_DIR = path.resolve(__dirname, '..', '..');

process.env.LESSON_ORDER = '1';
process.env.LESSON_DOCX_PATH = path.join(BACKEND_DIR, '..', 'lessons', 'Lessons_1.docx');
process.env.ASSESSMENT_DOCX_PATH = path.join(BACKEND_DIR, '..', 'lessons', 'Assessments_lesson_1.docx');
process.env.LESSON_IMPORT_LABEL = 'Lesson 1';
process.env.LESSON_USE_GENERIC_ANSWERS = '1';
process.env.LESSON_SNAPSHOT_FILE = 'lesson1_after_import_snapshot.json';

require('./import_lesson5_text');
