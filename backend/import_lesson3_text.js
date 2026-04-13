const path = require('path');

process.env.LESSON_ORDER = '3';
process.env.LESSON_DOCX_PATH = path.join(__dirname, '..', 'lessons', 'Lessons_3.docx');
process.env.ASSESSMENT_DOCX_PATH = path.join(__dirname, '..', 'lessons', 'Assessments_lesson_3.docx');
process.env.LESSON_IMPORT_LABEL = 'Lesson 3';
process.env.LESSON_USE_GENERIC_ANSWERS = '1';
process.env.LESSON_SNAPSHOT_FILE = 'lesson3_after_import_snapshot.json';

require('./import_lesson5_text');
