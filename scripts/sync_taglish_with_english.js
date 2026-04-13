const fs = require('fs');
const path = require('path');

const lessonsDir = path.join(process.cwd(), 'lessons');
const dryRun = process.argv.includes('--dry-run');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function copyIfText(target, source, field) {
  if (source && hasText(source[field])) {
    target[field] = source[field];
  }
}

function byTypeQueue(sections) {
  const map = new Map();
  for (const section of sections || []) {
    const type = String(section?.type || '');
    if (!map.has(type)) {
      map.set(type, []);
    }
    map.get(type).push(section);
  }
  return map;
}

function shiftType(map, type) {
  const list = map.get(type) || [];
  if (list.length === 0) {
    return null;
  }
  return list.shift();
}

function mergeLocalizedQuestions(englishQuestions, taglishQuestions) {
  const enList = Array.isArray(englishQuestions) ? englishQuestions : [];
  const tlList = Array.isArray(taglishQuestions) ? taglishQuestions : [];

  return enList.map((enQuestion, index) => {
    const next = clone(enQuestion);
    const taglish = tlList[index];

    if (taglish) {
      if (taglish.id !== undefined && taglish.id !== null) {
        next.id = taglish.id;
      }

      if (hasText(taglish.question)) {
        next.question = taglish.question;
      }

      if (Array.isArray(taglish.options) && taglish.options.length > 0) {
        next.options = clone(taglish.options);
      }
    }

    // Keep assessment mechanics aligned to English; only language text should vary.
    next.skill = enQuestion.skill;
    next.questionType = enQuestion.questionType;
    next.correctAnswer = enQuestion.correctAnswer;

    return next;
  });
}

function syncLessonFile(lessonNumber) {
  const filePath = path.join(lessonsDir, `lesson${lessonNumber}_after_import_snapshot.json`);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const english = json.find((entry) => String(entry?.LessonLanguage || '').toLowerCase() === 'english');
  const taglishIndex = json.findIndex((entry) => String(entry?.LessonLanguage || '').toLowerCase() === 'taglish');

  if (!english || taglishIndex === -1) {
    return {
      filePath,
      changed: false,
      warning: `Missing English or Taglish entry in lesson ${lessonNumber}`,
      summary: null
    };
  }

  const taglish = json[taglishIndex];
  const nextTaglish = clone(english);

  if (taglish.ModuleID !== undefined && taglish.ModuleID !== null) {
    nextTaglish.ModuleID = taglish.ModuleID;
  }
  nextTaglish.LessonLanguage = 'Taglish';
  copyIfText(nextTaglish, taglish, 'ModuleTitle');
  copyIfText(nextTaglish, taglish, 'Description');

  const queues = byTypeQueue(taglish.sections);
  let globalReviewIndex = 0;

  nextTaglish.sections = (english.sections || []).map((englishSection) => {
    const mergedSection = clone(englishSection);
    const taglishSection = shiftType(queues, englishSection.type);

    if (taglishSection && taglishSection.id !== undefined && taglishSection.id !== null) {
      mergedSection.id = taglishSection.id;
    }

    copyIfText(mergedSection, taglishSection, 'title');
    copyIfText(mergedSection, taglishSection, 'caption');
    copyIfText(mergedSection, taglishSection, 'content');

    if (englishSection.type === 'references') {
      copyIfText(mergedSection, taglishSection, 'content');
    }

    if (englishSection.type === 'review-multiple-choice') {
      const englishQuestions = Array.isArray(englishSection.questions) ? englishSection.questions : [];
      const taglishSectionQuestions = Array.isArray(taglishSection?.questions)
        ? taglishSection.questions
        : (taglish.reviewQuestions || []).slice(globalReviewIndex, globalReviewIndex + englishQuestions.length);

      mergedSection.questions = mergeLocalizedQuestions(englishQuestions, taglishSectionQuestions);
      globalReviewIndex += englishQuestions.length;
    }

    return mergedSection;
  });

  nextTaglish.reviewQuestions = mergeLocalizedQuestions(english.reviewQuestions, taglish.reviewQuestions);
  nextTaglish.diagnosticQuestions = mergeLocalizedQuestions(english.diagnosticQuestions, taglish.diagnosticQuestions);
  nextTaglish.finalQuestions = mergeLocalizedQuestions(english.finalQuestions, taglish.finalQuestions);

  const before = JSON.stringify(taglish);
  const after = JSON.stringify(nextTaglish);
  const changed = before !== after;

  if (!dryRun && changed) {
    json[taglishIndex] = nextTaglish;
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  }

  const leftovers = {};
  for (const [type, list] of queues.entries()) {
    if (list.length > 0) {
      leftovers[type] = list.length;
    }
  }

  return {
    filePath,
    changed,
    warning: null,
    summary: {
      lessonNumber,
      sectionCount: (nextTaglish.sections || []).length,
      reviewCount: (nextTaglish.reviewQuestions || []).length,
      diagnosticCount: (nextTaglish.diagnosticQuestions || []).length,
      finalCount: (nextTaglish.finalQuestions || []).length,
      leftoverTaglishSectionsByType: leftovers
    }
  };
}

function run() {
  const results = [];
  let changedFiles = 0;

  for (let lesson = 1; lesson <= 6; lesson += 1) {
    const result = syncLessonFile(lesson);
    results.push(result);
    if (result.changed) {
      changedFiles += 1;
    }
  }

  console.log(dryRun ? '[DRY RUN] No files written.' : '[UPDATED] Taglish lesson files written.');
  console.log(`Lessons processed: ${results.length}`);
  console.log(`Files changed: ${changedFiles}`);

  for (const result of results) {
    if (result.warning) {
      console.log(`[WARN] ${result.warning}`);
      continue;
    }

    const s = result.summary;
    console.log(
      `L${s.lessonNumber} changed=${result.changed} sections=${s.sectionCount} ` +
        `review=${s.reviewCount} diagnostic=${s.diagnosticCount} final=${s.finalCount} ` +
        `leftovers=${JSON.stringify(s.leftoverTaglishSectionsByType)}`
    );
  }
}

run();
