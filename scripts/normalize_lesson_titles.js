#!/usr/bin/env node
/**
 * Conservative title normalizer for lessons/lesson*_after_import_snapshot.json.
 *
 * Auto-fix rules (high confidence only):
 *  1. Bled topic: a `topic` whose title contains the heading and the next
 *     paragraph concatenated together. Split at the first sentence break
 *     after the "Topic N:" prefix; insert the body as a new paragraph
 *     section right after the topic.
 *  2. Period-ending subtopic: a `subtopic` whose trimmed title ends with
 *     `.` (after stripping trailing `[NN][NN]…` citation markers). Demote
 *     to a `paragraph` section with the original title text as `<p>…</p>`
 *     content.
 *
 * Originals are backed up to lesson{N}_after_import_snapshot.bak.json
 * (only the first run; subsequent runs keep the existing backup).
 */

const fs = require('fs');
const path = require('path');

const lessonsDir = path.join(process.cwd(), 'lessons');

const stripTrailingCitations = (value = '') =>
  String(value)
    .replace(/(?:\s*\[\d+\])+\s*$/, '')
    .replace(/[”’"']+\s*$/, '') // strip trailing close-quote so `."` still detects as sentence
    .trim();

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Regex to match a sentence break inside a bled topic.
// Matches the first run of "<heading>" followed by a capital-letter word
// that starts a new sentence. Heading = up to 60 chars after "Topic N:" or "Paksa N:".
const BLED_TOPIC_RE = /^((?:Topic|Paksa)\s+\d+\s*[:.]\s*[^.]{1,60}?)\s+(In|It|This|These|That|During|For|Within|Without|When|While|Through|Throughout|Across|At|On|There|Their|Its)\s/;

const isBledTopic = (section) => {
  if (section.type !== 'topic') return false;
  const title = String(section.title || '').trim();
  if (title.length < 80) return false;
  return BLED_TOPIC_RE.test(title);
};

const splitBledTopic = (title) => {
  const match = title.match(BLED_TOPIC_RE);
  if (!match) return null;
  const heading = match[1].trim();
  const body = title.slice(match[0].length - match[2].length - 1).trim();
  return { heading, body };
};

const isPeriodEndingSubtopic = (section) => {
  if (section.type !== 'subtopic') return false;
  const title = String(section.title || '').trim();
  if (!title) return false;
  const cleaned = stripTrailingCitations(title);
  if (!cleaned.endsWith('.')) return false;
  // Skip enumerator patterns that legitimately end with "." like "i." / "1.1." (rare).
  if (/^([IVX]+|\d+(\.\d+)?|[a-z])\.\s*\w/.test(cleaned)) return false;
  return true;
};

const demoteSubtopicToParagraph = (section) => ({
  ...section,
  type: 'paragraph',
  title: '',
  content: `<p>${escapeHtml(section.title)}</p>`,
  contentLayout: section.contentLayout || 'text',
});

// Explicit demote list (lesson, language, order) — these are subtopic titles
// that read as sentence fragments / lead-ins / orphans and should be inlined
// as paragraph content. Picked manually after reviewing the snapshot.
const EXPLICIT_DEMOTIONS = new Set([
  '2|English|4',
  '2|English|27',
  '2|English|44',
  '2|Taglish|4',
  '2|Taglish|46',
  '3|English|46',
  '4|English|44',
  '4|English|58',
  '5|English|14',
  '5|English|23',
  '5|English|107',
  '5|Taglish|12',
  '5|Taglish|14',
  '5|Taglish|16',
  '5|Taglish|126',
  '5|Taglish|132',
  '5|Taglish|134',
  '6|English|28',
  '6|English|52',
  '7|English|31',
  '7|English|41',
  '7|English|53',
  '7|English|81',
  '7|English|111',
  '7|English|136',
  '7|English|144',
  '7|English|148',
  '7|English|152',
]);

// Sections to drop entirely — duplicates that the lesson view already renders
// elsewhere (e.g. a redundant "References" heading right before the
// dedicated `references` section, or an orphan citation marker).
const EXPLICIT_DROPS = new Set([
  '5|Taglish|150', // "Mga Sanggunian" — the references section already labels itself
  '5|Taglish|151', // "[1]" — orphan citation marker
]);

const isExplicitDemotion = (section, lessonOrder, language) => {
  if (section.type !== 'subtopic') return false;
  const key = `${lessonOrder}|${language}|${section.order}`;
  return EXPLICIT_DEMOTIONS.has(key);
};

const isExplicitDrop = (section, lessonOrder, language) => {
  const key = `${lessonOrder}|${language}|${section.order}`;
  return EXPLICIT_DROPS.has(key);
};

const splitTopicSection = (section) => {
  const split = splitBledTopic(String(section.title || ''));
  if (!split) return [section];
  const baseId = Number(section.id) || Date.now();
  return [
    { ...section, title: split.heading },
    {
      id: baseId + 1,
      file: null,
      type: 'paragraph',
      order: section.order, // re-numbered later
      title: '',
      caption: '',
      content: `<p>${escapeHtml(split.body)}</p>`,
      fileName: null,
      tableData: null,
      contentLayout: 'text',
    },
  ];
};

const renumberSections = (sections) =>
  sections.map((section, index) => ({ ...section, order: index + 1 }));

const normalizeSnapshotEntry = (entry, log) => {
  const sections = Array.isArray(entry.sections) ? entry.sections : [];
  const fixes = [];
  const next = [];
  const lessonOrder = Number(entry.LessonOrder);
  const language = String(entry.LessonLanguage || '');

  for (const section of sections) {
    if (isBledTopic(section)) {
      const replacement = splitTopicSection(section);
      if (replacement.length > 1) {
        fixes.push({
          rule: 'bled-topic',
          order: section.order,
          before: section.title,
          after: replacement[0].title,
          extracted: replacement[1].content,
        });
        next.push(...replacement);
        continue;
      }
    }

    if (isPeriodEndingSubtopic(section)) {
      const replacement = demoteSubtopicToParagraph(section);
      fixes.push({
        rule: 'period-ending-subtopic',
        order: section.order,
        before: section.title,
        after: '(demoted to paragraph)',
      });
      next.push(replacement);
      continue;
    }

    if (isExplicitDrop(section, lessonOrder, language)) {
      fixes.push({
        rule: 'explicit-drop',
        order: section.order,
        before: section.title,
        after: '(removed)',
      });
      continue;
    }

    if (isExplicitDemotion(section, lessonOrder, language)) {
      const replacement = demoteSubtopicToParagraph(section);
      fixes.push({
        rule: 'explicit-demotion',
        order: section.order,
        before: section.title,
        after: '(demoted to paragraph)',
      });
      next.push(replacement);
      continue;
    }

    next.push(section);
  }

  if (fixes.length > 0) {
    log.push({
      ModuleID: entry.ModuleID,
      LessonLanguage: entry.LessonLanguage,
      LessonOrder: entry.LessonOrder,
      fixCount: fixes.length,
      fixes,
    });
    entry.sections = renumberSections(next);
  }

  return entry;
};

const dryRun = process.argv.includes('--dry-run');

const log = [];
let touchedFiles = 0;

for (let lessonNum = 1; lessonNum <= 7; lessonNum += 1) {
  const file = path.join(lessonsDir, `lesson${lessonNum}_after_import_snapshot.json`);
  if (!fs.existsSync(file)) continue;

  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);

  const before = JSON.stringify(data);

  for (const entry of data) {
    normalizeSnapshotEntry(entry, log);
  }

  const after = JSON.stringify(data);
  if (before === after) continue;

  if (!dryRun) {
    const backup = path.join(lessonsDir, `lesson${lessonNum}_after_import_snapshot.bak.json`);
    if (!fs.existsSync(backup)) {
      fs.writeFileSync(backup, raw, 'utf8');
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  touchedFiles += 1;
}

console.log(JSON.stringify({ dryRun, touchedFiles, log }, null, 2));
