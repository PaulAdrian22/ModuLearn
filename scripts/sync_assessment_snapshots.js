const fs = require('fs');
const path = require('path');

const lessonsDir = path.join(process.cwd(), 'lessons');
const sourcePath = path.join(lessonsDir, 'Assessments_question.txt');
const dryRun = process.argv.includes('--dry-run');

function normalizeSkill(raw) {
  const text = String(raw || '').toLowerCase();

  if (
    text.includes('critical thinking') ||
    text.includes('kritikal') ||
    text.includes('kritikal na pag-iisip')
  ) {
    return 'Critical Thinking';
  }

  if (
    text.includes('analytical thinking') ||
    text.includes('analitikal') ||
    text.includes('analitikal na pag-iisip')
  ) {
    return 'Analytical Thinking';
  }

  if (
    text.includes('technical comprehension') ||
    text.includes('teknikal') ||
    text.includes('teknikal na pag-unawa')
  ) {
    return 'Technical Comprehension';
  }

  if (
    text.includes('problem solving') ||
    text.includes('paglutas') ||
    text.includes('paglutas ng problema')
  ) {
    return 'Problem Solving';
  }

  if (
    text.includes('memorization') ||
    text.includes('memorize') ||
    text.includes('pag-memorize') ||
    text.includes('pagsasaulo')
  ) {
    return 'Memorization';
  }

  return String(raw || '').trim();
}

function parseSkillVariants(rawSkillLine) {
  const raw = String(rawSkillLine || '').trim();

  if (!raw) {
    return {
      easySkill: '',
      situationalSkill: ''
    };
  }

  let easySkill = '';
  let situationalSkill = '';

  const parts = raw.split('/').map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const normalized = normalizeSkill(part);

    if (!easySkill && /\b(easy|madali)\b/i.test(part)) {
      easySkill = normalized;
    }

    if (!situationalSkill && /\b(situational|sitwasyonal|situwasyonal)\b/i.test(part)) {
      situationalSkill = normalized;
    }
  }

  const fallback = normalizeSkill(raw);
  if (!easySkill) easySkill = fallback;
  if (!situationalSkill) situationalSkill = fallback;

  return { easySkill, situationalSkill };
}

function stripQuestionPrefix(text) {
  return String(text || '').replace(/^(Question|Tanong)\s*:\s*/i, '').trim();
}

function cleanQuestion(text) {
  return stripQuestionPrefix(String(text || '')).replace(/\s+/g, ' ').trim();
}

function applyExistingPrefix(existingQuestion, sourceQuestion) {
  const existing = String(existingQuestion || '').trim();
  const cleanedSource = cleanQuestion(sourceQuestion);

  if (/^Question\s*:/i.test(existing)) {
    return `Question: ${cleanedSource}`;
  }

  if (/^Tanong\s*:/i.test(existing)) {
    return `Tanong: ${cleanedSource}`;
  }

  return cleanedSource;
}

function normalizeQuestionForMatch(text) {
  return stripQuestionPrefix(String(text || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlockStart(line) {
  const lessonMatch = line.match(/^Lesson\s+([1-7])\s*$/i);
  if (lessonMatch) {
    return { lessonNumber: Number(lessonMatch[1]), language: 'English' };
  }

  const aralinMatch = line.match(/^Aralin\s+([1-7])\s*:/i);
  if (aralinMatch) {
    return { lessonNumber: Number(aralinMatch[1]), language: 'Taglish' };
  }

  return null;
}

function parseAssessmentBlock(blockLines, meta) {
  const result = {
    lessonNumber: meta.lessonNumber,
    language: meta.language,
    reviewItems: [],
    finalItems: []
  };

  let currentMode = null;
  let currentItem = null;
  let questionMode = null;
  const expectedCounts = {
    review: null,
    final: null
  };

  const pushCurrentItem = () => {
    if (!currentItem || !currentMode) {
      currentItem = null;
      return;
    }

    const fallbackSkill = normalizeSkill(currentItem.rawSkill || '');
    const entry = {
      number: currentItem.number,
      easySkill: currentItem.easySkill || fallbackSkill,
      situationalSkill: currentItem.situationalSkill || fallbackSkill,
      easyQuestion: cleanQuestion(currentItem.easyQuestion || ''),
      situationalQuestion: cleanQuestion(currentItem.situationalQuestion || '')
    };

    if (currentMode === 'review') {
      const reviewLimit = Number.isInteger(expectedCounts.review) ? expectedCounts.review : null;
      if (reviewLimit === null || result.reviewItems.length < reviewLimit) {
        result.reviewItems.push(entry);
      }
    } else if (currentMode === 'final') {
      const finalLimit = Number.isInteger(expectedCounts.final) ? expectedCounts.final : null;
      if (finalLimit === null || result.finalItems.length < finalLimit) {
        result.finalItems.push(entry);
      }
    }

    currentItem = null;
    questionMode = null;
  };

  for (const rawLine of blockLines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;

    if (/^(Review Assessments|Mga Pagtatasa sa Pagsusuri)\b/i.test(line)) {
      pushCurrentItem();
      currentMode = 'review';

      const countMatch = line.match(/\((\d+)\s*(?:items?|aytem(?:s)?)\)/i);
      if (countMatch) {
        expectedCounts.review = Number(countMatch[1]);
      }
      continue;
    }

    if (/^(Final Assessment|Pangwakas na Pagtatasa)\b/i.test(line)) {
      pushCurrentItem();
      currentMode = 'final';

      const countMatch = line.match(/\((\d+)\s*(?:items?|aytem(?:s)?)\)/i);
      if (countMatch) {
        expectedCounts.final = Number(countMatch[1]);
      }
      continue;
    }

    const itemMatch = line.match(/^(?:Item|Bilang|Aytem)\s*#?\s*:?\s*(\d+)\s*:?\s*$/i);
    if (itemMatch) {
      pushCurrentItem();

      const itemNumber = Number(itemMatch[1]);
      if (currentMode === 'review' && itemNumber === 1 && result.reviewItems.length > 0 && result.finalItems.length === 0) {
        // Fallback for blocks where final header may be omitted.
        currentMode = 'final';
      }

      currentItem = {
        number: itemNumber,
        rawSkill: '',
        easySkill: '',
        situationalSkill: '',
        easyQuestion: '',
        situationalQuestion: ''
      };
      questionMode = null;
      continue;
    }

    if (!currentItem) continue;

    const skillMatch = line.match(/^(?:Skill(?:\s*\(only\s*1\))?|Kasanayan(?:\s*\(1\s*lamang\))?)\s*:\s*(.+)$/i);
    if (skillMatch) {
      currentItem.rawSkill = skillMatch[1].trim();
      const parsedSkills = parseSkillVariants(currentItem.rawSkill);
      currentItem.easySkill = parsedSkills.easySkill;
      currentItem.situationalSkill = parsedSkills.situationalSkill;
      continue;
    }

    if (/^(?:EASY|MADALI(?:\s*\(EASY\))?)\b/i.test(line)) {
      questionMode = 'easy';
      const inlineEasy = line.match(/^(?:EASY|MADALI(?:\s*\(EASY\))?)\s*(?:Question|Tanong)\s*:\s*(.+)$/i);
      if (inlineEasy && !currentItem.easyQuestion) {
        currentItem.easyQuestion = inlineEasy[1];
      }
      continue;
    }

    if (/^(?:SITUATIONAL|SITUWASYONAL|SITWASYONAL)\b/i.test(line)) {
      questionMode = 'situational';
      const inlineSituational = line.match(/^(?:SITUATIONAL|SITUWASYONAL|SITWASYONAL)\s*(?:Question|Tanong)\s*:\s*(.+)$/i);
      if (inlineSituational && !currentItem.situationalQuestion) {
        currentItem.situationalQuestion = inlineSituational[1];
      }
      continue;
    }

    const questionMatch = line.match(/^(?:Question|Tanong)\s*:\s*(.+)$/i);
    if (questionMatch) {
      if (questionMode === 'easy' && !currentItem.easyQuestion) {
        currentItem.easyQuestion = questionMatch[1];
      } else if (questionMode === 'situational' && !currentItem.situationalQuestion) {
        currentItem.situationalQuestion = questionMatch[1];
      } else if (!currentItem.easyQuestion) {
        currentItem.easyQuestion = questionMatch[1];
      } else if (!currentItem.situationalQuestion) {
        currentItem.situationalQuestion = questionMatch[1];
      }
    }
  }

  pushCurrentItem();

  result.reviewItems.sort((a, b) => a.number - b.number);
  result.finalItems.sort((a, b) => a.number - b.number);

  return result;
}

function parseSourceAssessments(sourceText) {
  const normalizedText = String(sourceText || '').replace(/\r\n/g, '\n');
  let lines = normalizedText.split('\n');

  const simulationStart = lines.findIndex((line) => /^\s*Simulation Activities\s*$/i.test(String(line || '').trim()));
  if (simulationStart !== -1) {
    lines = lines.slice(0, simulationStart);
  }

  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    const blockMeta = isBlockStart(String(lines[i] || '').trim());
    if (blockMeta) {
      starts.push({ ...blockMeta, startIndex: i });
    }
  }

  const parsedBlocks = new Map();

  for (let i = 0; i < starts.length; i += 1) {
    const current = starts[i];
    const next = starts[i + 1];
    const endIndex = next ? next.startIndex : lines.length;
    const blockLines = lines.slice(current.startIndex, endIndex);
    const parsed = parseAssessmentBlock(blockLines, current);

    const key = `${parsed.lessonNumber}-${parsed.language.toLowerCase()}`;
    parsedBlocks.set(key, parsed);
  }

  return parsedBlocks;
}

function updateSnapshotEntry(entry, parsedBlock) {
  let changes = 0;

  const reviewItems = parsedBlock.reviewItems;
  const finalItems = parsedBlock.finalItems;

  if (Array.isArray(entry.reviewQuestions)) {
    for (let i = 0; i < entry.reviewQuestions.length; i += 1) {
      const reviewQuestion = entry.reviewQuestions[i];
      const sourceItem = reviewItems[i];
      if (!reviewQuestion || !sourceItem) continue;

      if (reviewQuestion.skill !== sourceItem.easySkill) {
        reviewQuestion.skill = sourceItem.easySkill;
        changes += 1;
      }
    }
  }

  if (Array.isArray(entry.sections)) {
    let reviewIndex = 0;
    for (const section of entry.sections) {
      if (!section || section.type !== 'review-multiple-choice' || !Array.isArray(section.questions)) {
        continue;
      }

      for (const question of section.questions) {
        const sourceItem = reviewItems[reviewIndex];
        reviewIndex += 1;

        if (!question || !sourceItem) continue;
        if (question.skill !== sourceItem.easySkill) {
          question.skill = sourceItem.easySkill;
          changes += 1;
        }
      }
    }
  }

  if (Array.isArray(entry.finalQuestions)) {
    const situationalIndices = [];
    const easyIndices = [];

    for (let i = 0; i < entry.finalQuestions.length; i += 1) {
      const question = entry.finalQuestions[i];
      if (!question) continue;

      if (String(question.questionType).toLowerCase() === 'situational') {
        situationalIndices.push(i);
      } else if (String(question.questionType).toLowerCase() === 'easy') {
        easyIndices.push(i);
      }
    }

    for (let i = 0; i < situationalIndices.length; i += 1) {
      const index = situationalIndices[i];
      const question = entry.finalQuestions[index];

      if (i < finalItems.length) {
        const sourceItem = finalItems[i];
        if (sourceItem.situationalSkill && question.skill !== sourceItem.situationalSkill) {
          question.skill = sourceItem.situationalSkill;
          changes += 1;
        }

        if (sourceItem.situationalQuestion) {
          const nextQuestion = applyExistingPrefix(question.question, sourceItem.situationalQuestion);
          if (question.question !== nextQuestion) {
            question.question = nextQuestion;
            changes += 1;
          }
        }
      } else {
        const sourceReviewIdx = i - finalItems.length;
        let reviewSkill = '';

        const normalizedCurrentQuestion = normalizeQuestionForMatch(question.question);
        for (const sourceReview of reviewItems) {
          const normalizedSourceQuestion = normalizeQuestionForMatch(sourceReview.situationalQuestion);
          if (!normalizedSourceQuestion) continue;

          if (
            normalizedCurrentQuestion === normalizedSourceQuestion ||
            normalizedCurrentQuestion.includes(normalizedSourceQuestion) ||
            normalizedSourceQuestion.includes(normalizedCurrentQuestion)
          ) {
            reviewSkill = sourceReview.situationalSkill;
            break;
          }
        }

        if (!reviewSkill && reviewItems[sourceReviewIdx]) {
          reviewSkill = reviewItems[sourceReviewIdx].situationalSkill;
        }

        if (reviewSkill && question.skill !== reviewSkill) {
          question.skill = reviewSkill;
          changes += 1;
        }
      }
    }

    for (let i = 0; i < easyIndices.length; i += 1) {
      const index = easyIndices[i];
      const question = entry.finalQuestions[index];
      const sourceItem = finalItems[i];
      if (!question || !sourceItem) continue;

      if (sourceItem.easySkill && question.skill !== sourceItem.easySkill) {
        question.skill = sourceItem.easySkill;
        changes += 1;
      }

      if (sourceItem.easyQuestion) {
        const nextQuestion = applyExistingPrefix(question.question, sourceItem.easyQuestion);
        if (question.question !== nextQuestion) {
          question.question = nextQuestion;
          changes += 1;
        }
      }
    }
  }

  return changes;
}

function run() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  const parsedBlocks = parseSourceAssessments(source);

  let totalChanges = 0;
  const summary = [];

  for (let lessonNumber = 1; lessonNumber <= 7; lessonNumber += 1) {
    const snapshotPath = path.join(lessonsDir, `lesson${lessonNumber}_after_import_snapshot.json`);

    if (!fs.existsSync(snapshotPath)) {
      console.warn(`[WARN] Snapshot file missing for lesson ${lessonNumber}: ${snapshotPath}`);
      continue;
    }

    const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    let fileChanges = 0;

    for (const language of ['English', 'Taglish']) {
      const key = `${lessonNumber}-${language.toLowerCase()}`;
      const parsedBlock = parsedBlocks.get(key);

      if (!parsedBlock) {
        console.warn(`[WARN] Missing parsed block for Lesson ${lessonNumber} ${language}`);
        continue;
      }

      const entry = snapshotData.find(
        (item) => String(item?.LessonLanguage || '').toLowerCase() === language.toLowerCase()
      );

      if (!entry) {
        console.warn(`[WARN] Missing snapshot entry for Lesson ${lessonNumber} ${language}`);
        continue;
      }

      const expectedReviewCount = Array.isArray(entry.reviewQuestions) ? entry.reviewQuestions.length : 0;
      const expectedFinalEasyCount = Array.isArray(entry.finalQuestions)
        ? entry.finalQuestions.filter((q) => String(q?.questionType).toLowerCase() === 'easy').length
        : 0;

      if (parsedBlock.reviewItems.length === 0 || parsedBlock.finalItems.length === 0) {
        console.warn(
          `[WARN] Parsed block incomplete for Lesson ${lessonNumber} ${language}: ` +
            `review=${parsedBlock.reviewItems.length}, final=${parsedBlock.finalItems.length}`
        );
      }

      if (parsedBlock.finalItems.length < expectedFinalEasyCount) {
        console.warn(
          `[WARN] Final items fewer than expected in Lesson ${lessonNumber} ${language}: ` +
            `parsed=${parsedBlock.finalItems.length}, expected easy entries=${expectedFinalEasyCount}`
        );
      }

      if (parsedBlock.reviewItems.length < expectedReviewCount) {
        console.warn(
          `[WARN] Review items fewer than snapshot entries in Lesson ${lessonNumber} ${language}: ` +
            `parsed=${parsedBlock.reviewItems.length}, snapshot review entries=${expectedReviewCount}`
        );
      }

      const changes = updateSnapshotEntry(entry, parsedBlock);
      fileChanges += changes;

      summary.push(
        `Lesson ${lessonNumber} ${language}: reviewParsed=${parsedBlock.reviewItems.length}, ` +
          `finalParsed=${parsedBlock.finalItems.length}, changes=${changes}`
      );
    }

    if (!dryRun && fileChanges > 0) {
      fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshotData, null, 2)}\n`, 'utf8');
    }

    totalChanges += fileChanges;
  }

  console.log(dryRun ? '[DRY RUN] No files written.' : '[UPDATED] Snapshot files written.');
  for (const line of summary) {
    console.log(line);
  }
  console.log(`Total field updates: ${totalChanges}`);
}

run();
