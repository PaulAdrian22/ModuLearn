import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App';
import AdminNavbar from '../components/AdminNavbar';
import ImageCropper from '../components/ImageCropper';
import { API_BASE_URL } from '../config/api';
import { themedConfirm } from '../utils/themedConfirm';

const OBJECTIVE_HEADING_REGEX = /(?:<p[^>]*>\s*|<div[^>]*>\s*)?(?:<strong>|<b>)?\s*(?:🎯\s*)?(?:learning\s*objectives?|objectives?)\s*[:\-]?\s*(?:<\/strong>|<\/b>)?\s*(?:<\/p>|<\/div>)?/i;

const stripObjectiveHeading = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(new RegExp(`^${OBJECTIVE_HEADING_REGEX.source}`, 'i'), '')
    .replace(/^(?:<br\s*\/?>|&nbsp;|\s)+/i, '')
    .trim();
};

const splitDescriptionAndObjectives = (value = '') => {
  const raw = String(value || '');
  if (!raw.trim()) {
    return { description: '', objectives: '' };
  }

  const marker = OBJECTIVE_HEADING_REGEX.exec(raw);
  if (!marker || typeof marker.index !== 'number') {
    return { description: raw, objectives: '' };
  }

  const description = raw.slice(0, marker.index).trim();
  const objectives = stripObjectiveHeading(raw.slice(marker.index + marker[0].length));

  return { description, objectives };
};

const combineDescriptionAndObjectives = (description = '', objectives = '') => {
  const cleanDescription = String(description || '').trim();
  const cleanObjectives = stripObjectiveHeading(objectives);

  if (!cleanObjectives) {
    return cleanDescription;
  }

  const objectiveBlock = `<p><strong>Learning Objectives:</strong></p>${cleanObjectives}`;
  return cleanDescription ? `${cleanDescription}<p><br></p>${objectiveBlock}` : objectiveBlock;
};

const extractTextContent = (value = '') =>
  String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasMeaningfulText = (value = '') => extractTextContent(value).length > 0;

const DEFAULT_TABLE_HEADERS = ['Header 1', 'Header 2'];

const normalizeTableHeaderSpans = (rawHeaderSpans, columnCount) => {
  if (!Number.isFinite(columnCount) || columnCount <= 0) {
    return [];
  }

  const spans = new Array(columnCount).fill(1);
  const sourceSpans = Array.isArray(rawHeaderSpans) ? rawHeaderSpans : [];

  let coveredUntil = -1;
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    if (columnIndex <= coveredUntil) {
      spans[columnIndex] = 0;
      continue;
    }

    const rawSpan = Number(sourceSpans[columnIndex]);
    const span = Number.isFinite(rawSpan) && rawSpan > 1
      ? Math.min(columnCount - columnIndex, Math.floor(rawSpan))
      : 1;

    spans[columnIndex] = span;

    if (span > 1) {
      for (let offset = 1; offset < span && columnIndex + offset < columnCount; offset += 1) {
        spans[columnIndex + offset] = 0;
      }
      coveredUntil = columnIndex + span - 1;
    }
  }

  return spans;
};

const normalizeTableLineBreakFlags = (rawFlags, lineCount) => {
  if (!Number.isFinite(lineCount) || lineCount <= 0) {
    return [];
  }

  const sourceFlags = Array.isArray(rawFlags) ? rawFlags : [];
  return Array.from({ length: lineCount }, (_, lineIndex) => Boolean(sourceFlags[lineIndex]));
};

const getSpanOwnerIndex = (spans, columnIndex) => {
  let ownerIndex = Math.max(0, Math.min(Number(columnIndex) || 0, spans.length - 1));
  while (ownerIndex > 0 && (spans[ownerIndex] || 0) === 0) {
    ownerIndex -= 1;
  }
  return ownerIndex;
};

const insertTableSpanColumn = (rawSpans, insertAt, columnCount) => {
  const normalizedSpans = normalizeTableHeaderSpans(rawSpans, columnCount);
  const clampedInsertAt = Math.max(0, Math.min(Number(insertAt) || 0, columnCount));
  const nextSpans = [...normalizedSpans];

  if (clampedInsertAt > 0 && clampedInsertAt < columnCount && normalizedSpans[clampedInsertAt] === 0) {
    const ownerIndex = getSpanOwnerIndex(normalizedSpans, clampedInsertAt);
    nextSpans[ownerIndex] = (nextSpans[ownerIndex] || 1) + 1;
    nextSpans.splice(clampedInsertAt, 0, 0);
  } else {
    nextSpans.splice(clampedInsertAt, 0, 1);
  }

  return normalizeTableHeaderSpans(nextSpans, columnCount + 1);
};

const removeTableSpanColumn = (rawSpans, removeAt, columnCount) => {
  if (!Number.isFinite(columnCount) || columnCount <= 1) {
    return [1];
  }

  const normalizedSpans = normalizeTableHeaderSpans(rawSpans, columnCount);
  const clampedRemoveAt = Math.max(0, Math.min(Number(removeAt) || 0, columnCount - 1));
  const ownerIndex = getSpanOwnerIndex(normalizedSpans, clampedRemoveAt);
  const ownerSpan = normalizedSpans[ownerIndex] || 1;
  const nextSpans = [...normalizedSpans];

  nextSpans.splice(clampedRemoveAt, 1);

  if (ownerSpan > 1) {
    if (ownerIndex === clampedRemoveAt) {
      if (clampedRemoveAt < nextSpans.length) {
        nextSpans[clampedRemoveAt] = ownerSpan - 1;
      }
    } else if (ownerIndex < nextSpans.length) {
      nextSpans[ownerIndex] = Math.max(1, (nextSpans[ownerIndex] || 1) - 1);
    }
  }

  return normalizeTableHeaderSpans(nextSpans, columnCount - 1);
};

const createDefaultTableData = () => ({
  title: '',
  headers: [...DEFAULT_TABLE_HEADERS],
  rows: [['', '']],
  headerSpans: [1, 1],
  rowCellSpans: [[1, 1]],
  brokenColumnLines: [false],
  brokenRowLines: [],
});

const normalizeTableData = (tableData) => {
  if (!tableData || typeof tableData !== 'object') {
    return null;
  }

  const title = String(tableData.title || tableData.tableTitle || '');

  const sourceRows = Array.isArray(tableData.rows) && tableData.rows.length > 0
    ? tableData.rows
    : [];
  const normalizedHeaders = Array.isArray(tableData.headers)
    ? tableData.headers.map((header) => String(header || ''))
    : [];
  const inferredColumnCount = Math.max(
    normalizedHeaders.length,
    ...sourceRows.map((row) => (Array.isArray(row) ? row.length : 0)),
    sourceRows.length > 0 ? 1 : DEFAULT_TABLE_HEADERS.length
  );
  const columnCount = Math.max(1, inferredColumnCount);
  const headers = Array.from({ length: columnCount }, (_, headerIndex) =>
    normalizedHeaders[headerIndex] ?? DEFAULT_TABLE_HEADERS[headerIndex] ?? `Header ${headerIndex + 1}`
  );

  const rowsSource = sourceRows.length > 0
    ? sourceRows
    : [new Array(columnCount).fill('')];

  const rows = rowsSource.map((row) => {
    const normalizedRow = Array.isArray(row)
      ? row.slice(0, columnCount).map((cell) => String(cell || ''))
      : [];

    while (normalizedRow.length < columnCount) {
      normalizedRow.push('');
    }

    return normalizedRow;
  });

  const rowCellSpans = rows.map((_, rowIndex) => {
    const sourceRowSpans = Array.isArray(tableData.rowCellSpans)
      ? tableData.rowCellSpans[rowIndex]
      : null;
    return normalizeTableHeaderSpans(sourceRowSpans, columnCount);
  });

  return {
    title,
    headers,
    rows,
    headerSpans: normalizeTableHeaderSpans(tableData.headerSpans, columnCount),
    rowCellSpans,
    brokenColumnLines: normalizeTableLineBreakFlags(tableData.brokenColumnLines, Math.max(0, columnCount - 1)),
    brokenRowLines: normalizeTableLineBreakFlags(tableData.brokenRowLines, Math.max(0, rows.length - 1)),
  };
};

const normalizeQuestionTypeValue = (value = '', fallback = 'Easy') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'situational') return 'Situational';
  if (normalized === 'easy') return 'Easy';
  return fallback;
};

const MASTERY_TYPE_OPTIONS = [
  'Memorization',
  'Technical Comprehension',
  'Analytical Thinking',
  'Critical Thinking',
  'Problem Solving',
];

const normalizeMasteryTypeValue = (value = '', fallback = 'Memorization') => {
  const normalized = String(value || '').trim().toLowerCase();
  const matched = MASTERY_TYPE_OPTIONS.find(
    (masteryType) => masteryType.toLowerCase() === normalized
  );
  return matched || fallback;
};

const normalizeSkillValue = (value = '', fallback = 'Memorization') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'no skill') return 'No Skill';
  return normalizeMasteryTypeValue(value, fallback);
};

const padQuestionOptions = (options = []) => {
  const paddedOptions = options.slice(0, 4).map((option) => String(option ?? '').trim());
  while (paddedOptions.length < 4) {
    paddedOptions.push('');
  }
  return paddedOptions;
};

const extractChoicesByLabelPattern = (value = '', regex, mapLabelToIndex) => {
  const source = String(value || '');
  const matches = Array.from(source.matchAll(regex));
  if (matches.length < 2) return [];

  const choicesByIndex = ['', '', '', ''];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = String(match?.[1] || '');
    const choiceIndex = mapLabelToIndex(label);

    if (choiceIndex < 0 || choiceIndex > 3) {
      continue;
    }

    const start = (match.index ?? 0) + String(match[0] || '').length;
    const end = index < matches.length - 1
      ? (matches[index + 1].index ?? source.length)
      : source.length;

    const content = source
      .slice(start, end)
      .replace(/\s+/g, ' ')
      .trim();

    if (content && !choicesByIndex[choiceIndex]) {
      choicesByIndex[choiceIndex] = content;
    }
  }

  return choicesByIndex.filter((choice) => choice.trim().length > 0).length >= 2
    ? choicesByIndex
    : [];
};

const extractChoicesFromInlineLabels = (value = '') => {
  const mergedText = String(value || '').replace(/\r/g, '\n');
  const expandedLabelText = mergedText
    .replace(/([^\s\n])([A-Da-d][)\.:\-]\s*)/g, '$1 $2')
    .replace(/([^\s\n])([1-4][)\.:\-]\s*)/g, '$1 $2');

  // Handles "A. text B. text C. text D. text" and "A) ..." variants.
  const letterChoices = extractChoicesByLabelPattern(
    expandedLabelText,
    /(?:^|[\s\n])([A-Da-d])[\)\.:\-]\s*/g,
    (label) => label.toLowerCase().charCodeAt(0) - 97
  );
  if (letterChoices.length >= 2) {
    return letterChoices;
  }

  // Handles numbered options like "1. ... 2. ... 3. ... 4. ...".
  const numberedChoices = extractChoicesByLabelPattern(
    expandedLabelText,
    /(?:^|[\s\n])([1-4])[\)\.:\-]\s*/g,
    (label) => Number.parseInt(label, 10) - 1
  );
  if (numberedChoices.length >= 2) {
    return numberedChoices;
  }

  // Handles looser one-line forms like "a choice b choice c choice d choice".
  const looseLetterMatches = expandedLabelText.match(/(?:^|[\s\n])[A-Da-d]\s+/g) || [];
  const hasSequentialLooseLetters = /(?:^|[\s\n])a\s+/.test(expandedLabelText.toLowerCase())
    && /(?:^|[\s\n])b\s+/.test(expandedLabelText.toLowerCase())
    && /(?:^|[\s\n])c\s+/.test(expandedLabelText.toLowerCase());

  if (looseLetterMatches.length >= 3 && hasSequentialLooseLetters) {
    const looseLetterChoices = extractChoicesByLabelPattern(
      expandedLabelText,
      /(?:^|[\s\n])([A-Da-d])\s+/g,
      (label) => label.toLowerCase().charCodeAt(0) - 97
    );
    if (looseLetterChoices.length >= 2) {
      return looseLetterChoices;
    }
  }

  return [];
};

const normalizeQuestionOptionsArray = (optionsInput = []) => {
  const optionList = Array.isArray(optionsInput) ? optionsInput : [optionsInput];
  const asStrings = optionList.map((option) => String(option ?? ''));
  const mergedText = asStrings.join('\n').trim();

  if (!mergedText) {
    return padQuestionOptions([]);
  }

  const labeledChoices = extractChoicesFromInlineLabels(mergedText);
  if (labeledChoices.length >= 2) {
    return padQuestionOptions(labeledChoices);
  }

  const nonEmptyOptions = asStrings.filter((option) => option.trim().length > 0);
  if (nonEmptyOptions.length >= 2 && nonEmptyOptions.length <= 4) {
    return padQuestionOptions(asStrings);
  }

  const lineChoices = mergedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lineChoices.length >= 2) {
    return padQuestionOptions(lineChoices);
  }

  const delimitedChoices = mergedText
    .split(/\s*\|\s*|\s*;\s*/)
    .map((choice) => choice.trim())
    .filter(Boolean);
  if (delimitedChoices.length >= 2) {
    return padQuestionOptions(delimitedChoices);
  }

  const commaChoices = mergedText
    .split(/\s*,\s*/)
    .map((choice) => choice.trim())
    .filter(Boolean);
  if (!/\r?\n/.test(mergedText) && commaChoices.length >= 2 && commaChoices.length <= 4) {
    return padQuestionOptions(commaChoices);
  }

  return padQuestionOptions(asStrings);
};

const resolveNormalizedCorrectAnswer = (question = {}, normalizedOptions = []) => {
  const parsedCorrectAnswer = Number.parseInt(question?.correctAnswer, 10);
  const fallbackIndex = Number.isFinite(parsedCorrectAnswer)
    ? Math.max(0, Math.min(3, parsedCorrectAnswer))
    : 0;

  const originalOptions = Array.isArray(question?.options)
    ? question.options.map((option) => String(option ?? '').trim())
    : [];

  const correctAnswerText = typeof question?.correctAnswerText === 'string'
    ? question.correctAnswerText.trim()
    : String(originalOptions[fallbackIndex] || '').trim();

  if (correctAnswerText) {
    const matchedIndex = normalizedOptions.findIndex(
      (option) => String(option || '').trim() === correctAnswerText
    );
    if (matchedIndex >= 0) {
      return matchedIndex;
    }
  }

  if (!String(normalizedOptions[fallbackIndex] || '').trim()) {
    const firstFilledIndex = normalizedOptions.findIndex(
      (option) => String(option || '').trim().length > 0
    );
    return firstFilledIndex >= 0 ? firstFilledIndex : 0;
  }

  return fallbackIndex;
};

const normalizeQuestionOptions = (question = {}) => {
  const normalizedOptions = normalizeQuestionOptionsArray(question?.options || []);
  const normalizedCorrectAnswer = resolveNormalizedCorrectAnswer(question, normalizedOptions);

  return {
    ...question,
    options: normalizedOptions,
    correctAnswer: normalizedCorrectAnswer,
  };
};

const optionsToTextareaValue = (options = []) =>
  normalizeQuestionOptionsArray(options)
    .map((option) => String(option || '').replace(/\r?\n+/g, ' ').trim())
    .join('\n');

const parseOptionsFromTextareaInput = (value = '') =>
  normalizeQuestionOptionsArray([String(value || '')]);

const STAGE_LABELS = {
  introduction: 'Introduction',
  diagnostic: 'Diagnostic',
  lesson: 'Lesson',
  final: 'Final Assessment',
  simulation: 'Simulation',
};

const STANDARD_STAGE_ORDER = ['introduction', 'diagnostic', 'lesson', 'final'];

const DEFAULT_ROADMAP_STAGES = [
  { id: 'introduction', type: 'introduction', label: STAGE_LABELS.introduction },
  { id: 'diagnostic', type: 'diagnostic', label: STAGE_LABELS.diagnostic },
  { id: 'lesson', type: 'lesson', label: STAGE_LABELS.lesson },
  { id: 'final', type: 'final', label: STAGE_LABELS.final },
];

const parseSerializedArray = (value = []) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  let parsed = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (typeof parsed !== 'string') {
      return [];
    }
  }

  return [];
};

const ensureStandardRoadmapStages = (stages = []) => {
  const normalizedStages = Array.isArray(stages) ? stages : [];
  const stageMap = new Map();

  normalizedStages.forEach((stage) => {
    const normalizedType = String(stage?.type || '').trim().toLowerCase();
    if (!STANDARD_STAGE_ORDER.includes(normalizedType) || stageMap.has(normalizedType)) {
      return;
    }

    const rawId = stage?.id;
    const normalizedId =
      rawId !== undefined && rawId !== null && String(rawId).trim()
        ? String(rawId)
        : normalizedType;

    const normalizedLabel = String(
      stage?.label || STAGE_LABELS[normalizedType] || normalizedType
    ).trim();

    stageMap.set(normalizedType, {
      id: normalizedId,
      type: normalizedType,
      label: normalizedLabel || STAGE_LABELS[normalizedType] || normalizedType,
    });
  });

  return STANDARD_STAGE_ORDER.map((stageType) =>
    stageMap.get(stageType) || {
      id: stageType,
      type: stageType,
      label: STAGE_LABELS[stageType],
    }
  );
};

const normalizeRoadmapStages = (stages = []) => {
  const parsedStages = parseSerializedArray(stages);

  const normalizedStages = parsedStages
    .map((stage, index) => {
      const normalizedType = String(stage?.type || '').trim().toLowerCase();
      if (!normalizedType) {
        return null;
      }

      const rawId = stage?.id;
      const normalizedId =
        rawId !== undefined && rawId !== null && String(rawId).trim()
          ? String(rawId)
          : `${normalizedType}-${index + 1}`;

      const normalizedLabel = String(
        stage?.label || STAGE_LABELS[normalizedType] || normalizedType
      ).trim();

      return {
        id: normalizedId,
        type: normalizedType,
        label: normalizedLabel || STAGE_LABELS[normalizedType] || normalizedType,
      };
    })
    .filter(Boolean);

  return ensureStandardRoadmapStages(normalizedStages);
};

const syncRoadmapStagesForLessonRules = ({
  stages = [],
  difficulty = 'Easy',
  lessonOrder,
}) => {
  void difficulty;
  void lessonOrder;
  const normalizedStages = normalizeRoadmapStages(stages);
  return ensureStandardRoadmapStages(normalizedStages);
};

const normalizeBooleanFlag = (value = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const normalizeQuestionForSnapshot = (question = {}) => ({
  id: question?.id ?? null,
  question: String(question?.question || ''),
  skill: String(question?.skill || ''),
  options: Array.isArray(question?.options)
    ? question.options.map((option) => String(option || ''))
    : [],
  correctAnswer: Number.isFinite(Number(question?.correctAnswer))
    ? Number(question.correctAnswer)
    : 0,
  questionType: normalizeQuestionTypeValue(question?.questionType || question?.type || 'Easy'),
});

const normalizeEditorSectionType = (rawType = '') => {
  const normalizedType = String(rawType || '').trim().toLowerCase();

  switch (normalizedType) {
    case 'topic title':
    case 'topic-title':
    case 'topic_title':
      return 'topic';
    case 'subtopic title':
    case 'subtopic-title':
    case 'subtopic_title':
      return 'subtopic';
    case 'review - multiple choice':
    case 'review multiple choice':
      return 'review-multiple-choice';
    case 'review-drag-drop':
    case 'review - drag and drop':
    case 'review drag and drop':
      return 'simulation';
    default:
      return normalizedType;
  }
};

const normalizeImageForSnapshot = (image = {}) => ({
  url: String(image?.url || ''),
  fileName: String(image?.fileName || ''),
  caption: String(image?.caption || ''),
});

const normalizeSectionForSnapshot = (section = {}) => ({
  id: section?.id ?? null,
  type: normalizeEditorSectionType(section?.type),
  title: String(section?.title || ''),
  tableTitle: String(section?.tableData?.title || section?.tableTitle || ''),
  content: String(section?.content || ''),
  caption: String(section?.caption || ''),
  order: Number.isFinite(Number(section?.order)) ? Number(section.order) : 0,
  layout: String(section?.layout || ''),
  contentLayout: String(section?.contentLayout || ''),
  sideText: String(section?.sideText || ''),
  sideTexts: Array.isArray(section?.sideTexts)
    ? section.sideTexts.map((text) => String(text || ''))
    : [],
  images: Array.isArray(section?.images)
    ? section.images.map((image) => normalizeImageForSnapshot(image))
    : [],
  layerImages: Array.isArray(section?.layerImages)
    ? section.layerImages.map((layer) =>
        Array.isArray(layer) ? layer.map((image) => normalizeImageForSnapshot(image)) : []
      )
    : [],
  tableData: normalizeTableData(section?.tableData),
  questions: Array.isArray(section?.questions)
    ? section.questions.map((question) => normalizeQuestionForSnapshot(question))
    : [],
  simulationId:
    section?.simulationId || section?.simulation?.SimulationID || section?.simulation?.id || null,
});

const buildLessonSnapshot = ({
  lessonData,
  sections,
  diagnosticQuestions,
  reviewQuestions,
  finalQuestions,
  finalInstruction,
  roadmapStages,
  selectedSimulation,
}) =>
  JSON.stringify({
    lessonData: {
      ModuleTitle: String(lessonData?.ModuleTitle || ''),
      Description: String(lessonData?.Description || ''),
      Objectives: String(lessonData?.Objectives || ''),
      ReferenceLinks: String(lessonData?.ReferenceLinks || ''),
      LessonOrder: Number.isFinite(Number(lessonData?.LessonOrder))
        ? Number(lessonData.LessonOrder)
        : 0,
      Difficulty: String(lessonData?.Difficulty || ''),
      LessonLanguage: String(lessonData?.LessonLanguage || 'English'),
      LessonTime: {
        hours: Number.isFinite(Number(lessonData?.LessonTime?.hours))
          ? Number(lessonData.LessonTime.hours)
          : 0,
        minutes: Number.isFinite(Number(lessonData?.LessonTime?.minutes))
          ? Number(lessonData.LessonTime.minutes)
          : 0,
      },
      Tesda_Reference: String(lessonData?.Tesda_Reference || ''),
    },
    sections: Array.isArray(sections)
      ? sections.map((section) => normalizeSectionForSnapshot(section))
      : [],
    diagnosticQuestions: Array.isArray(diagnosticQuestions)
      ? diagnosticQuestions.map((question) => normalizeQuestionForSnapshot(question))
      : [],
    reviewQuestions: Array.isArray(reviewQuestions)
      ? reviewQuestions.map((question) => normalizeQuestionForSnapshot(question))
      : [],
    finalQuestions: Array.isArray(finalQuestions)
      ? finalQuestions.map((question) => normalizeQuestionForSnapshot(question))
      : [],
    finalInstruction: String(finalInstruction || ''),
    roadmapStages: Array.isArray(roadmapStages)
      ? roadmapStages.map((stage) => ({
          id: stage?.id ?? null,
          type: String(stage?.type || ''),
          label: String(stage?.label || ''),
        }))
      : [],
    selectedSimulationId: selectedSimulation?.SimulationID || selectedSimulation?.id || null,
  });

const AddLesson = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;
  const isSupplementaryCreateMode = !isEditMode && String(searchParams.get('type') || '').trim().toLowerCase() === 'supplementary';
  const [savedModuleId, setSavedModuleId] = useState(() => {
    const parsedId = Number(id);
    return Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
  });

  const [lessonData, setLessonData] = useState({
    ModuleTitle: '',
    Description: '',
    Objectives: '',
    ReferenceLinks: '',
    LessonOrder: 1,
    Difficulty: isSupplementaryCreateMode ? 'Supplementary' : 'Easy',
    LessonLanguage: 'English',
    LessonTime: { hours: 0, minutes: 30 },
    Tesda_Reference: ''
  });

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [draggedSection, setDraggedSection] = useState(null);
  const [dragOverSection, setDragOverSection] = useState(null);
  const [activeStage, setActiveStage] = useState('introduction'); // 'diagnostic', 'introduction', 'lesson', 'review', 'final'
  const [mountedStages, setMountedStages] = useState({ introduction: true });
  const [diagnosticQuestions, setDiagnosticQuestions] = useState([]);
  const [reviewQuestions, setReviewQuestions] = useState([]);
  const [finalQuestions, setFinalQuestions] = useState([]);
  const [activeTextarea, setActiveTextarea] = useState(null);
  const [tableHoverTarget, setTableHoverTarget] = useState(null);
  const [roadmapStages, setRoadmapStages] = useState(() =>
    syncRoadmapStagesForLessonRules({
      stages: DEFAULT_ROADMAP_STAGES,
      difficulty: isSupplementaryCreateMode ? 'Supplementary' : 'Easy',
      lessonOrder: 1,
    })
  );
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [availableSimulations, setAvailableSimulations] = useState([]);
  const [showSimulationPicker, setShowSimulationPicker] = useState(false);
  const [selectedSimulation, setSelectedSimulation] = useState(null);
  const [simulationPickerTargetSectionId, setSimulationPickerTargetSectionId] = useState(null);
  const [draggedStage, setDraggedStage] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [finalInstruction, setFinalInstruction] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({});
  const [layoutPickerSection, setLayoutPickerSection] = useState(null);
  const [changeMaterialPicker, setChangeMaterialPicker] = useState(null);
  const [insertAtIndex, setInsertAtIndex] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [snapshotReady, setSnapshotReady] = useState(!isEditMode);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [imageCropTarget, setImageCropTarget] = useState(null);
  const [isCompletionLocked, setIsCompletionLocked] = useState(false);
  const [languageModuleMap, setLanguageModuleMap] = useState({ English: null, Taglish: null });
  const [saveStatusToast, setSaveStatusToast] = useState(null);
  const baselineSnapshotRef = useRef('');
  const backGuardArmedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  
  // Refs for contentEditable elements
  const lessonTitleRef = useRef(null);
  const descriptionRef = useRef(null);
  const objectivesRef = useRef(null);

  const inlineLessonReviewCount = useMemo(
    () =>
      sections.reduce((total, section) => {
        if (section?.type !== 'review-multiple-choice') return total;
        return total + (Array.isArray(section.questions) ? section.questions.length : 0);
      }, 0),
    [sections]
  );

  const inlineReviewQuestions = useMemo(
    () =>
      sections.reduce((allQuestions, section) => {
        if (section?.type !== 'review-multiple-choice') return allQuestions;
        const sectionQuestions = Array.isArray(section.questions) ? section.questions : [];
        return [...allQuestions, ...sectionQuestions];
      }, []),
    [sections]
  );

  const lessonReviewCount = inlineLessonReviewCount > 0 ? inlineLessonReviewCount : reviewQuestions.length;
  const lessonReviewLimit = lessonReviewCount > 10 ? 20 : 10;
  const diagnosticLimit = lessonReviewCount >= 20 ? 10 : 5;
  const finalAssessmentLimit = 45;
  const simulationItemCount = Math.max(0, Math.floor(Number(selectedSimulation?.MaxScore || 0)));
  const simulationLimit = simulationItemCount > 5 ? 10 : 5;
  const diagnosticSourceQuestions = inlineReviewQuestions.length > 0 ? inlineReviewQuestions : reviewQuestions;
  const activeSimulationPickerSelectionId = simulationPickerTargetSectionId !== null
    ? (
        sections.find((section) => section.id === simulationPickerTargetSectionId)?.simulationId ||
        sections.find((section) => section.id === simulationPickerTargetSectionId)?.simulation?.SimulationID ||
        sections.find((section) => section.id === simulationPickerTargetSectionId)?.simulation?.id ||
        null
      )
    : (selectedSimulation?.SimulationID || selectedSimulation?.id || null);
  const isEditLockedByCompletion = isEditMode && isCompletionLocked;
  const isSaveDisabled = loading || isEditLockedByCompletion;
  const saveLessonButtonText = isSupplementaryCreateMode ? 'Save Supplementary Lesson' : 'Save Lesson';
  const isSupplementaryLesson = String(lessonData.Difficulty || '').trim().toLowerCase() === 'supplementary';
  const difficultyOptions = ['Easy', 'Challenging', 'Advanced'];

  const getSaveButtonLabel = (defaultLabel = 'Save Lesson') => {
    if (loading) return 'Saving...';
    if (isEditLockedByCompletion) return 'Editing Locked';
    if (!hasUnsavedChanges) return 'No Changes to Save';
    return defaultLabel;
  };

  useEffect(() => {
    if (!isSupplementaryCreateMode || isEditMode) return;

    setLessonData((prev) => {
      if (prev.Difficulty === 'Supplementary') {
        return prev;
      }

      return {
        ...prev,
        Difficulty: 'Supplementary'
      };
    });
  }, [isSupplementaryCreateMode, isEditMode]);

  useEffect(() => {
    setRoadmapStages((prevStages) => {
      const syncedStages = syncRoadmapStagesForLessonRules({
        stages: prevStages,
        difficulty: lessonData.Difficulty,
        lessonOrder: lessonData.LessonOrder,
      });
      const isSameStages =
        syncedStages.length === prevStages.length &&
        syncedStages.every(
          (stage, index) =>
            stage.id === prevStages[index]?.id &&
            stage.type === prevStages[index]?.type &&
            stage.label === prevStages[index]?.label
        );

      return isSameStages ? prevStages : syncedStages;
    });
  }, [lessonData.Difficulty, lessonData.LessonOrder]);

  useEffect(() => {
    const activeStageStillExists = roadmapStages.some((stage) => stage.type === activeStage);
    if (activeStageStillExists) return;

    const fallbackStageType = roadmapStages[0]?.type || 'introduction';
    if (fallbackStageType !== activeStage) {
      setActiveStage(fallbackStageType);
    }
  }, [roadmapStages, activeStage]);

  const autoDiagnosticQuestions = useMemo(() => {
    const targetCount = Math.min(diagnosticLimit, diagnosticSourceQuestions.length);
    if (targetCount <= 0) return [];

    return diagnosticSourceQuestions.slice(0, targetCount).map((question, index) => {
      const options = Array.isArray(question?.options) ? question.options.slice(0, 4) : [];
      while (options.length < 4) options.push('');

      const parsedCorrectAnswer = Number(question?.correctAnswer);
      const safeCorrectAnswer = Number.isFinite(parsedCorrectAnswer)
        ? Math.max(0, Math.min(3, parsedCorrectAnswer))
        : 0;

      return {
        ...question,
        id: question?.id ?? `auto-diagnostic-${index}`,
        question: String(question?.question || ''),
        skill: normalizeSkillValue(question?.skill || question?.skillTag || 'Memorization', 'Memorization'),
        options,
        correctAnswer: safeCorrectAnswer,
        questionType: normalizeQuestionTypeValue(question?.questionType || question?.type || 'Easy', 'Easy'),
      };
    });
  }, [diagnosticLimit, diagnosticSourceQuestions]);

  useEffect(() => {
    setMountedStages((prev) => {
      if (prev[activeStage]) return prev;
      return {
        ...prev,
        [activeStage]: true,
      };
    });
  }, [activeStage]);

  useEffect(() => {
    if (!saveStatusToast) return;

    const timer = setTimeout(() => {
      setSaveStatusToast(null);
    }, 2600);

    return () => clearTimeout(timer);
  }, [saveStatusToast]);

  const getStageCounterMeta = (stageType) => {
    switch (stageType) {
      case 'diagnostic':
        return { label: 'Items', count: autoDiagnosticQuestions.length, limit: diagnosticLimit };
      case 'lesson':
        return { label: 'Review', count: lessonReviewCount, limit: lessonReviewLimit };
      case 'review':
        return { label: 'Items', count: reviewQuestions.length, limit: lessonReviewLimit };
      case 'final':
        return { label: 'Items', count: finalQuestions.length, limit: finalAssessmentLimit };
      case 'simulation':
        return { label: 'Items', count: simulationItemCount, limit: simulationLimit };
      default:
        return null;
    }
  };

  const hasMountedStage = (stageType) => Boolean(mountedStages[stageType]);

  const currentEditorSnapshot = useMemo(
    () =>
      buildLessonSnapshot({
        lessonData,
        sections,
        diagnosticQuestions: autoDiagnosticQuestions,
        reviewQuestions,
        finalQuestions,
        finalInstruction,
        roadmapStages,
        selectedSimulation,
      }),
    [
      lessonData,
      sections,
      autoDiagnosticQuestions,
      reviewQuestions,
      finalQuestions,
      finalInstruction,
      roadmapStages,
      selectedSimulation,
    ]
  );

  const confirmLeaveEditor = async (targetPathOrOptions) => {
    const forcePrompt =
      typeof targetPathOrOptions === 'object' && targetPathOrOptions !== null
        ? Boolean(targetPathOrOptions.forcePrompt)
        : false;

    if (!hasUnsavedChanges && !forcePrompt) return true;

    const hasChangesMessage = 'You have unsaved lesson changes. Leave this editor and discard them?';
    const genericMessage = 'Are you sure you want to exit lesson editing?';

    return themedConfirm({
      title: hasUnsavedChanges ? 'Discard Changes?' : 'Exit Editing?',
      message: hasUnsavedChanges ? hasChangesMessage : genericMessage,
      confirmText: 'Leave',
      cancelText: 'Stay',
      variant: 'danger'
    });
  };

  const navigateWithEditorGuard = async (path, options) => {
    const shouldLeave = await confirmLeaveEditor(options);
    if (!shouldLeave) return;
    navigate(path);
  };

  useEffect(() => {
    if (!snapshotReady) return;

    if (!baselineSnapshotRef.current) {
      baselineSnapshotRef.current = currentEditorSnapshot;
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(currentEditorSnapshot !== baselineSnapshotRef.current);
  }, [currentEditorSnapshot, snapshotReady]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      backGuardArmedRef.current = false;
      return;
    }

    const handlePopState = async () => {
      const shouldLeave = await themedConfirm({
        title: 'Discard Changes?',
        message: 'You have unsaved lesson changes. Leave this editor and discard them?',
        confirmText: 'Leave',
        cancelText: 'Stay',
        variant: 'danger'
      });

      if (shouldLeave) {
        backGuardArmedRef.current = false;
        window.removeEventListener('popstate', handlePopState);
        navigate(-1);
        return;
      }

      window.history.pushState({ addLessonGuard: true }, '', window.location.href);
    };

    if (!backGuardArmedRef.current) {
      window.history.pushState({ addLessonGuard: true }, '', window.location.href);
      backGuardArmedRef.current = true;
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasUnsavedChanges, navigate]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
      return;
    }

    baselineSnapshotRef.current = '';
    backGuardArmedRef.current = false;
    setHasUnsavedChanges(false);
    setSnapshotReady(!isEditMode);
    setIsCompletionLocked(false);

    if (isEditMode) {
      fetchLesson();
    }
  }, [user, navigate, id, isEditMode]);

  // Close toolbar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!activeTextarea) return;
      
      // Check if click is on a text field or the toolbar
      const isTextField = e.target.id && (
        e.target.id.startsWith('input-') || 
        e.target.id.startsWith('textarea-')
      );
      
      // Check if click is inside a contentEditable element (for double-clicks on text content)
      const isInsideContentEditable = e.target.closest('[contenteditable="true"]');
      
      const isToolbar = e.target.closest('.formatting-toolbar');
      
      if (!isTextField && !isInsideContentEditable && !isToolbar) {
        setActiveTextarea(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeTextarea]);

  // Enable wheel scrolling during drag
  useEffect(() => {
    if (!draggedSection) return;
    const handleWheelDuringDrag = (e) => {
      window.scrollBy({ top: e.deltaY, behavior: 'auto' });
    };
    window.addEventListener('wheel', handleWheelDuringDrag, { passive: true });
    return () => window.removeEventListener('wheel', handleWheelDuringDrag);
  }, [draggedSection]);

  // Close change material picker on outside click
  useEffect(() => {
    if (!changeMaterialPicker) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-material-picker]')) {
        setChangeMaterialPicker(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [changeMaterialPicker]);

  // Handle Tab key for indentation in contentEditable fields
  useEffect(() => {
    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return;
      const el = e.target;
      if (!el || el.contentEditable !== 'true') return;

      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode || null;
      const anchorElement = anchorNode
        ? (anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode)
        : null;
      const activeListItem = anchorElement?.closest?.('li');

      if (activeListItem) {
        // Match common editor behavior: Tab/Shift+Tab changes list nesting level.
        e.preventDefault();
        document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      
      e.preventDefault();
      if (e.shiftKey) {
        // Remove leading tab/spaces from current line
        const sel = selection;
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          const offset = range.startOffset;
          // Find start of current line
          let lineStart = text.lastIndexOf('\n', offset - 1) + 1;
          const lineText = text.substring(lineStart);
          if (lineText.startsWith('\t')) {
            node.textContent = text.substring(0, lineStart) + lineText.substring(1);
            const newOffset = Math.max(lineStart, offset - 1);
            range.setStart(node, newOffset);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } else if (lineText.startsWith('    ')) {
            node.textContent = text.substring(0, lineStart) + lineText.substring(4);
            const newOffset = Math.max(lineStart, offset - 4);
            range.setStart(node, newOffset);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      } else {
        document.execCommand('insertText', false, '\t');
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, []);

  // Keep lesson title/description/objectives editable DOM in sync with state without re-render flicker
  useEffect(() => {
    const titleEl = lessonTitleRef.current;
    if (titleEl && document.activeElement !== titleEl) {
      const targetHtml = lessonData.ModuleTitle || '';
      if (titleEl.innerHTML !== targetHtml) {
        titleEl.innerHTML = targetHtml;
      }
    }

    const descriptionEl = descriptionRef.current;
    if (descriptionEl && document.activeElement !== descriptionEl) {
      const targetHtml = lessonData.Description || '';
      if (descriptionEl.innerHTML !== targetHtml) {
        descriptionEl.innerHTML = targetHtml;
      }
    }

    const objectivesEl = objectivesRef.current;
    if (objectivesEl && document.activeElement !== objectivesEl) {
      const targetHtml = lessonData.Objectives || '';
      if (objectivesEl.innerHTML !== targetHtml) {
        objectivesEl.innerHTML = targetHtml;
      }
    }
  }, [lessonData.ModuleTitle, lessonData.Description, lessonData.Objectives]);

  // Enable Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Ctrl/Cmd+Shift+Z) for contentEditable fields
  useEffect(() => {
    const handleUndoRedoKey = (e) => {
      const isModifier = e.ctrlKey || e.metaKey;
      if (!isModifier) return;

      const key = (e.key || '').toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      const activeEl = document.activeElement;
      const isContentEditable = activeEl && activeEl.getAttribute && activeEl.getAttribute('contenteditable') === 'true';
      if (!isContentEditable) return;

      e.preventDefault();

      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      document.execCommand(isRedo ? 'redo' : 'undo', false, null);
    };

    document.addEventListener('keydown', handleUndoRedoKey);
    return () => document.removeEventListener('keydown', handleUndoRedoKey);
  }, []);

  // Fetch available simulations for the simulation picker
  useEffect(() => {
    const fetchSimulations = async () => {
      try {
        const response = await axios.get('/simulations');
        setAvailableSimulations(response.data || []);
      } catch (err) {
        console.error('Error fetching simulations:', err);
      }
    };
    fetchSimulations();
  }, []);

  const fetchLesson = async () => {
    try {
      const [response, adminModulesResponse] = await Promise.all([
        axios.get(`/modules/${id}`),
        axios.get('/admin/modules').catch(() => ({ data: [] }))
      ]);

      const adminLesson = Array.isArray(adminModulesResponse?.data)
        ? adminModulesResponse.data.find((moduleItem) => Number(moduleItem?.ModuleID) === Number(id))
        : null;

      if (Array.isArray(adminModulesResponse?.data)) {
        const siblingLanguageMap = { English: null, Taglish: null };
        const sameLessonRows = adminModulesResponse.data.filter((moduleItem) => {
          return (
            Number(moduleItem?.LessonOrder) === Number(response.data?.LessonOrder) &&
            !normalizeBooleanFlag(moduleItem?.Is_Deleted)
          );
        });

        sameLessonRows.forEach((moduleItem) => {
          const normalizedLang = normalizeLessonLanguage(moduleItem?.LessonLanguage || 'English');
          const moduleId = Number(moduleItem?.ModuleID);
          if ((normalizedLang === 'English' || normalizedLang === 'Taglish') && Number.isFinite(moduleId) && moduleId > 0) {
            siblingLanguageMap[normalizedLang] = moduleId;
          }
        });

        const currentModuleId = Number(id);
        if (Number.isFinite(currentModuleId) && currentModuleId > 0) {
          const currentLang = normalizeLessonLanguage(
            adminLesson?.LessonLanguage || response.data?.LessonLanguage || 'English'
          );
          siblingLanguageMap[currentLang] = currentModuleId;
        }

        setLanguageModuleMap(siblingLanguageMap);
      } else {
        setLanguageModuleMap({ English: null, Taglish: null });
      }

      setIsCompletionLocked(normalizeBooleanFlag(adminLesson?.Is_Completed));

      console.log('Fetched lesson data:', response.data);
      console.log('Sections from DB:', response.data.sections);

      const { description, objectives } = splitDescriptionAndObjectives(response.data.Description || '');
      const existingSections = Array.isArray(response.data.sections) ? response.data.sections : [];
      const lessonReferenceLinks = normalizeReferenceLinks(
        existingSections
          .filter((section) => section?.type?.toLowerCase() === 'references')
          .map((section) => htmlToMultilineText(section.content || ''))
          .filter(Boolean)
          .join('\n')
      );
      
      const normalizedDifficulty = normalizeDifficulty(response.data.Difficulty);

      setLessonData({
        ModuleTitle: response.data.ModuleTitle,
        Description: description,
        Objectives: objectives,
        ReferenceLinks: formatReferenceLinksForEditor(lessonReferenceLinks),
        LessonOrder: Number.isFinite(Number(response.data.LessonOrder))
          ? Number(response.data.LessonOrder)
          : 1,
        Difficulty: normalizedDifficulty,
        LessonLanguage: normalizeLessonLanguage(
          adminLesson?.LessonLanguage || response.data.LessonLanguage || response.data.ModuleLanguage || 'English'
        ),
        LessonTime: normalizeLessonTime(response.data.LessonTime),
        Tesda_Reference: response.data.Tesda_Reference || ''
      });
      
      // Load sections if they exist
      if (response.data.sections) {
        console.log('Setting sections:', response.data.sections);

        const editableSections = response.data.sections.filter((section) => {
          const sectionType = section?.type?.toLowerCase();
          return sectionType !== 'references';
        });

        const apiBaseUrl = axios.defaults.baseURL || API_BASE_URL;
        const baseUrl = apiBaseUrl.replace('/api', '');
        const timestamp = new Date().getTime();

        const toDisplayUrl = (url) => {
          if (!url || typeof url !== 'string') return '';
          const normalizedUrl = url.replace(/\\/g, '/');
          const uploadPath = normalizedUrl.startsWith('uploads/') ? `/${normalizedUrl}` : normalizedUrl;
          if (url.startsWith('blob:')) return url;
          if (uploadPath.startsWith('http://') || uploadPath.startsWith('https://')) return uploadPath;
          if (uploadPath.startsWith('/uploads')) return `${baseUrl}${uploadPath}?t=${timestamp}`;
          return uploadPath;
        };

        const normalizeImageItem = (img) => {
          if (!img) return { url: '', file: null, fileName: '', caption: '' };
          if (typeof img === 'string') {
            return { url: toDisplayUrl(img), file: null, fileName: '', caption: '' };
          }
          return {
            ...img,
            url: toDisplayUrl(img.url || img.content || ''),
            file: null,
            fileName: img.fileName || '',
            caption: img.caption || ''
          };
        };
        
        // Process sections to ensure proper URLs and fields
        const processedSections = editableSections.map(section => {
          const normalizedSectionType = normalizeEditorSectionType(section?.type);
          const processed = { ...section, type: normalizedSectionType };

          if (processed.type === 'paragraph') {
            const normalizedTableData = normalizeTableData(section.tableData);
            const resolvedTableTitle = String(normalizedTableData?.title || section.tableTitle || '');
            processed.tableTitle = resolvedTableTitle;
            if (section.contentLayout === 'table') {
              processed.tableData = normalizedTableData
                ? { ...normalizedTableData, title: resolvedTableTitle }
                : { ...createDefaultTableData(), title: resolvedTableTitle };
            } else if (normalizedTableData) {
              processed.tableData = { ...normalizedTableData, title: resolvedTableTitle };
            }
          }
          
          // Ensure caption field exists for backward compatibility
          if (!processed.caption) {
            processed.caption = '';
          }

          if (processed.type === 'review-multiple-choice') {
            processed.questions = Array.isArray(section.questions)
              ? section.questions.map((question) => {
                  const normalizedQuestion = normalizeQuestionOptions(question);

                  return {
                    ...normalizedQuestion,
                  skill: normalizeSkillValue(question?.skill || question?.skillTag || 'Memorization', 'Memorization'),
                  questionType: normalizeQuestionTypeValue(question?.questionType || question?.type || 'Easy', 'Easy')
                  };
                })
              : [];
          }

          // Process images array if present
          if (processed.type === 'image') {
            if (Array.isArray(section.images) && section.images.length > 0) {
              processed.images = section.images.map(normalizeImageItem);
            } else if (section.content) {
              // Backward compatibility: older lessons may store a single image only in `content`.
              processed.images = [{ url: toDisplayUrl(section.content), file: null, fileName: '', caption: section.caption || '' }];
            } else {
              processed.images = [];
            }

            if (Array.isArray(section.layerImages) && section.layerImages.length > 0) {
              processed.layerImages = section.layerImages.map(layer =>
                (Array.isArray(layer) ? layer : [layer]).map(normalizeImageItem)
              );
            }
          }
          
          // Ensure layout field exists for image sections
          if (processed.type === 'image' && !processed.layout) {
            // Auto-assign layout based on existing images
            const imgCount = (processed.images || []).length;
            if (imgCount > 0 || processed.content) {
              processed.layout = imgCount <= 1 ? 'single' : imgCount === 2 ? 'side-by-side' : imgCount === 3 ? 'grid-3' : 'grid-2x2';
            } else {
              processed.layout = '';
            }
          }

          if (processed.type === 'image' && (processed.layout === 'text-left' || processed.layout === 'text-right')) {
            const fallbackSideTexts = section.sideText ? [String(section.sideText)] : [''];
            const normalizedSideTexts = Array.isArray(section.sideTexts) && section.sideTexts.length > 0
              ? section.sideTexts.map((text) => String(text || ''))
              : fallbackSideTexts;

            const fallbackLayerImages = (Array.isArray(processed.images) ? processed.images : []).map((image) => [image]);
            const normalizedLayerImages = Array.isArray(processed.layerImages) && processed.layerImages.length > 0
              ? processed.layerImages.map((layer) =>
                  (Array.isArray(layer) ? layer : [layer]).map((image) =>
                    normalizeImageItem(image)
                  )
                )
              : fallbackLayerImages;

            const layerCount = Math.max(normalizedSideTexts.length, normalizedLayerImages.length, 1);
            const normalizedLayers = Array.from({ length: layerCount }, (_, layerIdx) => {
              const layer = normalizedLayerImages[layerIdx];
              if (Array.isArray(layer) && layer.length > 0) {
                return layer;
              }
              return [{ url: '', file: null, fileName: '', caption: '' }];
            });

            processed.sideTexts = Array.from({ length: layerCount }, (_, layerIdx) =>
              String(normalizedSideTexts[layerIdx] || '')
            );
            processed.layerImages = normalizedLayers;

            if (!Array.isArray(processed.images) || processed.images.length === 0) {
              processed.images = normalizedLayers.map((layer) => layer[0] || { url: '', file: null, fileName: '', caption: '' });
            }
          }

          if ((processed.type === 'topic' || processed.type === 'subtopic') && !String(processed.title || '').trim()) {
            processed.title = String(processed.content || '');
          }
          
          // Convert server paths to full URLs for images and videos
          if ((processed.type === 'image' || processed.type === 'video') && section.content) {
            processed.content = toDisplayUrl(section.content);
          }
          
          return processed;
        });
        
        setSections(processedSections);
        console.log('Processed sections:', processedSections);
      } else {
        console.log('No sections found in response');
      }
      
      // Load assessment questions if they exist
      if (response.data.diagnosticQuestions) {
        setDiagnosticQuestions(response.data.diagnosticQuestions);
      }
      if (response.data.reviewQuestions) {
        setReviewQuestions(
          response.data.reviewQuestions.map((question) => {
            const normalizedQuestion = normalizeQuestionOptions(question);

            return {
              ...normalizedQuestion,
              skill: normalizeSkillValue(question?.skill || question?.skillTag || 'Memorization', 'Memorization'),
              questionType: normalizeQuestionTypeValue(question?.questionType || question?.type || 'Easy', 'Easy')
            };
          })
        );
      }
      if (response.data.finalQuestions) {
        setFinalQuestions(
          response.data.finalQuestions.map((question) => {
            const normalizedQuestion = normalizeQuestionOptions(question);

            return {
              ...normalizedQuestion,
              skill: normalizeSkillValue(question?.skill || question?.skillTag || 'Memorization', 'Memorization'),
              questionType: normalizeQuestionTypeValue(question?.questionType || question?.type || 'Situational', 'Situational')
            };
          })
        );
      }
      if (response.data.finalInstruction) {
        setFinalInstruction(response.data.finalInstruction);
      }
      const normalizedRoadmapStages = normalizeRoadmapStages(response.data.roadmapStages);
      if (normalizedRoadmapStages.length > 0) {
        setRoadmapStages(
          syncRoadmapStagesForLessonRules({
            stages: normalizedRoadmapStages,
            difficulty: normalizedDifficulty,
            lessonOrder: Number(response.data.LessonOrder),
          })
        );
      } else {
        setRoadmapStages(
          syncRoadmapStagesForLessonRules({
            stages: DEFAULT_ROADMAP_STAGES,
            difficulty: normalizedDifficulty,
            lessonOrder: Number(response.data.LessonOrder),
          })
        );
      }
    } catch (err) {
      console.error('Error fetching lesson:', err);
    } finally {
      setSnapshotReady(true);
    }
  };

  // Helper function to strip HTML tags and clean text (for plain text fields like titles)
  const stripHtml = (html) => {
    if (!html) return '';
    // Create a temporary element to parse HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Get text content (strips all HTML)
    let text = tmp.textContent || tmp.innerText || '';
    // Clean up extra whitespace and line breaks
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  };

  const htmlToMultilineText = (html) => {
    if (!html) return '';

    const normalized = String(html)
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, href, text) => {
        const label = String(text || '').replace(/<[^>]*>/g, '').trim();
        if (label && label !== href) {
          return `${label} - ${href}`;
        }
        return href;
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
      .replace(/<(p|div|li|h1|h2|h3|h4|h5|h6)[^>]*>/gi, '');

    const tmp = document.createElement('div');
    tmp.innerHTML = normalized;

    return (tmp.textContent || tmp.innerText || '')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n');
  };

  const stripReferenceListPrefix = (line = '') => {
    return String(line || '').replace(/^\s*(?:\d+[.)]\s+|[-*\u2022]\s+)/, '').trim();
  };

  const stripBlockedReferenceDomains = (line = '') => {
    return String(line || '')
      .replace(/\b(?:https?:\/\/)?(?:www\.)?chatgpt\.com(?:\/[^\s]*)?/gi, ' ')
      .replace(/\s*[-|:]+\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const formatReferenceLinksForEditor = (value = '') => {
    const normalizedValue = String(value || '').replace(/\r/g, '');
    if (!normalizedValue) {
      return '';
    }

    const hasTrailingNewLine = normalizedValue.endsWith('\n');
    const cleanedLines = normalizedValue
      .split('\n')
      .map((line) => stripBlockedReferenceDomains(stripReferenceListPrefix(line)))
      .filter(Boolean);

    if (!cleanedLines.length) {
      return '';
    }

    if (hasTrailingNewLine) {
      cleanedLines.push('');
    }

    return cleanedLines
      .map((line, index) => (line ? `${index + 1}. ${line}` : `${index + 1}. `))
      .join('\n');
  };

  const normalizeReferenceLinks = (value = '') => {
    return String(value || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => stripBlockedReferenceDomains(stripReferenceListPrefix(line)))
      .filter(Boolean)
      .join('\n');
  };

  const handleReferenceLinksChange = (event) => {
    const formattedReferenceLinks = formatReferenceLinksForEditor(event.target.value);
    setLessonData((prev) => ({
      ...prev,
      ReferenceLinks: formattedReferenceLinks
    }));
  };

  const normalizeLessonTime = (value) => {
    let parsed = value;

    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { hours: 0, minutes: 30 };
    }

    const hours = Number.isFinite(Number(parsed.hours)) ? Number(parsed.hours) : 0;
    const minutes = Number.isFinite(Number(parsed.minutes)) ? Number(parsed.minutes) : 30;

    return {
      hours: Math.max(0, Math.min(23, hours)),
      minutes: Math.max(0, Math.min(59, minutes)),
    };
  };

  const normalizeDifficulty = (value) => {
    const supported = ['Easy', 'Challenging', 'Advanced', 'Supplementary'];
    const normalized = String(value || '').trim().toLowerCase();

    const match = supported.find((level) => level.toLowerCase() === normalized);
    return match || 'Easy';
  };

  const normalizeLessonLanguage = (value) => {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === 'english') return 'English';
    if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

    return 'English';
  };

  const escapeHtmlEntities = (value = '') => {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const formatPlainTextSegment = (value = '') => {
    const escapedLine = escapeHtmlEntities(value);
    const withTabs = escapedLine.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    return withTabs.replace(/(^ +| +$| {2,})/g, (spaces) => '&nbsp;'.repeat(spaces.length));
  };

  const detectPlainTextListItem = (line = '') => {
    const normalizedLine = String(line || '');
    const leading = (normalizedLine.match(/^\s*/) || [''])[0];
    const indent = leading.replace(/\t/g, '    ').length;

    let markerMatch = normalizedLine.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (markerMatch) {
      return { tag: 'ol', style: 'decimal', indent, content: markerMatch[2] };
    }

    markerMatch = normalizedLine.match(/^\s*([a-z])[.)]\s+(.+)$/);
    if (markerMatch) {
      return { tag: 'ol', style: 'lower-alpha', indent, content: markerMatch[2] };
    }

    markerMatch = normalizedLine.match(/^\s*([A-Z])[.)]\s+(.+)$/);
    if (markerMatch) {
      return { tag: 'ol', style: 'upper-alpha', indent, content: markerMatch[2] };
    }

    markerMatch = normalizedLine.match(/^\s*[-]\s+(.+)$/);
    if (markerMatch) {
      return { tag: 'ul', style: 'none', indent, content: markerMatch[1] };
    }

    markerMatch = normalizedLine.match(/^\s*[•*]\s+(.+)$/);
    if (markerMatch) {
      return { tag: 'ul', style: 'disc', indent, content: markerMatch[1] };
    }

    return null;
  };

  const plainTextHasListMarkers = (value = '') => {
    return /(^|\n)\s*(?:\d+[.)]|[a-zA-Z][.)]|[•\-*])\s+\S/.test(String(value || ''));
  };

  const convertPlainTextToHtml = (value = '') => {
    const normalizedText = String(value || '').replace(/\r\n?/g, '\n');

    const lines = normalizedText.split('\n');
    const htmlParts = [];
    let activeList = null;

    const pushLineBreak = () => {
      if (htmlParts[htmlParts.length - 1] !== '<br>') {
        htmlParts.push('<br>');
      }
    };

    const pushBlock = (fragment = '') => {
      if (!fragment) return;
      if (htmlParts.length > 0 && htmlParts[htmlParts.length - 1] !== '<br>') {
        htmlParts.push('<br>');
      }
      htmlParts.push(fragment);
    };

    const closeActiveList = () => {
      if (!activeList || activeList.items.length === 0) {
        activeList = null;
        return;
      }

      const itemsHtml = activeList.items.map((item) => `<li>${item}</li>`).join('');
      const styleAttr = ` style="list-style-type: ${activeList.style}"`;
      pushBlock(`<${activeList.tag}${styleAttr}>${itemsHtml}</${activeList.tag}>`);
      activeList = null;
    };

    lines.forEach((line) => {
      if (!line.trim()) {
        closeActiveList();
        pushLineBreak();
        return;
      }

      const listItem = detectPlainTextListItem(line);
      if (listItem) {
        if (
          !activeList ||
          activeList.tag !== listItem.tag ||
          activeList.style !== listItem.style ||
          activeList.indent !== listItem.indent
        ) {
          closeActiveList();
          activeList = {
            tag: listItem.tag,
            style: listItem.style,
            indent: listItem.indent,
            items: [],
          };
        }

        activeList.items.push(formatPlainTextSegment(listItem.content));
        return;
      }

      if (activeList && activeList.items.length > 0) {
        const continuationIndent = ((line.match(/^\s*/) || [''])[0]).replace(/\t/g, '    ').length;
        if (continuationIndent > activeList.indent) {
          const lastIndex = activeList.items.length - 1;
          const continuation = formatPlainTextSegment(line.trim());
          activeList.items[lastIndex] = `${activeList.items[lastIndex]}<br>${continuation}`;
          return;
        }
      }

      closeActiveList();
      pushBlock(formatPlainTextSegment(line));
    });

    closeActiveList();
    return htmlParts.join('');
  };

  const getStyleValue = (styleText = '', propertyName = '') => {
    if (!styleText || !propertyName) return '';

    const declarations = styleText.split(';');
    for (const declaration of declarations) {
      const [prop, rawValue] = declaration.split(':');
      if (!prop || !rawValue) continue;
      if (prop.trim().toLowerCase() === propertyName.toLowerCase()) {
        return rawValue.trim();
      }
    }

    return '';
  };

  const sanitizeHref = (href = '') => {
    const trimmedHref = String(href || '').trim();
    if (!trimmedHref) return null;

    if (/^mailto:/i.test(trimmedHref)) {
      return trimmedHref;
    }

    try {
      const parsed = new URL(trimmedHref);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return parsed.toString();
      }
      return null;
    } catch {
      try {
        const parsed = new URL(`https://${trimmedHref}`);
        if (['http:', 'https:'].includes(parsed.protocol)) {
          return parsed.toString();
        }
      } catch {
        return null;
      }
    }

    return null;
  };

  const VIDEO_LINK_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

  const isVideoLinkHref = (href = '') => {
    const normalizedHref = String(href || '').toLowerCase();
    if (!normalizedHref) return false;

    if (
      normalizedHref.includes('youtube.com') ||
      normalizedHref.includes('youtu.be') ||
      normalizedHref.includes('vimeo.com') ||
      normalizedHref.includes('dropbox.com') ||
      normalizedHref.includes('dropboxusercontent.com') ||
      normalizedHref.includes('imgur.com') ||
      normalizedHref.includes('dailymotion.com') ||
      normalizedHref.includes('loom.com') ||
      normalizedHref.includes('/embed/')
    ) {
      return true;
    }

    return /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?|#|$)/i.test(normalizedHref);
  };

  const linkifyVideoLinksInHtml = (html = '') => {
    const source = String(html || '');
    if (!source || typeof document === 'undefined') return source;

    const container = document.createElement('div');
    container.innerHTML = source;

    const replaceTextNodeVideoLinks = (node) => {
      if (!node || node.nodeType !== Node.TEXT_NODE) return;

      const textValue = node.textContent || '';
      if (!textValue.trim()) return;

      const matcher = new RegExp(VIDEO_LINK_REGEX.source, 'gi');
      const matches = Array.from(textValue.matchAll(matcher));
      if (matches.length === 0) return;

      const fragment = document.createDocumentFragment();
      let cursor = 0;

      matches.forEach((match) => {
        const matchedText = String(match[0] || '');
        const startIndex = typeof match.index === 'number' ? match.index : cursor;

        if (startIndex > cursor) {
          fragment.appendChild(document.createTextNode(textValue.slice(cursor, startIndex)));
        }

        const href = sanitizeHref(matchedText);
        if (href && isVideoLinkHref(href)) {
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.textContent = matchedText;
          fragment.appendChild(anchor);
        } else {
          fragment.appendChild(document.createTextNode(matchedText));
        }

        cursor = startIndex + matchedText.length;
      });

      if (cursor < textValue.length) {
        fragment.appendChild(document.createTextNode(textValue.slice(cursor)));
      }

      node.parentNode?.replaceChild(fragment, node);
    };

    const traverseNode = (node) => {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        replaceTextNodeVideoLinks(node);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node;
      if (element.tagName?.toUpperCase() === 'A') return;

      Array.from(element.childNodes).forEach(traverseNode);
    };

    Array.from(container.childNodes).forEach(traverseNode);
    return container.innerHTML;
  };

  const sanitizeTextAlign = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    return ['left', 'center', 'right', 'justify'].includes(normalized) ? normalized : null;
  };

  const sanitizeListStyleType = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    return [
      'decimal',
      'lower-alpha',
      'upper-alpha',
      'lower-roman',
      'upper-roman',
      'disc',
      'circle',
      'square',
      'none'
    ].includes(normalized)
      ? normalized
      : null;
  };

  const mapOrderedListTypeToStyle = (typeValue = '') => {
    const normalized = String(typeValue || '').trim();
    if (!normalized) return null;

    switch (normalized) {
      case '1':
        return 'decimal';
      case 'a':
        return 'lower-alpha';
      case 'A':
        return 'upper-alpha';
      case 'i':
        return 'lower-roman';
      case 'I':
        return 'upper-roman';
      default:
        return null;
    }
  };

  const sanitizeInlineStyle = (tagName = '', styleText = '') => {
    if (!styleText) return '';

    const normalizedTagName = String(tagName || '').toUpperCase();
    const styleRules = [];

    const textAlign = sanitizeTextAlign(getStyleValue(styleText, 'text-align'));

    if (textAlign && ['P', 'DIV', 'BLOCKQUOTE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(normalizedTagName)) {
      styleRules.push(`text-align: ${textAlign}`);
    }

    return styleRules.length > 0 ? ` style="${styleRules.join('; ')}"` : '';
  };

  // Helper to sanitize HTML - keeps only safe formatting tags for content areas
  // Handles paste from external sources (Word, Google Docs) preserving formatting
  const sanitizeHtml = (html) => {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    
    const allowedTags = ['B', 'STRONG', 'I', 'EM', 'U', 'A', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'SPAN', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SUB', 'SUP'];
    
    // Helper to check if a style indicates bold (not normal weight)
    const isBoldStyle = (style) => {
      if (!style) return false;
      const match = style.match(/font-weight\s*:\s*([^;]+)/);
      if (!match) return false;
      const val = match[1].trim().toLowerCase();
      // normal/400/lighter/100-499 are NOT bold
      if (val === 'normal' || val === 'lighter' || val === 'inherit') return false;
      const num = parseInt(val, 10);
      if (!isNaN(num)) return num >= 700;
      return val === 'bold' || val === 'bolder';
    };

    const isItalicStyle = (style) => {
      if (!style) return false;
      const match = style.match(/font-style\s*:\s*([^;]+)/);
      if (!match) return false;
      const val = match[1].trim().toLowerCase();
      return val === 'italic' || val === 'oblique';
    };

    const isUnderlineStyle = (style) => {
      if (!style) return false;
      const match = style.match(/text-decoration[^:]*:\s*([^;]+)/);
      if (!match) return false;
      return match[1].toLowerCase().includes('underline');
    };

    const cleanNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtmlEntities(node.textContent || '');
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toUpperCase();
        const style = node.getAttribute('style') || '';
        const styleAttr = sanitizeInlineStyle(tagName, style);
        const children = Array.from(node.childNodes).map(cleanNode).join('');
        const visibleChildren = children
          .replace(/<br\s*\/?>(\s*)/gi, '')
          .replace(/&nbsp;/gi, '')
          .trim();
        const hasVisibleChildren = visibleChildren.length > 0;
        const canKeepEmpty = [
          'BR',
          'P',
          'DIV',
          'UL',
          'OL',
          'LI',
          'BLOCKQUOTE',
          'H1',
          'H2',
          'H3',
          'H4',
          'H5',
          'H6'
        ].includes(tagName);

        if (!hasVisibleChildren && !canKeepEmpty) return '';
        
        if (allowedTags.includes(tagName)) {
          if (tagName === 'BR') return '<br>';
          if (tagName === 'A') {
            const href = sanitizeHref(node.getAttribute('href') || '');
            if (!href) return children;
            const linkText = hasVisibleChildren ? children : escapeHtmlEntities(href);
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
          }
          if (tagName === 'UL') {
            const inlineListType = sanitizeListStyleType(getStyleValue(style, 'list-style-type'));
            const firstLi = Array.from(node.children || []).find((child) => child.tagName?.toUpperCase?.() === 'LI');
            const firstLiListType = firstLi
              ? sanitizeListStyleType(getStyleValue(firstLi.getAttribute('style') || '', 'list-style-type'))
              : null;
            const resolvedUnorderedListType = inlineListType || firstLiListType || 'disc';
            return hasVisibleChildren
              ? `<ul style="list-style-type: ${resolvedUnorderedListType}">${children}</ul>`
              : `<ul style="list-style-type: ${resolvedUnorderedListType}"><li><br></li></ul>`;
          }
          if (tagName === 'OL') {
            const inlineListType = sanitizeListStyleType(getStyleValue(style, 'list-style-type'));
            const listTypeFromAttribute = mapOrderedListTypeToStyle(node.getAttribute('type') || '');
            const firstLi = Array.from(node.children || []).find((child) => child.tagName?.toUpperCase?.() === 'LI');
            const firstLiListType = firstLi
              ? sanitizeListStyleType(getStyleValue(firstLi.getAttribute('style') || '', 'list-style-type'))
              : null;
            const resolvedOrderedListType = inlineListType || listTypeFromAttribute || firstLiListType || 'decimal';
            const olStyleAttr = ` style="list-style-type: ${resolvedOrderedListType}"`;
            return hasVisibleChildren
              ? `<ol${olStyleAttr}>${children}</ol>`
              : `<ol${olStyleAttr}><li><br></li></ol>`;
          }
          if (tagName === 'LI') {
            return hasVisibleChildren
              ? `<li${styleAttr}>${children}</li>`
              : `<li${styleAttr}><br></li>`;
          }
          // For B/STRONG/I/EM/U: check if style overrides the tag to normal
          // Google Docs uses <b style="font-weight:normal"> for non-bold text
          if (tagName === 'B' || tagName === 'STRONG') {
            const weightMatch = style.match(/font-weight\s*:\s*([^;]+)/);
            if (weightMatch) {
              const val = weightMatch[1].trim().toLowerCase();
              const num = parseInt(val, 10);
              if (val === 'normal' || val === 'lighter' || (!isNaN(num) && num < 700)) {
                return children; // Style overrides to non-bold, skip <b> tag
              }
            }
            return `<b>${children}</b>`;
          }
          if (tagName === 'I' || tagName === 'EM') {
            if (style.includes('font-style') && style.match(/font-style\s*:\s*normal/)) {
              return children; // Style overrides to non-italic
            }
            return `<i>${children}</i>`;
          }
          if (tagName === 'U') {
            if (style.includes('text-decoration') && style.match(/text-decoration[^:]*:\s*none/)) {
              return children; // Style overrides to no underline
            }
            return `<u>${children}</u>`;
          }
          if (tagName === 'SUB') return `<sub>${children}</sub>`;
          if (tagName === 'SUP') return `<sup>${children}</sup>`;
          if (/^H[1-6]$/.test(tagName)) {
            return hasVisibleChildren
              ? `<p${styleAttr}><b>${children}</b></p>`
              : `<p${styleAttr}><br></p>`;
          }
          if (tagName === 'BLOCKQUOTE') {
            return hasVisibleChildren
              ? `<blockquote${styleAttr}>${children}</blockquote>`
              : `<blockquote${styleAttr}><br></blockquote>`;
          }
          if (tagName === 'P') return hasVisibleChildren ? `<p${styleAttr}>${children}</p>` : `<p${styleAttr}><br></p>`;
          if (tagName === 'DIV') return hasVisibleChildren ? `<div${styleAttr}>${children}</div>` : `<div${styleAttr}><br></div>`;
          if (tagName === 'SPAN') return styleAttr ? `<span${styleAttr}>${children}</span>` : children;
          return children;
        }
        // Convert common external tags to allowed equivalents
        if (tagName === 'TABLE' || tagName === 'TBODY' || tagName === 'THEAD') return children;
        if (tagName === 'TR') return hasVisibleChildren ? `<p>${children}</p>` : '<p><br></p>';
        if (tagName === 'TD' || tagName === 'TH') return hasVisibleChildren ? `${children} ` : '';
        // Check inline styles for bold, italic, underline from non-allowed tags (e.g. <span>)
        let result = children;
        if (isBoldStyle(style)) result = `<b>${result}</b>`;
        if (isItalicStyle(style)) result = `<i>${result}</i>`;
        if (isUnderlineStyle(style)) result = `<u>${result}</u>`;
        const containerStyle = sanitizeInlineStyle('DIV', style);
        if (containerStyle && hasVisibleChildren) {
          result = `<div${containerStyle}>${result}</div>`;
        }
        return result;
      }
      return '';
    };
    
    return cleanNode(tmp);
  };

  // Handle rich text paste for content areas (paragraph, caption)
  const handleRichPaste = (e, sectionId, field) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');
    
    if (html) {
      // Paste from rich source - sanitize and insert as HTML
      const clean = sanitizeHtml(html);
      if (clean) {
        const cleanHasSemanticList = /<(ol|ul|li)\b/i.test(clean);
        const usePlainTextListFallback = !cleanHasSemanticList && plainTextHasListMarkers(plainText);
        const normalizedPaste = usePlainTextListFallback ? convertPlainTextToHtml(plainText) : clean;

        document.execCommand('insertHTML', false, normalizedPaste);
        return;
      }
    }

    if (plainText) {
      // Preserve spacing and line breaks from plain text sources.
      document.execCommand('insertHTML', false, convertPlainTextToHtml(plainText));
    }
  };

  const handlePlainTextPaste = (e) => {
    e.preventDefault();
    const plainText = e.clipboardData.getData('text/plain');
    if (!plainText) return;
    document.execCommand('insertHTML', false, convertPlainTextToHtml(plainText));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLessonData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTimeChange = (type, value) => {
    setLessonData(prev => ({
      ...prev,
      LessonTime: {
        ...prev.LessonTime,
        [type]: parseInt(value) || 0
      }
    }));
  };

  const handleDifficultyChange = (difficulty) => {
    setLessonData(prev => ({
      ...prev,
      Difficulty: difficulty
    }));
  };

  const handleLessonLanguageChange = async (lessonLanguage) => {
    const normalizedLanguage = normalizeLessonLanguage(lessonLanguage);

    if (!isEditMode) {
      setLessonData(prev => ({
        ...prev,
        LessonLanguage: normalizedLanguage
      }));
      return;
    }

    const currentLanguage = normalizeLessonLanguage(lessonData.LessonLanguage || 'English');
    if (currentLanguage === normalizedLanguage) {
      return;
    }

    const targetModuleId = Number(languageModuleMap[normalizedLanguage]);
    if (Number.isFinite(targetModuleId) && targetModuleId > 0 && targetModuleId !== Number(id)) {
      navigateWithEditorGuard(`/admin/lessons/edit/${targetModuleId}`);
      return;
    }

    const shouldRelabelCurrent = await themedConfirm({
      title: `${normalizedLanguage} Lesson Not Found`,
      message: `No saved ${normalizedLanguage} version exists for Lesson ${lessonData.LessonOrder}. Change the language label of the current lesson instead?`,
      confirmText: 'Change Label',
      cancelText: 'Cancel',
      variant: 'warning'
    });

    if (!shouldRelabelCurrent) {
      return;
    }

    setLessonData(prev => ({
      ...prev,
      LessonLanguage: normalizedLanguage
    }));
  };

  const handleAddSection = () => {
    setShowSectionModal(true);
  };

  const toSimulationPickerPreview = (simulation = {}) => {
    const simulationId = simulation?.SimulationID || simulation?.id || null;
    if (!simulationId) return null;

    return {
      SimulationID: simulationId,
      SimulationTitle: simulation?.SimulationTitle || simulation?.title || 'Untitled Simulation',
      Description: simulation?.Description || '',
      ActivityType: simulation?.ActivityType || 'Interactive Exercise',
      MaxScore: Number(simulation?.MaxScore || 0),
      TimeLimit: Number(simulation?.TimeLimit || 0),
      SkillType: simulation?.SkillType || '',
      ModuleID: simulation?.ModuleID || null,
      SimulationOrder: simulation?.SimulationOrder || null,
    };
  };

  const openSimulationPickerForStage = () => {
    setSimulationPickerTargetSectionId(null);
    setShowSimulationPicker(true);
  };

  const openSimulationPickerForSection = (sectionId) => {
    setSimulationPickerTargetSectionId(sectionId);
    setShowSimulationPicker(true);
  };

  const closeSimulationPicker = () => {
    setShowSimulationPicker(false);
    setSimulationPickerTargetSectionId(null);
  };

  const handleSimulationPicked = (simulation) => {
    const normalizedSimulation = toSimulationPickerPreview(simulation);
    if (!normalizedSimulation) {
      closeSimulationPicker();
      return;
    }

    if (simulationPickerTargetSectionId !== null) {
      setSections((prevSections) =>
        prevSections.map((section) =>
          section.id === simulationPickerTargetSectionId
            ? {
                ...section,
                simulationId: normalizedSimulation.SimulationID,
                simulation: normalizedSimulation,
              }
            : section
        )
      );
    } else {
      setSelectedSimulation(normalizedSimulation);
    }

    closeSimulationPicker();
  };

  const handleAddQuestion = (type) => {
    if (type === 'diagnostic' && diagnosticQuestions.length >= diagnosticLimit) return;
    if (type === 'review' && reviewQuestions.length >= lessonReviewLimit) return;
    if (type === 'final' && finalQuestions.length >= finalAssessmentLimit) return;

    const defaultQuestionType = type === 'final' ? 'Situational' : 'Easy';

    const newQuestion = {
      id: Date.now(),
      question: '',
      skill: 'Memorization',
      options: ['', '', '', ''],
      correctAnswer: 0,
      questionType: defaultQuestionType
    };

    if (type === 'diagnostic') {
      setDiagnosticQuestions([...diagnosticQuestions, newQuestion]);
    } else if (type === 'review') {
      setReviewQuestions([...reviewQuestions, newQuestion]);
    } else if (type === 'final') {
      setFinalQuestions([...finalQuestions, newQuestion]);
    }
  };

  const handleDeleteQuestion = (type, questionId) => {
    if (type === 'diagnostic') {
      setDiagnosticQuestions(diagnosticQuestions.filter(q => q.id !== questionId));
    } else if (type === 'review') {
      setReviewQuestions(reviewQuestions.filter(q => q.id !== questionId));
    } else if (type === 'final') {
      setFinalQuestions(finalQuestions.filter(q => q.id !== questionId));
    }
  };

  const handleQuestionChange = (type, questionId, field, value) => {
    const updateQuestions = (questions) =>
      questions.map((q) => {
        if (q.id !== questionId) return q;

        if (field === 'questionType') {
          const fallback = type === 'final' ? 'Situational' : 'Easy';
          const normalizedQuestionType = normalizeQuestionTypeValue(value, fallback);
          return { ...q, questionType: normalizedQuestionType, type: normalizedQuestionType };
        }

        if (field === 'skill') {
          return {
            ...q,
            skill: normalizeSkillValue(value, normalizeSkillValue(q?.skill || q?.skillTag || 'Memorization', 'Memorization'))
          };
        }

        if (field === 'options') {
          const normalizedOptions = normalizeQuestionOptionsArray(value);
          const normalizedCorrectAnswer = resolveNormalizedCorrectAnswer(q, normalizedOptions);

          return {
            ...q,
            options: normalizedOptions,
            correctAnswer: normalizedCorrectAnswer,
          };
        }

        return { ...q, [field]: value };
      });

    if (type === 'diagnostic') {
      setDiagnosticQuestions(updateQuestions(diagnosticQuestions));
    } else if (type === 'review') {
      setReviewQuestions(updateQuestions(reviewQuestions));
    } else if (type === 'final') {
      setFinalQuestions(updateQuestions(finalQuestions));
    }
  };

  const handleOptionChange = (type, questionId, optionIndex, value) => {
    const updateQuestions = (questions) => 
      questions.map(q => {
        if (q.id === questionId) {
          const newOptions = [...q.options];
          newOptions[optionIndex] = value;
          return { ...q, options: newOptions };
        }
        return q;
      });

    if (type === 'diagnostic') {
      setDiagnosticQuestions(updateQuestions(diagnosticQuestions));
    } else if (type === 'review') {
      setReviewQuestions(updateQuestions(reviewQuestions));
    } else if (type === 'final') {
      setFinalQuestions(updateQuestions(finalQuestions));
    }
  };

  const handleDiagnosticQuestionTypeChange = (questionId, questionType) => {
    const normalizedQuestionType = normalizeQuestionTypeValue(questionType, 'Easy');

    setReviewQuestions((prevQuestions) =>
      prevQuestions.map((question) =>
        question.id === questionId
          ? { ...question, questionType: normalizedQuestionType, type: normalizedQuestionType }
          : question
      )
    );

    setSections((prevSections) =>
      prevSections.map((section) => {
        if (section?.type !== 'review-multiple-choice' || !Array.isArray(section.questions)) {
          return section;
        }

        let sectionChanged = false;
        const updatedQuestions = section.questions.map((question) => {
          if (question.id !== questionId) return question;
          sectionChanged = true;
          return { ...question, questionType: normalizedQuestionType, type: normalizedQuestionType };
        });

        return sectionChanged ? { ...section, questions: updatedQuestions } : section;
      })
    );
  };

  const handleAddMaterial = (type) => {
    const newSectionId = Date.now();
    const newSection = {
      id: newSectionId,
      type,
      title: '',
      tableTitle: type === 'paragraph' ? '' : undefined,
      content: '',
      caption: '',
      images: type === 'image' ? [] : undefined,
      layout: type === 'image' ? '' : undefined,
      contentLayout: type === 'paragraph' ? 'text' : undefined,
      tableData: type === 'paragraph' ? null : undefined,
      questions: type === 'review-multiple-choice' ? [] : undefined,
      simulationId: type === 'simulation' ? null : undefined,
      simulation: type === 'simulation' ? null : undefined,
      order: sections.length + 1
    };
    if (insertAtIndex !== null) {
      const updated = [...sections];
      updated.splice(insertAtIndex, 0, newSection);
      setSections(updated);
    } else {
      setSections([...sections, newSection]);
    }
    setShowSectionModal(false);
    setInsertAtIndex(null);

    if (type === 'simulation') {
      openSimulationPickerForSection(newSectionId);
    }
  };

  // Paragraph layout options
  const PARAGRAPH_LAYOUTS = [
    { id: 'text', label: 'Normal Text', desc: 'Standard paragraph content', icon: '📝' },
    { id: 'table', label: 'Table', desc: 'Structured table layout', icon: '📊' },
  ];

  // Paragraph layout picker state
  const [paragraphLayoutPicker, setParagraphLayoutPicker] = useState(null);

  const resolveTableTitle = (section = {}) => {
    return String(section?.tableData?.title || section?.tableTitle || '');
  };

  const handleTableTitleChange = (sectionId, value) => {
    const tableTitle = String(value || '');
    setSections(prev => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const normalizedTableData = normalizeTableData(s.tableData) || createDefaultTableData();
      return {
        ...s,
        tableTitle,
        tableData: {
          ...normalizedTableData,
          title: tableTitle,
        },
      };
    }));
  };

  const handleSelectParagraphLayout = (sectionId, layoutId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const tableTitle = resolveTableTitle(s);
      if (layoutId === 'table') {
        return {
          ...s,
          contentLayout: 'table',
          tableTitle,
          tableData: {
            ...(normalizeTableData(s.tableData) || createDefaultTableData()),
            title: tableTitle,
          },
        };
      }
      const normalizedTableData = normalizeTableData(s.tableData);
      return {
        ...s,
        contentLayout: layoutId,
        tableTitle,
        tableData: normalizedTableData
          ? { ...normalizedTableData, title: tableTitle }
          : normalizedTableData,
      };
    }));
    setParagraphLayoutPicker(null);
  };

  const handleAddTableToSection = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const tableTitle = resolveTableTitle(s);
      return {
        ...s,
        contentLayout: 'table',
        tableTitle,
        tableData: {
          ...(normalizeTableData(s.tableData) || createDefaultTableData()),
          title: tableTitle,
        },
      };
    }));
  };

  const handleTableHeaderChange = (sectionId, colIdx, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const newHeaders = [...s.tableData.headers];
      newHeaders[colIdx] = value;
      return { ...s, tableData: { ...s.tableData, headers: newHeaders } };
    }));
  };

  const handleTableCellChange = (sectionId, rowIdx, colIdx, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const newRows = s.tableData.rows.map((row, rIdx) => {
        if (rIdx !== rowIdx) return row;
        const newRow = [...row];
        newRow[colIdx] = value;
        return newRow;
      });
      return { ...s, tableData: { ...s.tableData, rows: newRows } };
    }));
  };

  const handleAddTableRow = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const colCount = s.tableData.headers.length;
      const brokenRowLines = normalizeTableLineBreakFlags(
        s.tableData.brokenRowLines,
        Math.max(0, s.tableData.rows.length - 1)
      );
      const newRows = [...s.tableData.rows, new Array(colCount).fill('')];
      const newRowCellSpans = newRows.map((_, rowIndex) => (
        rowIndex === newRows.length - 1
          ? new Array(colCount).fill(1)
          : normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[rowIndex], colCount)
      ));
      const newBrokenRowLines = normalizeTableLineBreakFlags(
        [...brokenRowLines, false],
        Math.max(0, newRows.length - 1)
      );

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rows: newRows,
          rowCellSpans: newRowCellSpans,
          brokenRowLines: newBrokenRowLines,
        }
      };
    }));
  };

  const handleInsertTableRow = (sectionId, rowIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const colCount = s.tableData.headers.length;
      const newRows = [...s.tableData.rows];
      const insertAt = Math.max(0, Math.min(rowIdx + 1, newRows.length));
      newRows.splice(insertAt, 0, new Array(colCount).fill(''));

      const sourceRowCellSpans = Array.isArray(s.tableData.rowCellSpans)
        ? [...s.tableData.rowCellSpans]
        : [];
      sourceRowCellSpans.splice(insertAt, 0, new Array(colCount).fill(1));
      const newRowCellSpans = newRows.map((_, currentRowIdx) =>
        normalizeTableHeaderSpans(sourceRowCellSpans[currentRowIdx], colCount)
      );
      const brokenRowLines = normalizeTableLineBreakFlags(
        s.tableData.brokenRowLines,
        Math.max(0, s.tableData.rows.length - 1)
      );
      const newBrokenRowLines = [...brokenRowLines];
      newBrokenRowLines.splice(insertAt, 0, false);

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rows: newRows,
          rowCellSpans: newRowCellSpans,
          brokenRowLines: normalizeTableLineBreakFlags(newBrokenRowLines, Math.max(0, newRows.length - 1)),
        }
      };
    }));
  };

  const handleRemoveTableRow = (sectionId, rowIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      if (s.tableData.rows.length <= 1) return s;

      const colCount = s.tableData.headers.length;
      const newRows = s.tableData.rows.filter((_, i) => i !== rowIdx);
      const remainingRowSpans = Array.isArray(s.tableData.rowCellSpans)
        ? s.tableData.rowCellSpans.filter((_, i) => i !== rowIdx)
        : [];
      const newRowCellSpans = newRows.map((_, currentRowIdx) =>
        normalizeTableHeaderSpans(remainingRowSpans[currentRowIdx], colCount)
      );
      const brokenRowLines = normalizeTableLineBreakFlags(
        s.tableData.brokenRowLines,
        Math.max(0, s.tableData.rows.length - 1)
      );
      const newBrokenRowLines = [...brokenRowLines];
      if (rowIdx === 0) {
        newBrokenRowLines.splice(0, 1);
      } else if (rowIdx === s.tableData.rows.length - 1) {
        newBrokenRowLines.splice(s.tableData.rows.length - 2, 1);
      } else {
        const mergedLineState = Boolean(newBrokenRowLines[rowIdx - 1] || newBrokenRowLines[rowIdx]);
        newBrokenRowLines.splice(rowIdx - 1, 2, mergedLineState);
      }

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rows: newRows,
          rowCellSpans: newRowCellSpans,
          brokenRowLines: normalizeTableLineBreakFlags(newBrokenRowLines, Math.max(0, newRows.length - 1)),
        }
      };
    }));
  };

  const handleMergeTableHeaderCell = (sectionId, colIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;

      const colCount = Math.max(
        s.tableData.headers.length,
        ...s.tableData.rows.map((row) => (Array.isArray(row) ? row.length : 0)),
        1
      );
      const nextHeaderSpans = normalizeTableHeaderSpans(s.tableData.headerSpans, colCount);
      if ((nextHeaderSpans[colIdx] || 0) <= 0) return s;

      const currentSpan = nextHeaderSpans[colIdx] || 1;
      let mergeTargetColIdx = colIdx + currentSpan;
      while (mergeTargetColIdx < colCount && nextHeaderSpans[mergeTargetColIdx] === 0) {
        mergeTargetColIdx += 1;
      }

      if (mergeTargetColIdx >= colCount) {
        return s;
      }

      const targetSpan = nextHeaderSpans[mergeTargetColIdx] || 1;
      nextHeaderSpans[colIdx] = currentSpan + targetSpan;
      for (let i = mergeTargetColIdx; i < Math.min(colCount, mergeTargetColIdx + targetSpan); i += 1) {
        nextHeaderSpans[i] = 0;
      }

      return {
        ...s,
        tableData: {
          ...s.tableData,
          headerSpans: nextHeaderSpans,
        }
      };
    }));
  };

  const handleUnmergeTableHeaderCell = (sectionId, colIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;

      const colCount = Math.max(
        s.tableData.headers.length,
        ...s.tableData.rows.map((row) => (Array.isArray(row) ? row.length : 0)),
        1
      );
      const nextHeaderSpans = normalizeTableHeaderSpans(s.tableData.headerSpans, colCount);
      const currentSpan = nextHeaderSpans[colIdx] || 0;
      if (currentSpan <= 1) {
        return s;
      }

      let splitTargetColIdx = colIdx + 1;
      while (splitTargetColIdx < colCount && nextHeaderSpans[splitTargetColIdx] === 0) {
        splitTargetColIdx += 1;
      }

      if (splitTargetColIdx >= colCount) {
        return s;
      }

      nextHeaderSpans[colIdx] = 1;
      nextHeaderSpans[splitTargetColIdx] = currentSpan - 1;

      return {
        ...s,
        tableData: {
          ...s.tableData,
          headerSpans: nextHeaderSpans,
        }
      };
    }));
  };

  const handleMergeTableRowCells = (sectionId, rowIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData || rowIdx < 0 || rowIdx >= s.tableData.rows.length) return s;

      const colCount = Math.max(
        s.tableData.headers.length,
        ...s.tableData.rows.map((row) => (Array.isArray(row) ? row.length : 0)),
        1
      );
      const nextRowSpans = normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[rowIdx], colCount);
      const mergeStartColIdx = nextRowSpans.findIndex((span) => span > 0);
      if (mergeStartColIdx < 0) {
        return s;
      }

      const currentSpan = nextRowSpans[mergeStartColIdx] || 1;
      let mergeTargetColIdx = mergeStartColIdx + currentSpan;
      while (mergeTargetColIdx < colCount && nextRowSpans[mergeTargetColIdx] === 0) {
        mergeTargetColIdx += 1;
      }

      if (mergeTargetColIdx >= colCount) {
        return s;
      }

      const targetSpan = nextRowSpans[mergeTargetColIdx] || 1;
      nextRowSpans[mergeStartColIdx] = currentSpan + targetSpan;
      for (let i = mergeTargetColIdx; i < Math.min(colCount, mergeTargetColIdx + targetSpan); i += 1) {
        nextRowSpans[i] = 0;
      }

      const newRowCellSpans = s.tableData.rows.map((_, currentRowIdx) =>
        currentRowIdx === rowIdx
          ? nextRowSpans
          : normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[currentRowIdx], colCount)
      );

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rowCellSpans: newRowCellSpans,
        }
      };
    }));
  };

  const handleUnmergeTableRowCells = (sectionId, rowIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData || rowIdx < 0 || rowIdx >= s.tableData.rows.length) return s;

      const colCount = Math.max(
        s.tableData.headers.length,
        ...s.tableData.rows.map((row) => (Array.isArray(row) ? row.length : 0)),
        1
      );
      const nextRowSpans = normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[rowIdx], colCount);
      const splitStartColIdx = nextRowSpans.findIndex((span) => span > 1);
      if (splitStartColIdx < 0) {
        return s;
      }

      const currentSpan = nextRowSpans[splitStartColIdx] || 0;
      let splitTargetColIdx = splitStartColIdx + 1;
      while (splitTargetColIdx < colCount && nextRowSpans[splitTargetColIdx] === 0) {
        splitTargetColIdx += 1;
      }

      if (splitTargetColIdx >= colCount) {
        return s;
      }

      nextRowSpans[splitStartColIdx] = 1;
      nextRowSpans[splitTargetColIdx] = currentSpan - 1;

      const newRowCellSpans = s.tableData.rows.map((_, currentRowIdx) =>
        currentRowIdx === rowIdx
          ? nextRowSpans
          : normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[currentRowIdx], colCount)
      );

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rowCellSpans: newRowCellSpans,
        }
      };
    }));
  };

  const handleMergeTableColumnCells = (sectionId, colIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;

      const colCount = Math.max(
        s.tableData.headers.length,
        ...s.tableData.rows.map((row) => (Array.isArray(row) ? row.length : 0)),
        1
      );

      let didMerge = false;
      const newRowCellSpans = s.tableData.rows.map((_, rowIdx) => {
        const nextRowSpans = normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[rowIdx], colCount);
        if ((nextRowSpans[colIdx] || 0) <= 0) {
          return nextRowSpans;
        }

        const currentSpan = nextRowSpans[colIdx] || 1;
        let mergeTargetColIdx = colIdx + currentSpan;
        while (mergeTargetColIdx < colCount && nextRowSpans[mergeTargetColIdx] === 0) {
          mergeTargetColIdx += 1;
        }

        if (mergeTargetColIdx >= colCount) {
          return nextRowSpans;
        }

        const targetSpan = nextRowSpans[mergeTargetColIdx] || 1;
        nextRowSpans[colIdx] = currentSpan + targetSpan;
        for (let i = mergeTargetColIdx; i < Math.min(colCount, mergeTargetColIdx + targetSpan); i += 1) {
          nextRowSpans[i] = 0;
        }
        didMerge = true;
        return nextRowSpans;
      });

      if (!didMerge) {
        return s;
      }

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rowCellSpans: newRowCellSpans,
        }
      };
    }));
  };

  const handleUnmergeTableColumnCells = (sectionId, colIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;

      const colCount = Math.max(
        s.tableData.headers.length,
        ...s.tableData.rows.map((row) => (Array.isArray(row) ? row.length : 0)),
        1
      );

      let didUnmerge = false;
      const newRowCellSpans = s.tableData.rows.map((_, rowIdx) => {
        const nextRowSpans = normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[rowIdx], colCount);
        const currentSpan = nextRowSpans[colIdx] || 0;
        if (currentSpan <= 1) {
          return nextRowSpans;
        }

        let splitTargetColIdx = colIdx + 1;
        while (splitTargetColIdx < colCount && nextRowSpans[splitTargetColIdx] === 0) {
          splitTargetColIdx += 1;
        }

        if (splitTargetColIdx >= colCount) {
          return nextRowSpans;
        }

        nextRowSpans[colIdx] = 1;
        nextRowSpans[splitTargetColIdx] = currentSpan - 1;
        didUnmerge = true;
        return nextRowSpans;
      });

      if (!didUnmerge) {
        return s;
      }

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rowCellSpans: newRowCellSpans,
        }
      };
    }));
  };

  const handleMoveTableColumn = (sectionId, colIdx, direction) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;

      const colCount = s.tableData.headers.length;
      const targetColIdx = direction === 'left' ? colIdx - 1 : colIdx + 1;
      if (targetColIdx < 0 || targetColIdx >= colCount) {
        return s;
      }

      const moveColumnInArray = (sourceArray = []) => {
        const nextArray = [...sourceArray];
        const [movedValue] = nextArray.splice(colIdx, 1);
        nextArray.splice(targetColIdx, 0, movedValue);
        return nextArray;
      };

      const moveSpanColumns = (rawSpans) => {
        const normalizedSpans = normalizeTableHeaderSpans(rawSpans, colCount);
        const movedSpans = moveColumnInArray(normalizedSpans);
        return normalizeTableHeaderSpans(movedSpans, colCount);
      };

      const newHeaders = moveColumnInArray(s.tableData.headers);
      const newRows = s.tableData.rows.map((row) => moveColumnInArray(row));
      const newHeaderSpans = moveSpanColumns(s.tableData.headerSpans);
      const newRowCellSpans = s.tableData.rows.map((_, rowIdx) =>
        moveSpanColumns(s.tableData.rowCellSpans?.[rowIdx])
      );

      return {
        ...s,
        tableData: {
          ...s.tableData,
          headers: newHeaders,
          rows: newRows,
          headerSpans: newHeaderSpans,
          rowCellSpans: newRowCellSpans,
          brokenColumnLines: new Array(Math.max(0, newHeaders.length - 1)).fill(false),
        }
      };
    }));
  };

  const handleMoveTableRow = (sectionId, rowIdx, direction) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;

      const targetRowIdx = direction === 'up' ? rowIdx - 1 : rowIdx + 1;
      if (targetRowIdx < 0 || targetRowIdx >= s.tableData.rows.length) {
        return s;
      }

      const moveRowInArray = (sourceArray = []) => {
        const nextArray = [...sourceArray];
        const [movedValue] = nextArray.splice(rowIdx, 1);
        nextArray.splice(targetRowIdx, 0, movedValue);
        return nextArray;
      };

      return {
        ...s,
        tableData: {
          ...s.tableData,
          rows: moveRowInArray(s.tableData.rows),
          rowCellSpans: moveRowInArray(
            s.tableData.rows.map((_, currentRowIdx) =>
              normalizeTableHeaderSpans(s.tableData.rowCellSpans?.[currentRowIdx], s.tableData.headers.length)
            )
          ),
          brokenRowLines: new Array(Math.max(0, s.tableData.rows.length - 1)).fill(false),
        }
      };
    }));
  };

  const handleAddTableColumn = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const colCount = s.tableData.headers.length;
      const newHeaders = [...s.tableData.headers, `Header ${s.tableData.headers.length + 1}`];
      const newRows = s.tableData.rows.map(row => [...row, '']);
      const newHeaderSpans = insertTableSpanColumn(s.tableData.headerSpans, colCount, colCount);
      const newRowCellSpans = s.tableData.rows.map((_, rowIndex) =>
        insertTableSpanColumn(s.tableData.rowCellSpans?.[rowIndex], colCount, colCount)
      );
      const brokenColumnLines = normalizeTableLineBreakFlags(
        s.tableData.brokenColumnLines,
        Math.max(0, colCount - 1)
      );
      const newBrokenColumnLines = normalizeTableLineBreakFlags(
        [...brokenColumnLines, false],
        Math.max(0, newHeaders.length - 1)
      );

      return {
        ...s,
        tableData: {
          ...s.tableData,
          headers: newHeaders,
          rows: newRows,
          headerSpans: newHeaderSpans,
          rowCellSpans: newRowCellSpans,
          brokenColumnLines: newBrokenColumnLines,
        }
      };
    }));
  };

  const handleInsertTableColumn = (sectionId, colIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      const colCount = s.tableData.headers.length;
      const normalizedHeaderSpans = normalizeTableHeaderSpans(
        s.tableData.headerSpans,
        colCount
      );
      const colSpan = normalizedHeaderSpans[colIdx] > 0 ? normalizedHeaderSpans[colIdx] : 1;
      const insertAt = Math.max(0, Math.min(colIdx + colSpan, colCount));
      const newHeaders = [...s.tableData.headers];
      newHeaders.splice(insertAt, 0, `Header ${colCount + 1}`);
      const newRows = s.tableData.rows.map(row => {
        const nextRow = [...row];
        nextRow.splice(insertAt, 0, '');
        return nextRow;
      });

      const newHeaderSpans = insertTableSpanColumn(s.tableData.headerSpans, insertAt, colCount);
      const newRowCellSpans = s.tableData.rows.map((_, rowIndex) =>
        insertTableSpanColumn(s.tableData.rowCellSpans?.[rowIndex], insertAt, colCount)
      );
      const brokenColumnLines = normalizeTableLineBreakFlags(
        s.tableData.brokenColumnLines,
        Math.max(0, colCount - 1)
      );
      const newBrokenColumnLines = [...brokenColumnLines];
      newBrokenColumnLines.splice(insertAt, 0, false);

      return {
        ...s,
        tableData: {
          ...s.tableData,
          headers: newHeaders,
          rows: newRows,
          headerSpans: newHeaderSpans,
          rowCellSpans: newRowCellSpans,
          brokenColumnLines: normalizeTableLineBreakFlags(newBrokenColumnLines, Math.max(0, newHeaders.length - 1)),
        }
      };
    }));
  };

  const handleRemoveTableColumn = (sectionId, colIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId || !s.tableData) return s;
      if (s.tableData.headers.length <= 1) return s;
      const colCount = s.tableData.headers.length;

      const normalizedHeaderSpans = normalizeTableHeaderSpans(
        s.tableData.headerSpans,
        colCount
      );

      if (normalizedHeaderSpans[colIdx] <= 0) {
        return s;
      }

      const newHeaders = s.tableData.headers.filter((_, i) => i !== colIdx);
      const newRows = s.tableData.rows.map(row => row.filter((_, i) => i !== colIdx));
      const newHeaderSpans = removeTableSpanColumn(s.tableData.headerSpans, colIdx, colCount);
      const newRowCellSpans = s.tableData.rows.map((_, rowIndex) =>
        removeTableSpanColumn(s.tableData.rowCellSpans?.[rowIndex], colIdx, colCount)
      );
      const brokenColumnLines = normalizeTableLineBreakFlags(
        s.tableData.brokenColumnLines,
        Math.max(0, colCount - 1)
      );
      const newBrokenColumnLines = [...brokenColumnLines];
      if (colIdx === 0) {
        newBrokenColumnLines.splice(0, 1);
      } else if (colIdx === colCount - 1) {
        newBrokenColumnLines.splice(colCount - 2, 1);
      } else {
        const mergedLineState = Boolean(newBrokenColumnLines[colIdx - 1] || newBrokenColumnLines[colIdx]);
        newBrokenColumnLines.splice(colIdx - 1, 2, mergedLineState);
      }

      return {
        ...s,
        tableData: {
          ...s.tableData,
          headers: newHeaders,
          rows: newRows,
          headerSpans: newHeaderSpans,
          rowCellSpans: newRowCellSpans,
          brokenColumnLines: normalizeTableLineBreakFlags(newBrokenColumnLines, Math.max(0, newHeaders.length - 1)),
        }
      };
    }));
  };

  // Image collage layout options
  const IMAGE_LAYOUTS = [
    { id: 'single', label: 'Single Image', desc: 'One image at full width', slots: 1, icon: '🖼️' },
    { id: 'side-by-side', label: 'Side by Side', desc: 'Two equal images in a row', slots: 2, icon: '◧◨' },
    { id: 'grid-2x2', label: '2 × 2 Grid', desc: 'Four images in a square grid', slots: 4, icon: '⊞' },
    { id: 'grid-3', label: '3 Column', desc: 'Three equal images in one row', slots: 3, icon: '▤▤▤' },
    { id: 'one-plus-two', label: '1 + 2 Collage', desc: 'One large image on top, two smaller below', slots: 3, icon: '🔲▫▫' },
    { id: 'two-plus-one', label: '2 + 1 Collage', desc: 'Two smaller on top, one large below', slots: 3, icon: '▫▫🔲' },
    { id: 'big-left', label: 'Big Left + 2 Right', desc: 'Large image on left, two stacked on right', slots: 3, icon: '◧▢▢' },
    { id: 'big-right', label: '2 Left + Big Right', desc: 'Two stacked on left, large image on right', slots: 3, icon: '▢▢◨' },
    { id: 'mosaic', label: 'Mosaic (5)', desc: 'One hero image with four smaller tiles', slots: 5, icon: '▦' },
    { id: 'text-left', label: 'Text Left + Image', desc: 'Text on the left half, image on the right half', slots: 1, icon: '📝🖼️' },
    { id: 'text-right', label: 'Image + Text Right', desc: 'Image on the left half, text on the right half', slots: 1, icon: '🖼️📝' },
  ];

  const handleSelectImageLayout = (sectionId, layout) => {
    const slots = layout.slots;
    setSections(prevSections => prevSections.map(section => {
      if (section.id !== sectionId) return section;
      // Create image slots based on layout
      const currentImages = Array.isArray(section.images) ? section.images : [];
      let newImages = [...currentImages];
      // Add slots if needed, keep existing images
      while (newImages.length < slots) {
        newImages.push({ url: '', file: null, fileName: '', caption: '' });
      }
      // For text+image layouts, initialize sideTexts and layerImages
      const updated = { ...section, layout: layout.id, images: newImages };
      if (layout.id === 'text-left' || layout.id === 'text-right') {
        const baseSideTexts = Array.isArray(section.sideTexts) && section.sideTexts.length > 0
          ? section.sideTexts
          : (section.sideText ? [section.sideText] : ['']);

        const baseLayerImages = Array.isArray(section.layerImages) && section.layerImages.length > 0
          ? section.layerImages
          : baseSideTexts.map((_, i) => {
              const img = newImages[i] || { url: '', file: null, fileName: '', caption: '' };
              return [img];
            });

        const layerCount = Math.max(baseSideTexts.length, baseLayerImages.length, 1);
        updated.sideTexts = Array.from({ length: layerCount }, (_, layerIdx) => String(baseSideTexts[layerIdx] || ''));
        updated.layerImages = Array.from({ length: layerCount }, (_, layerIdx) => {
          const layer = baseLayerImages[layerIdx];
          if (Array.isArray(layer) && layer.length > 0) {
            return layer;
          }
          return [{ url: '', file: null, fileName: '', caption: '' }];
        });
      }
      return updated;
    }));
    setLayoutPickerSection(null);
  };

  const isImageSlotFilled = (image) => {
    if (!image) return false;
    return Boolean(image.url || image.file || image.fileName || hasMeaningfulText(image.caption));
  };

  const closeLessonImageCropper = () => {
    setShowImageCropper(false);
    setImageToCrop(null);
    setImageCropTarget(null);
  };

  const revokeBlobUrlIfNeeded = (url) => {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  const openLessonImageCropper = (imageSource, target) => {
    if (!target) return;

    if (imageSource instanceof File || imageSource instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result);
        setImageCropTarget(target);
        setShowImageCropper(true);
      };
      reader.readAsDataURL(imageSource);
      return;
    }

    const sourceUrl = String(imageSource || '').trim();
    if (!sourceUrl) return;

    setImageToCrop(sourceUrl);
    setImageCropTarget(target);
    setShowImageCropper(true);
  };

  const handleSaveCroppedLessonImage = (croppedImageBlob) => {
    if (!imageCropTarget) return;

    const baseName = (imageCropTarget.originalName || 'lesson-image')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '_');
    const croppedFileName = `${baseName}_cropped.png`;
    const croppedFile = new File([croppedImageBlob], croppedFileName, {
      type: croppedImageBlob.type || 'image/png'
    });
    const croppedUrl = URL.createObjectURL(croppedImageBlob);

    if (imageCropTarget.kind === 'section-image-slot') {
      setSections((prevSections) =>
        prevSections.map((section) => {
          if (section.id !== imageCropTarget.sectionId) return section;

          const updatedImages = [...(section.images || [])];
          const existingImage = updatedImages[imageCropTarget.imageIndex] || {};
          revokeBlobUrlIfNeeded(existingImage.url);

          updatedImages[imageCropTarget.imageIndex] = {
            ...existingImage,
            url: croppedUrl,
            file: croppedFile,
            fileName: croppedFileName
          };

          return {
            ...section,
            images: updatedImages,
            content: updatedImages[0]?.url || '',
            file: updatedImages[0]?.file || null,
            fileName: updatedImages[0]?.fileName || ''
          };
        })
      );
    }

    if (imageCropTarget.kind === 'section-layer-image-slot') {
      setSections((prevSections) =>
        prevSections.map((section) => {
          if (section.id !== imageCropTarget.sectionId) return section;

          const updatedLayerImages = (section.layerImages || []).map((layer, layerIndex) => {
            if (layerIndex !== imageCropTarget.layerIdx) return layer;

            const updatedLayer = [...layer];
            const existingImage = updatedLayer[imageCropTarget.imageIndex] || {};
            revokeBlobUrlIfNeeded(existingImage.url);

            updatedLayer[imageCropTarget.imageIndex] = {
              ...existingImage,
              url: croppedUrl,
              file: croppedFile,
              fileName: croppedFileName
            };

            return updatedLayer;
          });

          return {
            ...section,
            layerImages: updatedLayerImages
          };
        })
      );
    }

    closeLessonImageCropper();
  };

  const handleEditImageSlot = (sectionId, imageIndex) => {
    const section = sections.find((item) => item.id === sectionId);
    const targetImage = section?.images?.[imageIndex];
    if (!targetImage?.url) return;

    openLessonImageCropper(targetImage.url, {
      kind: 'section-image-slot',
      sectionId,
      imageIndex,
      originalName: targetImage.fileName || `lesson-${sectionId}-image-${imageIndex + 1}`
    });
  };

  const handleEditLayerImage = (sectionId, layerIdx, imgIdx) => {
    const section = sections.find((item) => item.id === sectionId);
    const targetImage = section?.layerImages?.[layerIdx]?.[imgIdx];
    if (!targetImage?.url) return;

    openLessonImageCropper(targetImage.url, {
      kind: 'section-layer-image-slot',
      sectionId,
      layerIdx,
      imageIndex: imgIdx,
      originalName: targetImage.fileName || `lesson-${sectionId}-layer-${layerIdx + 1}-image-${imgIdx + 1}`
    });
  };

  const isQuestionFilled = (question) => {
    if (!question) return false;
    if (hasMeaningfulText(question.question)) return true;
    if (Array.isArray(question.options) && question.options.some((opt) => hasMeaningfulText(opt))) {
      return true;
    }
    return false;
  };

  const hasTableContent = (tableData) => {
    if (!tableData) return false;
    if (hasMeaningfulText(tableData.title || tableData.tableTitle)) return true;
    const headers = Array.isArray(tableData.headers) ? tableData.headers : [];
    const rows = Array.isArray(tableData.rows) ? tableData.rows : [];
    if (headers.some((header) => hasMeaningfulText(header))) return true;
    return rows.some((row) => Array.isArray(row) && row.some((cell) => hasMeaningfulText(cell)));
  };

  const isSectionFilled = (section) => {
    if (!section) return false;

    if (hasMeaningfulText(section.title) || hasMeaningfulText(section.content) || hasMeaningfulText(section.caption)) {
      return true;
    }

    if (section.type === 'paragraph' && hasMeaningfulText(section.tableData?.title || section.tableTitle)) {
      return true;
    }

    if (section.type === 'paragraph' && hasTableContent(section.tableData)) {
      return true;
    }

    if (section.type === 'image') {
      if (Array.isArray(section.images) && section.images.some((img) => isImageSlotFilled(img))) {
        return true;
      }
      if (Array.isArray(section.layerImages)) {
        const hasLayerImage = section.layerImages.some(
          (layer) => Array.isArray(layer) && layer.some((img) => isImageSlotFilled(img))
        );
        if (hasLayerImage) return true;
      }
      if (Array.isArray(section.sideTexts) && section.sideTexts.some((text) => hasMeaningfulText(text))) {
        return true;
      }
      if (hasMeaningfulText(section.sideText)) {
        return true;
      }
    }

    if (section.type === 'video' && Boolean(section.content || section.file || section.fileName)) {
      return true;
    }

    if (section.type === 'review-multiple-choice') {
      if (Array.isArray(section.questions) && section.questions.some((question) => isQuestionFilled(question))) {
        return true;
      }
    }

    if (
      (section.type === 'review-drag-drop' || section.type === 'simulation') &&
      Boolean(section.simulationId || section.simulation)
    ) {
      return true;
    }

    return false;
  };

  const isSectionTextareaActive = (activeFieldId, sectionId) => {
    const activeId = String(activeFieldId || '');
    const normalizedSectionId = String(sectionId || '');

    if (!activeId || !normalizedSectionId) return false;

    return (
      activeId === `input-topic-${normalizedSectionId}` ||
      activeId === `input-subtopic-${normalizedSectionId}` ||
      activeId === `textarea-${normalizedSectionId}` ||
      activeId === `textarea-video-caption-${normalizedSectionId}` ||
      activeId.startsWith(`table-header-${normalizedSectionId}-`) ||
      activeId.startsWith(`table-cell-${normalizedSectionId}-`) ||
      activeId.startsWith(`sidetext-${normalizedSectionId}-`)
    );
  };

  // Text+Image layer helpers
  const handleAddTextImageLayer = (sectionId) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newTexts = [...(s.sideTexts || ['']), ''];
      const newLayerImages = [...(s.layerImages || [[{ url: '', file: null, fileName: '', caption: '' }]]), [{ url: '', file: null, fileName: '', caption: '' }]];
      return { ...s, sideTexts: newTexts, layerImages: newLayerImages };
    }));
  };

  const handleRemoveTextImageLayer = async (sectionId, layerIdx) => {
    const targetSection = sections.find((section) => section.id === sectionId);
    const layerText = targetSection?.sideTexts?.[layerIdx] || '';
    const layerImages = targetSection?.layerImages?.[layerIdx] || [];
    const layerHasContent = hasMeaningfulText(layerText) || layerImages.some((img) => isImageSlotFilled(img));

    if (layerHasContent) {
      const shouldRemoveLayer = await themedConfirm({
        title: 'Remove Layer?',
        message: 'This layer has content. Remove it anyway?',
        confirmText: 'Remove',
        cancelText: 'Keep',
        variant: 'danger'
      });
      if (!shouldRemoveLayer) return;
    }

    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const layerCount = (s.sideTexts || ['']).length;
      if (layerCount <= 1) return s;
      const newTexts = (s.sideTexts || ['']).filter((_, i) => i !== layerIdx);
      const newLayerImages = (s.layerImages || []).filter((_, i) => i !== layerIdx);
      return { ...s, sideTexts: newTexts, layerImages: newLayerImages };
    }));
  };

  const handleSideTextChange = (sectionId, layerIdx, value) => {
    const normalizedValue = linkifyVideoLinksInHtml(sanitizeHtml(String(value || '')));

    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newTexts = [...(s.sideTexts || [''])];
      newTexts[layerIdx] = normalizedValue;
      return { ...s, sideTexts: newTexts };
    }));
  };

  const handleClearSideText = async (sectionId, layerIdx) => {
    const targetSection = sections.find((section) => section.id === sectionId);
    const existingText =
      targetSection?.sideTexts?.[layerIdx] ?? (layerIdx === 0 ? targetSection?.sideText || '' : '');

    if (hasMeaningfulText(existingText)) {
      const shouldClearText = await themedConfirm({
        title: 'Clear Text?',
        message: 'This text area has content. Clear it anyway?',
        confirmText: 'Clear',
        cancelText: 'Keep',
        variant: 'danger'
      });
      if (!shouldClearText) return;
    }

    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newTexts = [...(s.sideTexts || [''])];
      newTexts[layerIdx] = '';
      return { ...s, sideTexts: newTexts };
    }));

    const el = document.getElementById(`sidetext-${sectionId}-${layerIdx}`);
    if (el) el.innerHTML = '';
  };

  const handleAddLayerImage = (sectionId, layerIdx) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, i) => {
        if (i !== layerIdx) return layer;
        return [...layer, { url: '', file: null, fileName: '', caption: '' }];
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleRemoveLayerImage = async (sectionId, layerIdx, imgIdx) => {
    const targetImage = sections.find((section) => section.id === sectionId)?.layerImages?.[layerIdx]?.[imgIdx];
    if (isImageSlotFilled(targetImage)) {
      const shouldRemoveImage = await themedConfirm({
        title: 'Remove Image?',
        message: 'This image slot has content. Remove it anyway?',
        confirmText: 'Remove',
        cancelText: 'Keep',
        variant: 'danger'
      });
      if (!shouldRemoveImage) return;
    }

    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, i) => {
        if (i !== layerIdx) return layer;
        if (layer.length <= 1) return layer;
        return layer.filter((_, j) => j !== imgIdx);
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleClearLayerImage = async (sectionId, layerIdx, imgIdx) => {
    const targetImage = sections.find((section) => section.id === sectionId)?.layerImages?.[layerIdx]?.[imgIdx];
    if (isImageSlotFilled(targetImage)) {
      const shouldClearImage = await themedConfirm({
        title: 'Clear Image?',
        message: 'This image slot has content. Clear it anyway?',
        confirmText: 'Clear',
        cancelText: 'Keep',
        variant: 'danger'
      });
      if (!shouldClearImage) return;
    }

    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, i) => {
        if (i !== layerIdx) return layer;
        const newLayer = [...layer];
        newLayer[imgIdx] = { url: '', file: null, fileName: '', caption: '' };
        return newLayer;
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleLayerImageUpload = (sectionId, layerIdx, imgIdx, event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      if (event?.target) event.target.value = '';
      return;
    }
    if (file.size / (1024 * 1024) > 10) {
      if (event?.target) event.target.value = '';
      return;
    }

    openLessonImageCropper(file, {
      kind: 'section-layer-image-slot',
      sectionId,
      layerIdx,
      imageIndex: imgIdx,
      originalName: file.name
    });

    if (event?.target) event.target.value = '';
  };

  const handleLayerImageCaptionChange = (sectionId, layerIdx, imgIdx, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newLayerImages = (s.layerImages || []).map((layer, li) => {
        if (li !== layerIdx) return layer;
        const newLayer = [...layer];
        const currentImage = newLayer[imgIdx] || { url: '', file: null, fileName: '', caption: '' };
        newLayer[imgIdx] = { ...currentImage, caption: value };
        return newLayer;
      });
      return { ...s, layerImages: newLayerImages };
    }));
  };

  const handleLayerPasteImage = (sectionId, layerIdx, imgIdx, e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file || file.size / (1024 * 1024) > 10) return;
        const fileUrl = URL.createObjectURL(file);
        setSections(prev => prev.map(s => {
          if (s.id !== sectionId) return s;
          const newLayerImages = (s.layerImages || []).map((layer, li) => {
            if (li !== layerIdx) return layer;
            const newLayer = [...layer];
            const existingImage = newLayer[imgIdx] || { caption: '' };
            newLayer[imgIdx] = {
              ...existingImage,
              url: fileUrl,
              file,
              fileName: file.name || 'pasted-image.png'
            };
            return newLayer;
          });
          return { ...s, layerImages: newLayerImages };
        }));
        return;
      }
    }
  };

  // Section-level question helpers (for review-multiple-choice sections)
  const handleAddSectionQuestion = (sectionId) => {
    if (lessonReviewCount >= 20) return;
    const newQ = {
      id: Date.now(),
      question: '',
      skill: 'Memorization',
      options: ['', '', '', ''],
      correctAnswer: 0,
      questionType: 'Easy'
    };
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: [...(s.questions || []), newQ] } : s));
  };

  const handleDeleteSectionQuestion = (sectionId, questionId) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: (s.questions || []).filter(q => q.id !== questionId) } : s));
  };

  const handleSectionQuestionChange = (sectionId, questionId, field, value) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;

      const updatedQuestions = (s.questions || []).map((q) => {
        if (q.id !== questionId) return q;

        if (field === 'questionType') {
          const normalizedQuestionType = normalizeQuestionTypeValue(value, 'Easy');
          return { ...q, questionType: normalizedQuestionType, type: normalizedQuestionType };
        }

        if (field === 'skill') {
          return {
            ...q,
            skill: normalizeSkillValue(value, normalizeSkillValue(q?.skill || q?.skillTag || 'Memorization', 'Memorization'))
          };
        }

        if (field === 'options') {
          const normalizedOptions = normalizeQuestionOptionsArray(value);
          const normalizedCorrectAnswer = resolveNormalizedCorrectAnswer(q, normalizedOptions);

          return {
            ...q,
            options: normalizedOptions,
            correctAnswer: normalizedCorrectAnswer,
          };
        }

        return { ...q, [field]: value };
      });

      return { ...s, questions: updatedQuestions };
    }));
  };

  const handleSectionOptionChange = (sectionId, questionId, optionIndex, value) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, questions: (s.questions || []).map(q => {
      if (q.id === questionId) { const newOpts = [...q.options]; newOpts[optionIndex] = value; return { ...q, options: newOpts }; }
      return q;
    }) } : s));
  };

  const handleDeleteSection = async (sectionId) => {
    const sectionToDelete = sections.find((section) => section.id === sectionId);
    if (sectionToDelete && isSectionFilled(sectionToDelete)) {
      const shouldDeleteSection = await themedConfirm({
        title: 'Delete Section?',
        message: 'This section has content. Delete it anyway?',
        confirmText: 'Delete',
        cancelText: 'Keep',
        variant: 'danger'
      });
      if (!shouldDeleteSection) return;
    }

    setSections((prevSections) => prevSections.filter((section) => section.id !== sectionId));
    setActiveTextarea((prevActiveTextarea) =>
      isSectionTextareaActive(prevActiveTextarea, sectionId) ? null : prevActiveTextarea
    );
  };

  const handleChangeMaterial = async (sectionId, newType) => {
    const sectionToChange = sections.find((section) => section.id === sectionId);
    if (sectionToChange && sectionToChange.type !== newType && isSectionFilled(sectionToChange)) {
      const shouldChangeMaterial = await themedConfirm({
        title: 'Change Material?',
        message: 'Changing material type will clear this section content. Continue?',
        confirmText: 'Change',
        cancelText: 'Cancel',
        variant: 'danger'
      });
      if (!shouldChangeMaterial) return;
    }

    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      if (s.type === newType) return s;
      return {
        id: s.id,
        type: newType,
        title: '',
        tableTitle: newType === 'paragraph' ? '' : undefined,
        content: '',
        caption: '',
        images: newType === 'image' ? [] : undefined,
        layout: newType === 'image' ? '' : undefined,
        contentLayout: newType === 'paragraph' ? 'text' : undefined,
        tableData: newType === 'paragraph' ? null : undefined,
        questions: newType === 'review-multiple-choice' ? [] : undefined,
        simulationId: newType === 'simulation' ? null : undefined,
        simulation: newType === 'simulation' ? null : undefined,
        order: s.order
      };
    }));
    setActiveTextarea((prevActiveTextarea) =>
      isSectionTextareaActive(prevActiveTextarea, sectionId) ? null : prevActiveTextarea
    );
    setChangeMaterialPicker(null);

    if (newType === 'simulation') {
      openSimulationPickerForSection(sectionId);
    }
  };

  const handleSectionContentChange = (sectionId, field, value) => {
    setSections(prevSections => prevSections.map(section => 
      section.id === sectionId 
        ? { ...section, [field]: value }
        : section
    ));
  };

  const normalizeVideoEmbedUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const value = String(rawUrl).trim();
    if (!value) return '';

    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname || '';

      if (host.includes('youtu.be')) {
        const videoId = pathname.replace('/', '').trim();
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }

      if (host.includes('youtube.com')) {
        if (pathname.includes('/embed/')) return parsed.toString();
        const videoId = parsed.searchParams.get('v');
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }

      if (host.includes('vimeo.com') && !pathname.includes('/video/')) {
        const videoId = pathname.split('/').filter(Boolean).pop();
        if (videoId) return `https://player.vimeo.com/video/${videoId}`;
      }

      if (host.includes('dropbox.com') || host.includes('dropboxusercontent.com')) {
        const directUrl = new URL(parsed.toString());

        if (host.includes('dropbox.com')) {
          directUrl.hostname = 'dl.dropboxusercontent.com';
        }

        directUrl.searchParams.delete('dl');
        directUrl.searchParams.set('raw', '1');
        return directUrl.toString();
      }

      if (host === 'imgur.com' || host.endsWith('.imgur.com')) {
        if (host.startsWith('i.')) {
          if (pathname.toLowerCase().endsWith('.gifv')) {
            return parsed.toString().replace(/\.gifv$/i, '.mp4');
          }
          return parsed.toString();
        }

        const pathParts = pathname.split('/').filter(Boolean);
        const isAlbumPath = pathParts[0] === 'a' || pathParts[0] === 'gallery';
        if (isAlbumPath) return parsed.toString();
        const candidateId = pathParts[pathParts.length - 1];

        if (candidateId) {
          const baseId = candidateId.replace(/\.(gifv|mp4|webm)$/i, '');
          return `https://i.imgur.com/${baseId}.mp4`;
        }
      }

      return parsed.toString();
    } catch {
      return value;
    }
  };

  const isEmbedVideoUrl = (url) => {
    if (!url) return false;

    try {
      const parsed = new URL(String(url));
      const host = parsed.hostname.toLowerCase();
      const value = parsed.toString().toLowerCase();
      return (
        host.includes('youtube.com') ||
        host.includes('youtu.be') ||
        host.includes('vimeo.com') ||
        value.includes('/embed/')
      );
    } catch {
      const value = String(url).toLowerCase();
      return value.includes('youtube') || value.includes('vimeo') || value.includes('/embed/');
    }
  };

  const isManagedUploadVideoUrl = (url) => {
    if (!url) return false;
    const value = String(url);
    return value.startsWith('blob:') || /(^|\/)uploads\//i.test(value);
  };

  const handleClearVideo = async (sectionId) => {
    const targetSection = sections.find((section) => section.id === sectionId);
    if (!targetSection) return;

    const hasVideoContent = Boolean(
      targetSection.content || targetSection.file || targetSection.fileName || hasMeaningfulText(targetSection.caption)
    );

    if (hasVideoContent) {
      const shouldClearVideo = await themedConfirm({
        title: 'Clear Video?',
        message: 'This video section has content. Clear it anyway?',
        confirmText: 'Clear',
        cancelText: 'Keep',
        variant: 'danger'
      });
      if (!shouldClearVideo) return;
    }

    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? { ...section, content: '', file: null, fileName: null, caption: '' }
          : section
      )
    );
  };

  const handleFileUpload = async (sectionId, event, fileType) => {
    const file = event.target.files[0];
    if (!file) return;

    // Define size limits in MB
    const MAX_IMAGE_SIZE = 10; // 10MB
    const MAX_VIDEO_SIZE = 100; // 100MB
    const maxSize = fileType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    const fileSizeMB = file.size / (1024 * 1024);

    // Validate file size
    if (fileSizeMB > maxSize) {
      console.error(`File size exceeds ${maxSize}MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
      event.target.value = ''; // Reset input
      return;
    }

    // Validate file type
    if (fileType === 'image' && !file.type.startsWith('image/')) {
      console.error('Please select a valid image file (PNG, JPG, GIF, etc.).');
      event.target.value = '';
      return;
    }

    if (fileType === 'video' && !file.type.startsWith('video/')) {
      console.error('Please select a valid video file (MP4, WebM, etc.).');
      event.target.value = '';
      return;
    }

    try {
      // Create object URL for local preview
      const fileUrl = URL.createObjectURL(file);
      
      // Store both the URL and file object
      setSections(sections.map(section => 
        section.id === sectionId 
          ? { ...section, content: fileUrl, file: file, fileName: file.name }
          : section
      ));
    } catch (err) {
      console.error('Error loading file:', err);
      event.target.value = '';
    }
  };

  const handlePasteImage = (sectionId, e, imageIndex) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) return;
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > 10) {
          console.error(`Image exceeds 10MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
          return;
        }
        const fileUrl = URL.createObjectURL(file);
        if (imageIndex !== undefined) {
          setSections(prev => prev.map(section => {
            if (section.id !== sectionId) return section;
            const imgs = [...(section.images || [])];
            imgs[imageIndex] = { url: fileUrl, file, fileName: file.name || 'pasted-image.png' };
            return { ...section, images: imgs, content: imgs[0]?.url || fileUrl, file: imgs[0]?.file || file, fileName: imgs[0]?.fileName || file.name };
          }));
        } else {
          setSections(prev => prev.map(section =>
            section.id === sectionId
              ? { ...section, content: fileUrl, file: file, fileName: file.name || 'pasted-image.png' }
              : section
          ));
        }
        return;
      }
    }
  };

  const handleAddImageSlot = (sectionId) => {
    setSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;
      const imgs = [...(section.images || [])];
      if (section.content && imgs.length === 0) {
        imgs.push({ url: section.content, file: section.file || null, fileName: section.fileName || '' });
      }
      imgs.push({ url: '', file: null, fileName: '', caption: '' });
      return { ...section, images: imgs };
    }));
  };

  const handleRemoveImageSlot = async (sectionId, imageIndex) => {
    const targetImage = sections.find((section) => section.id === sectionId)?.images?.[imageIndex];
    if (isImageSlotFilled(targetImage)) {
      const shouldRemoveImage = await themedConfirm({
        title: 'Remove Image?',
        message: 'This image slot has content. Remove it anyway?',
        confirmText: 'Remove',
        cancelText: 'Keep',
        variant: 'danger'
      });
      if (!shouldRemoveImage) return;
    }

    setSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;
      const imgs = [...(section.images || [])];
      imgs.splice(imageIndex, 1);
      const firstImg = imgs[0] || null;
      return {
        ...section,
        images: imgs.length > 0 ? imgs : [],
        content: firstImg?.url || '',
        file: firstImg?.file || null,
        fileName: firstImg?.fileName || ''
      };
    }));
  };

  const handleImageSlotUpload = (sectionId, imageIndex, event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      if (event?.target) event.target.value = '';
      return;
    }
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 10) {
      console.error(`Image exceeds 10MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
      if (event?.target) event.target.value = '';
      return;
    }

    openLessonImageCropper(file, {
      kind: 'section-image-slot',
      sectionId,
      imageIndex,
      originalName: file.name
    });

    if (event?.target) event.target.value = '';
  };

  const handleImageCaptionChange = (sectionId, imageIndex, value) => {
    setSections(prev => prev.map(section => {
      if (section.id !== sectionId) return section;
      const imgs = [...(section.images || [])];
      if (imgs[imageIndex]) {
        imgs[imageIndex] = { ...imgs[imageIndex], caption: value };
      }
      return { ...section, images: imgs };
    }));
  };

  const handleDragStart = (e, section) => {
    setDraggedSection(section);
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a clean, fully opaque drag image clone
    const sectionElement = e.target.closest('.bg-white.border-2');
    if (sectionElement) {
      const clone = sectionElement.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.opacity = '1';
      clone.style.transform = 'none';
      clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
      clone.style.width = sectionElement.offsetWidth + 'px';
      clone.style.background = 'white';
      clone.style.borderRadius = '8px';
      clone.style.zIndex = '99999';
      clone.style.pointerEvents = 'none';
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, sectionElement.offsetWidth / 2, sectionElement.offsetHeight / 2);
      setTimeout(() => { if (clone.parentNode) clone.parentNode.removeChild(clone); }, 0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Auto-scroll when dragging near edges
    const scrollMargin = 100;
    const scrollSpeed = 15;
    const mouseY = e.clientY;
    const windowHeight = window.innerHeight;
    
    if (mouseY < scrollMargin) {
      // Near top - scroll up
      window.scrollBy({ top: -scrollSpeed, behavior: 'auto' });
    } else if (mouseY > windowHeight - scrollMargin) {
      // Near bottom - scroll down
      window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
    }
  };

  const handleDragEnter = (e, section) => {
    e.preventDefault();
    if (draggedSection && draggedSection.id !== section.id) {
      setDragOverSection(section);
    }
  };

  const handleDrop = (e, targetSection) => {
    e.preventDefault();

    // Use dragOverSection if available (for preview accuracy), otherwise use targetSection
    const dropTarget = dragOverSection || targetSection;

    if (!draggedSection || !dropTarget || draggedSection.id === dropTarget.id) {
      setDragOverSection(null);
      return;
    }

    const draggedIndex = sections.findIndex(s => s.id === draggedSection.id);
    const targetIndex = sections.findIndex(s => s.id === dropTarget.id);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedSection(null);
      setDragOverSection(null);
      return;
    }

    const newSections = [...sections];
    // Remove dragged item first
    const [removed] = newSections.splice(draggedIndex, 1);
    
    // Calculate new index after removal
    // If dragging down (draggedIndex < targetIndex), target moves up by 1
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    
    // Insert at the adjusted position
    newSections.splice(adjustedTargetIndex, 0, removed);

    setSections(newSections);
    setDraggedSection(null);
    setDragOverSection(null);
  };

  const handleDragEnd = () => {
    setDraggedSection(null);
    setDragOverSection(null);
  };

  const displaySections = useMemo(() => {
    if (!draggedSection || !dragOverSection) return sections;

    const draggedIndex = sections.findIndex(s => s.id === draggedSection.id);
    const targetIndex = sections.findIndex(s => s.id === dragOverSection.id);

    if (draggedIndex === -1 || targetIndex === -1) return sections;

    const reordered = [...sections];
    // Remove dragged item
    const [removed] = reordered.splice(draggedIndex, 1);
    
    // Calculate adjusted target index (same logic as drop)
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    
    // Insert at adjusted position
    reordered.splice(adjustedTargetIndex, 0, removed);

    return reordered;
  }, [sections, draggedSection, dragOverSection]);

  const toAlphabeticListMarker = (index) => {
    let current = Number(index) || 0;
    let marker = '';

    do {
      marker = String.fromCharCode(97 + (current % 26)) + marker;
      current = Math.floor(current / 26) - 1;
    } while (current >= 0);

    return marker;
  };

  // Text Formatting Functions
  const applyTextFormat = (format) => {
    if (!activeTextarea) return;
    
    const element = document.getElementById(activeTextarea);
    if (!element) return;

    // Check if element is contentEditable
    const isContentEditable = element.contentEditable === 'true';

    if (isContentEditable) {
      // Handle contentEditable formatting with execCommand
      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      const selectedText = selection.toString();
      const noSelectionRequired = [
        'bullet',
        'dash-list',
        'numbering',
        'alphabet',
        'indent',
        'outdent',
        'align-left',
        'align-center',
        'align-right',
        'align-justify',
        'undo',
        'redo'
      ];
      if (!selectedText && !noSelectionRequired.includes(format)) return;

      const getSelectionAnchorElement = () => {
        const currentSelection = window.getSelection();
        if (!currentSelection || currentSelection.rangeCount === 0) {
          return null;
        }

        const anchorNode = currentSelection.anchorNode;
        if (!anchorNode) {
          return null;
        }

        if (anchorNode.nodeType === Node.TEXT_NODE) {
          return anchorNode.parentElement;
        }

        return anchorNode;
      };

      const getCurrentListElement = () => {
        const anchorElement = getSelectionAnchorElement();
        return anchorElement?.closest?.('ol, ul') || null;
      };

      const getResolvedListStyleType = (listElement) => {
        if (!listElement) return '';

        const inlineStyleType = String(listElement.style?.listStyleType || '').toLowerCase();
        if (inlineStyleType) {
          return inlineStyleType;
        }

        const computedStyle = window.getComputedStyle(listElement);
        return String(computedStyle?.listStyleType || '').toLowerCase();
      };

      const getCurrentListType = (listElement) => {
        if (!listElement) return null;

        const listTag = String(listElement.tagName || '').toUpperCase();
        const listStyleType = getResolvedListStyleType(listElement);
        const listTypeAttribute = String(listElement.getAttribute('type') || '').toLowerCase();

        if (listTag === 'UL') {
          return listStyleType === 'none' ? 'dash-list' : 'bullet';
        }

        if (listTag === 'OL') {
          if (listStyleType.includes('alpha') || listTypeAttribute === 'a') {
            return 'alphabet';
          }

          return 'numbering';
        }

        return null;
      };

      const applyOrderedListStyle = (listElement, listStyleType, listTypeAttribute) => {
        if (!listElement || listElement.tagName !== 'OL') return;

        listElement.style.listStyleType = listStyleType;

        if (listTypeAttribute) {
          listElement.setAttribute('type', listTypeAttribute);
        } else {
          listElement.removeAttribute('type');
        }
      };

      const applyUnorderedListStyle = (listElement, listStyleType = 'disc') => {
        if (!listElement || listElement.tagName !== 'UL') return;
        listElement.style.listStyleType = listStyleType;
      };

      const convertListElementTag = (listElement, targetTagName) => {
        if (!listElement || !listElement.parentNode) return null;

        const replacementList = document.createElement(targetTagName);
        replacementList.className = listElement.className;
        const inlineStyle = listElement.getAttribute('style');
        if (inlineStyle) {
          replacementList.setAttribute('style', inlineStyle);
        }

        while (listElement.firstChild) {
          replacementList.appendChild(listElement.firstChild);
        }

        listElement.parentNode.replaceChild(replacementList, listElement);
        return replacementList;
      };

      const ensureListFormatting = (targetListType) => {
        const currentList = getCurrentListElement();
        const currentListType = getCurrentListType(currentList);

        if (currentList && currentListType === targetListType) {
          if (currentList.tagName === 'OL') {
            document.execCommand('insertOrderedList', false, null);
          } else if (currentList.tagName === 'UL') {
            document.execCommand('insertUnorderedList', false, null);
          }
          return;
        }

        if (targetListType === 'bullet') {
          if (currentList?.tagName === 'UL') {
            applyUnorderedListStyle(currentList, 'disc');
            return;
          }

          if (currentList?.tagName === 'OL') {
            const convertedList = convertListElementTag(currentList, 'ul');
            applyUnorderedListStyle(convertedList, 'disc');
            return;
          }

          document.execCommand('insertUnorderedList', false, null);
          applyUnorderedListStyle(getCurrentListElement(), 'disc');
          return;
        }

        if (targetListType === 'numbering') {
          if (currentList?.tagName === 'OL') {
            applyOrderedListStyle(currentList, 'decimal', '1');
            return;
          }

          if (currentList?.tagName === 'UL') {
            const convertedList = convertListElementTag(currentList, 'ol');
            applyOrderedListStyle(convertedList, 'decimal', '1');
            return;
          }

          document.execCommand('insertOrderedList', false, null);
          applyOrderedListStyle(getCurrentListElement(), 'decimal', '1');
          return;
        }

        if (targetListType === 'dash-list') {
          if (currentList?.tagName === 'UL') {
            applyUnorderedListStyle(currentList, 'none');
            return;
          }

          if (currentList?.tagName === 'OL') {
            const convertedList = convertListElementTag(currentList, 'ul');
            applyUnorderedListStyle(convertedList, 'none');
            return;
          }

          document.execCommand('insertUnorderedList', false, null);
          applyUnorderedListStyle(getCurrentListElement(), 'none');
          return;
        }

        if (targetListType === 'alphabet') {
          if (currentList?.tagName === 'OL') {
            applyOrderedListStyle(currentList, 'lower-alpha', 'a');
            return;
          }

          if (currentList?.tagName === 'UL') {
            const convertedList = convertListElementTag(currentList, 'ol');
            applyOrderedListStyle(convertedList, 'lower-alpha', 'a');
            return;
          }

          document.execCommand('insertOrderedList', false, null);
          applyOrderedListStyle(getCurrentListElement(), 'lower-alpha', 'a');
        }
      };

      switch(format) {
        case 'bold':
          document.execCommand('bold', false, null);
          break;
        case 'italic':
          document.execCommand('italic', false, null);
          break;
        case 'underline':
          document.execCommand('underline', false, null);
          break;
        case 'uppercase':
          if (selectedText) {
            document.execCommand('insertText', false, selectedText.toUpperCase());
          }
          break;
        case 'lowercase':
          if (selectedText) {
            document.execCommand('insertText', false, selectedText.toLowerCase());
          }
          break;
        case 'capitalize':
          if (selectedText) {
            const capitalized = selectedText.split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
            document.execCommand('insertText', false, capitalized);
          }
          break;
        case 'bullet':
          ensureListFormatting('bullet');
          break;
        case 'numbering':
          ensureListFormatting('numbering');
          break;
        case 'dash-list':
          ensureListFormatting('dash-list');
          break;
        case 'alphabet': {
          ensureListFormatting('alphabet');

          break;
        }
        case 'indent':
          document.execCommand('indent', false, null);
          break;
        case 'outdent':
          document.execCommand('outdent', false, null);
          break;
        case 'align-left':
          document.execCommand('justifyLeft', false, null);
          break;
        case 'align-center':
          document.execCommand('justifyCenter', false, null);
          break;
        case 'align-right':
          document.execCommand('justifyRight', false, null);
          break;
        case 'align-justify':
          document.execCommand('justifyFull', false, null);
          break;
        case 'undo':
          document.execCommand('undo', false, null);
          break;
        case 'redo':
          document.execCommand('redo', false, null);
          break;
        default:
          break;
      }

      // Keep React state in sync for commands that modify contentEditable DOM.
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      element.focus();
    } else {
      // Handle input/textarea formatting with text markers
      let selectionStart = element.selectionStart;
      let selectionEnd = element.selectionEnd;
      let selectedText = element.value.substring(selectionStart, selectionEnd);

      let formattedText = selectedText;
      let newContent = '';

      const listFormats = new Set(['bullet', 'numbering', 'alphabet', 'dash-list']);

      const getPlainTextListType = (line = '') => {
        const detected = detectPlainTextListItem(line);
        if (!detected) return null;

        if (detected.tag === 'ul') {
          return detected.style === 'none' ? 'dash-list' : 'bullet';
        }

        if (detected.tag === 'ol') {
          return String(detected.style || '').includes('alpha') ? 'alphabet' : 'numbering';
        }

        return null;
      };

      const splitPlainTextListLine = (line = '') => {
        const normalizedLine = String(line || '');
        const markerMatch = normalizedLine.match(/^(\s*)(?:\d+[.)]|[a-zA-Z][.)]|[•*]|-)\s+(.+)$/);

        if (markerMatch) {
          return { indent: markerMatch[1], content: markerMatch[2] };
        }

        const leading = (normalizedLine.match(/^\s*/) || [''])[0];
        return {
          indent: leading,
          content: normalizedLine.slice(leading.length),
        };
      };

      const formatPlainTextListSelection = (value = '', targetListType) => {
        const lines = String(value || '').split('\n');
        const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

        if (nonEmptyLines.length === 0) {
          return value;
        }

        const isAlreadyTarget = nonEmptyLines.every(
          (line) => getPlainTextListType(line) === targetListType
        );

        if (isAlreadyTarget) {
          return lines
            .map((line) => {
              if (!line.trim()) return line;
              const { indent, content } = splitPlainTextListLine(line);
              return `${indent}${content}`;
            })
            .join('\n');
        }

        let listIndex = 0;
        return lines
          .map((line) => {
            if (!line.trim()) return line;

            const { indent, content } = splitPlainTextListLine(line);
            const listContent = content.trimStart();

            if (targetListType === 'bullet') {
              return `${indent}• ${listContent}`;
            }

            if (targetListType === 'dash-list') {
              return `${indent}- ${listContent}`;
            }

            if (targetListType === 'numbering') {
              listIndex += 1;
              return `${indent}${listIndex}. ${listContent}`;
            }

            if (targetListType === 'alphabet') {
              const marker = toAlphabeticListMarker(listIndex);
              listIndex += 1;
              return `${indent}${marker}. ${listContent}`;
            }

            return line;
          })
          .join('\n');
      };

      if (selectionStart === selectionEnd && listFormats.has(format)) {
        const lineStart = element.value.lastIndexOf('\n', selectionStart - 1) + 1;
        const nextNewline = element.value.indexOf('\n', selectionEnd);
        const lineEnd = nextNewline === -1 ? element.value.length : nextNewline;

        selectionStart = lineStart;
        selectionEnd = lineEnd;
        selectedText = element.value.substring(selectionStart, selectionEnd);
        formattedText = selectedText;
      }

      const beforeText = element.value.substring(0, selectionStart);
      const afterText = element.value.substring(selectionEnd);

      switch(format) {
        case 'bold':
          formattedText = `**${selectedText}**`;
          break;
        case 'italic':
          formattedText = `*${selectedText}*`;
          break;
        case 'underline':
          formattedText = `__${selectedText}__`;
          break;
        case 'uppercase':
          formattedText = selectedText.toUpperCase();
          break;
        case 'lowercase':
          formattedText = selectedText.toLowerCase();
          break;
        case 'capitalize':
          formattedText = selectedText.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
          break;
        case 'bullet':
          formattedText = formatPlainTextListSelection(selectedText, 'bullet');
          break;
        case 'numbering':
          formattedText = formatPlainTextListSelection(selectedText, 'numbering');
          break;
        case 'dash-list':
          formattedText = formatPlainTextListSelection(selectedText, 'dash-list');
          break;
        case 'alphabet': {
          formattedText = formatPlainTextListSelection(selectedText, 'alphabet');
          break;
        }
        case 'align-left':
        case 'align-center':
        case 'align-right':
        case 'align-justify':
          // Alignment commands are only for contentEditable fields.
          return;
        case 'indent':
          formattedText = selectedText.split('\n').map(line => '\t' + line).join('\n');
          break;
        case 'outdent':
          formattedText = selectedText.split('\n').map(line => line.replace(/^\t/, '')).join('\n');
          break;
        default:
          break;
      }

      newContent = beforeText + formattedText + afterText;

      // Determine which field type and update accordingly
      if (activeTextarea === 'input-lesson-title') {
        setLessonData(prev => ({ ...prev, ModuleTitle: newContent }));
      } else if (activeTextarea === 'textarea-description') {
        setLessonData(prev => ({ ...prev, Description: newContent }));
      } else if (activeTextarea === 'textarea-objectives') {
        setLessonData(prev => ({ ...prev, Objectives: newContent }));
      } else if (activeTextarea === 'textarea-reference-links') {
        setLessonData(prev => ({ ...prev, ReferenceLinks: formatReferenceLinksForEditor(newContent) }));
      } else if (activeTextarea.startsWith('textarea-review-options-')) {
        const questionId = Number.parseInt(
          activeTextarea.replace('textarea-review-options-', ''),
          10
        );
        if (Number.isFinite(questionId)) {
          handleQuestionChange('review', questionId, 'options', parseOptionsFromTextareaInput(newContent));
        }
      } else if (activeTextarea.startsWith('textarea-final-options-')) {
        const questionId = Number.parseInt(
          activeTextarea.replace('textarea-final-options-', ''),
          10
        );
        if (Number.isFinite(questionId)) {
          handleQuestionChange('final', questionId, 'options', parseOptionsFromTextareaInput(newContent));
        }
      } else if (activeTextarea.startsWith('textarea-video-caption-')) {
        const sectionId = Number.parseInt(
          activeTextarea.replace('textarea-video-caption-', ''),
          10
        );
        if (Number.isFinite(sectionId)) {
          handleSectionContentChange(sectionId, 'caption', newContent);
        }
      } else if (activeTextarea.startsWith('table-header-') && activeTextarea.endsWith('-title')) {
        const [,, rawSectionId] = activeTextarea.split('-');
        const sectionId = Number.parseInt(rawSectionId, 10);
        if (Number.isFinite(sectionId)) {
          handleTableTitleChange(sectionId, newContent);
        }
      } else if (activeTextarea.startsWith('table-header-')) {
        const [,, rawSectionId, rawColIdx] = activeTextarea.split('-');
        const sectionId = Number.parseInt(rawSectionId, 10);
        const colIdx = Number.parseInt(rawColIdx, 10);
        if (Number.isFinite(sectionId) && Number.isFinite(colIdx)) {
          handleTableHeaderChange(sectionId, colIdx, newContent);
        }
      } else if (activeTextarea.startsWith('table-cell-')) {
        const [,, rawSectionId, rawRowIdx, rawColIdx] = activeTextarea.split('-');
        const sectionId = Number.parseInt(rawSectionId, 10);
        const rowIdx = Number.parseInt(rawRowIdx, 10);
        const colIdx = Number.parseInt(rawColIdx, 10);
        if (Number.isFinite(sectionId) && Number.isFinite(rowIdx) && Number.isFinite(colIdx)) {
          handleTableCellChange(sectionId, rowIdx, colIdx, newContent);
        }
      } else if (activeTextarea.startsWith('sidetext-')) {
        const [, rawSectionId, rawLayerIdx] = activeTextarea.split('-');
        const sectionId = Number.parseInt(rawSectionId, 10);
        const layerIdx = Number.parseInt(rawLayerIdx, 10);
        if (Number.isFinite(sectionId) && Number.isFinite(layerIdx)) {
          handleSideTextChange(sectionId, layerIdx, newContent);
        }
      } else if (activeTextarea.startsWith('input-topic-')) {
        const sectionId = Number.parseInt(activeTextarea.split('-')[2], 10);
        if (Number.isFinite(sectionId)) {
          handleSectionContentChange(sectionId, 'title', newContent);
        }
      } else if (activeTextarea.startsWith('input-subtopic-')) {
        const sectionId = Number.parseInt(activeTextarea.split('-')[2], 10);
        if (Number.isFinite(sectionId)) {
          handleSectionContentChange(sectionId, 'title', newContent);
        }
      } else if (activeTextarea.startsWith('textarea-')) {
        const sectionId = Number.parseInt(activeTextarea.split('-')[1], 10);
        if (Number.isFinite(sectionId)) {
          handleSectionContentChange(sectionId, 'content', newContent);
        }
      }

      // Restore cursor position
      setTimeout(() => {
        element.focus();
        const cursorPosition = selectionStart + formattedText.length;
        element.setSelectionRange(cursorPosition, cursorPosition);
      }, 0);
    }
  };

  const getSectionDisplayTitle = (section) => {
    const titles = {
      'topic': 'Topic Title',
      'subtopic': 'Subtopic Title',
      'paragraph': 'Paragraph',
      'image': 'Image',
      'video': 'Video',
      'review-multiple-choice': 'Review - Multiple Choice',
      'review-drag-drop': 'Simulation',
      'review - drag and drop': 'Simulation',
      'simulation': 'Simulation'
    };
    return titles[section.type] || section.type;
  };

  // Roadmap stage management
  const handleAddStage = (type) => {
    if (type === 'review' || isStageTypeInRoadmap(type)) return;

    const newStage = {
      id: `${type}-${Date.now()}`,
      type,
      label: STAGE_LABELS[type] || type,
    };
    setRoadmapStages(prev => [...prev, newStage]);
    setActiveStage(type);
    setShowAddStageModal(false);
    if (type === 'simulation') {
      openSimulationPickerForStage();
    }
  };

  const handleRemoveStage = (stageId) => {
    setRoadmapStages(prev => {
      const removedStage = prev.find(s => s.id === stageId);
      const updated = prev.filter(s => s.id !== stageId);
      if (removedStage && activeStage === removedStage.type && updated.length > 0) {
        setActiveStage(updated[0].type);
      }
      if (removedStage && removedStage.type === 'simulation') {
        setSelectedSimulation(null);
      }
      return updated;
    });
  };

  const handleStageDragStart = (e, stage) => {
    setDraggedStage(stage);
    e.dataTransfer.effectAllowed = 'move';

    // Create a clean, fully opaque drag image
    const el = e.currentTarget;
    const clone = el.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    clone.style.zIndex = '99999';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, el.offsetWidth / 2, el.offsetHeight / 2);
    setTimeout(() => { if (clone.parentNode) clone.parentNode.removeChild(clone); }, 0);
  };

  const handleStageDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleStageDragEnter = (e, stage) => {
    e.preventDefault();
    if (draggedStage && draggedStage.id !== stage.id) {
      setDragOverStageId(stage.id);
    }
  };

  const handleStageDrop = (e, targetStage) => {
    e.preventDefault();
    if (!draggedStage || draggedStage.id === targetStage.id) {
      setDraggedStage(null);
      setDragOverStageId(null);
      return;
    }
    const dragIdx = roadmapStages.findIndex(s => s.id === draggedStage.id);
    const targetIdx = roadmapStages.findIndex(s => s.id === targetStage.id);
    const newStages = [...roadmapStages];
    const [removed] = newStages.splice(dragIdx, 1);
    newStages.splice(targetIdx, 0, removed);
    setRoadmapStages(newStages);
    setDraggedStage(null);
    setDragOverStageId(null);
  };

  const handleStageDragEnd = () => {
    setDraggedStage(null);
    setDragOverStageId(null);
  };

  const isStageTypeInRoadmap = (type) => {
    return roadmapStages.some(s => s.type === type);
  };

  const handleSaveLesson = async () => {
    if (saveInFlightRef.current) {
      return;
    }

    if (isEditLockedByCompletion) {
      console.error('This lesson is marked as completed and locked for editing. Mark it as incomplete from the lesson list to save changes.');
      return;
    }

    const isForcedResave = !hasUnsavedChanges;

    // Use state values directly (they are updated via onInput and onBlur)
    const currentTitle = lessonData.ModuleTitle;
    const currentDescription = lessonData.Description;
    const currentObjectives = lessonData.Objectives;
    const combinedDescription = combineDescriptionAndObjectives(currentDescription, currentObjectives);
    const normalizedReferenceLinks = normalizeReferenceLinks(lessonData.ReferenceLinks);
    
    if (!currentTitle || !currentTitle.trim()) {
      console.error('Please enter a lesson title');
      return;
    }

    if (!lessonData.LessonOrder || lessonData.LessonOrder < 1) {
      console.error('Please enter a valid lesson number');
      return;
    }

    saveInFlightRef.current = true;
    setLoading(true);
    try {
      const apiBaseUrl = axios.defaults.baseURL || API_BASE_URL;
      const backendHost = (() => {
        try {
          return new URL(String(apiBaseUrl || '')).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();

      const normalizeStoredMediaUrl = (rawUrl = '') => {
        const value = String(rawUrl || '').trim();
        if (!value) return '';

        if (value.startsWith('/uploads')) return value;
        if (value.startsWith('uploads/')) return `/${value}`;

        if (/^https?:\/\//i.test(value)) {
          try {
            const parsed = new URL(value);
            const normalizedPath = parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`;

            // Only collapse to relative path for this app's uploaded media files.
            if (normalizedPath.startsWith('/uploads') && backendHost && parsed.hostname.toLowerCase() === backendHost) {
              return normalizedPath;
            }
          } catch {
            return value;
          }
        }

        // Keep external links (Dropbox/Imgur/YouTube/etc.) as full URLs.
        return value;
      };

      // Upload any image/video files to server first
      const uploadedSections = await Promise.all(
        sections.map(async (section) => {
          // Handle image sections, including text+image layouts backed by layerImages.
          if (section.type === 'image') {
            const uploadSingleImg = async (img) => {
              if (!img) {
                return { url: '', file: null, fileName: null, caption: '' };
              }

              if (img.file && img.url?.startsWith('blob:')) {
                try {
                  const formData = new FormData();
                  formData.append('file', img.file);
                  formData.append('type', 'image');
                  const uploadResponse = await axios.post('/admin/upload-media', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                  return { url: uploadResponse.data.url, file: null, fileName: null, caption: img.caption || '' };
                } catch (uploadErr) {
                  console.error('Failed to upload image:', uploadErr);
                  throw uploadErr;
                }
              }
              if (img.url && (img.url.startsWith('http://') || img.url.startsWith('https://'))) {
                return {
                  url: normalizeStoredMediaUrl(img.url),
                  file: null,
                  fileName: null,
                  caption: img.caption || ''
                };
              }
              return { ...img, file: null, fileName: null };
            };

            const normalizedSectionImages = Array.isArray(section.images) ? section.images : [];
            const uploadedImages = await Promise.all(normalizedSectionImages.map(uploadSingleImg));

            const normalizedSectionLayerImages = Array.isArray(section.layerImages) ? section.layerImages : [];
            const uploadedLayerImages = normalizedSectionLayerImages.length > 0
              ? await Promise.all(
                  normalizedSectionLayerImages.map(async (layer) =>
                    Promise.all((Array.isArray(layer) ? layer : [layer]).map(uploadSingleImg))
                  )
                )
              : undefined;

            const firstLayerImageUrl = uploadedLayerImages
              ? uploadedLayerImages.flat().find((image) => image?.url)?.url || ''
              : '';

            return {
              ...section,
              images: uploadedImages,
              layerImages: uploadedLayerImages,
              content: uploadedImages[0]?.url || firstLayerImageUrl || '',
              file: null,
              fileName: null
            };
          }
          // Check if section has a file that needs uploading (blob URL)
          if ((section.type === 'image' || section.type === 'video') && 
              section.file && 
              section.content?.startsWith('blob:')) {
            try {
              const formData = new FormData();
              formData.append('file', section.file);
              formData.append('type', section.type);
              
              const uploadResponse = await axios.post('/admin/upload-media', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
              
              // Return section with server URL instead of blob URL
              return {
                ...section,
                content: uploadResponse.data.url,
                file: null, // Remove file object after upload
                fileName: null // Remove fileName after upload
              };
            } catch (uploadErr) {
              console.error('Failed to upload media:', uploadErr);
              throw uploadErr;
            }
          }
          
          // If it's a full URL (from edit mode), convert back to relative path for storage
          if ((section.type === 'image' || section.type === 'video') && 
              section.content && 
              (section.content.startsWith('http://') || section.content.startsWith('https://'))) {
            return {
              ...section,
              content: normalizeStoredMediaUrl(section.content),
              file: null,
              fileName: null
            };
          }
          
          // Return section as-is if no file to upload
          return { ...section, file: null, fileName: null };
        })
      );

      const referencesSection = normalizedReferenceLinks
        ? {
            id: `references-${Date.now()}`,
            type: 'references',
            title: '',
            content: normalizedReferenceLinks,
            caption: '',
            order: uploadedSections.length + 1
          }
        : null;

      const normalizeQuestionForSave = (question = {}, fallbackQuestionType = 'Easy') => {
        const normalizedQuestionType = normalizeQuestionTypeValue(
          question?.questionType || question?.type || fallbackQuestionType,
          fallbackQuestionType
        );

        const normalizedQuestionOptions = normalizeQuestionOptions(question);

        return {
          ...normalizedQuestionOptions,
          skill: normalizeSkillValue(question?.skill || question?.skillTag || 'Memorization', 'Memorization'),
          questionType: normalizedQuestionType,
          type: normalizedQuestionType,
        };
      };

      const sectionsForSaveBase = referencesSection
        ? [...uploadedSections, referencesSection]
        : uploadedSections;

      const sectionsForSave = sectionsForSaveBase
        .map((section) => {
          const normalizedType = normalizeEditorSectionType(section?.type);

          if (normalizedType !== 'review-multiple-choice' || !Array.isArray(section.questions)) {
            return {
              ...section,
              type: normalizedType,
            };
          }

          return {
            ...section,
            type: normalizedType,
            questions: section.questions.map((question) => normalizeQuestionForSave(question, 'Easy')),
          };
        })
        .map((section, index) => ({
          ...section,
          order: index + 1,
        }));

      const roadmapStagesForSave = syncRoadmapStagesForLessonRules({
        stages: roadmapStages,
        difficulty: lessonData.Difficulty,
        lessonOrder: lessonData.LessonOrder,
      }).map((stage, index) => ({
        ...stage,
        order: index + 1,
      }));

      const normalizedReviewQuestions = reviewQuestions.map((question) =>
        normalizeQuestionForSave(question, 'Easy')
      );

      const normalizedFinalQuestions = finalQuestions.map((question) =>
        normalizeQuestionForSave(question, 'Situational')
      );

      const payload = {
        ModuleTitle: currentTitle,
        Description: combinedDescription,
        LessonOrder: lessonData.LessonOrder,
        LessonTime: lessonData.LessonTime,
        Difficulty: lessonData.Difficulty,
        LessonLanguage: lessonData.LessonLanguage || 'English',
        Tesda_Reference: lessonData.Tesda_Reference || '',
        sections: sectionsForSave,
        diagnosticQuestions: autoDiagnosticQuestions,
        reviewQuestions: normalizedReviewQuestions,
        finalQuestions: normalizedFinalQuestions,
        finalInstruction: finalInstruction,
        roadmapStages: roadmapStagesForSave,
        selectedSimulationId: selectedSimulation?.SimulationID || null
      };

      console.log('Saving lesson with payload:', {
        ...payload,
        sectionsCount: sectionsForSave.length,
        sections: sectionsForSave
      });

      if (isEditMode) {
        const response = await axios.put(`/admin/modules/${id}`, payload);
        console.log('Backend response:', response.data);
        baselineSnapshotRef.current = currentEditorSnapshot;
        setHasUnsavedChanges(false);
      } else {
        const targetModuleId = Number(savedModuleId);

        let response;
        if (Number.isFinite(targetModuleId) && targetModuleId > 0) {
          response = await axios.put(`/admin/modules/${targetModuleId}`, payload);
        } else {
          response = await axios.post('/admin/modules', payload);
          const createdModuleId = Number(
            response?.data?.moduleId ?? response?.data?.module?.ModuleID ?? response?.data?.module?.id
          );
          if (Number.isFinite(createdModuleId) && createdModuleId > 0) {
            setSavedModuleId(createdModuleId);
          }
        }

        console.log('Backend response:', response.data);
        baselineSnapshotRef.current = currentEditorSnapshot;
        setHasUnsavedChanges(false);
      }

      if (isForcedResave) {
        setSaveStatusToast({
          type: 'info',
          message: 'No changes detected. Lesson is already up to date.'
        });
      } else {
        await themedConfirm({
          title: 'Save Successful',
          message: 'Lesson progress saved successfully.',
          confirmText: 'OK',
          showCancel: false,
          variant: 'success'
        });
      }
    } catch (err) {
      console.error('Error saving lesson:', err);

      await themedConfirm({
        title: 'Save Failed',
        message: 'Unable to save lesson progress. Please try again.',
        confirmText: 'OK',
        showCancel: false,
        variant: 'danger'
      });
    } finally {
      saveInFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar beforeNavigate={confirmLeaveEditor} />

      {saveStatusToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-[#346C9A] text-white px-7 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
            </svg>
            <span className="font-semibold">{saveStatusToast.message}</span>
          </div>
        </div>
      )}
      
      <div className="w-full px-8 py-8">
        {/* Header with Exit Editing Button */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigateWithEditorGuard('/admin/lessons', { forcePrompt: true })}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-highlight text-secondary hover:text-highlight-dark rounded-lg font-semibold transition-all shadow-sm"
            title="Exit Editing"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            Exit Editing
          </button>
          <h1 className="text-4xl font-bold text-secondary">
            {isEditMode ? 'Edit Lesson' : isSupplementaryCreateMode ? 'Add Supplementary Lesson' : 'Add Lesson'}
          </h1>
        </div>

        {isEditLockedByCompletion && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-800">This lesson is marked as completed.</p>
            <p className="text-sm text-amber-700 mt-1">
              Editing is locked while completed. Mark this lesson as incomplete from the Admin Lessons list to resume editing.
            </p>
          </div>
        )}

        {/* Roadmap */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
          <div className="flex items-center relative">
            {/* Connecting Line */}
            <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-300 z-0" 
                 style={{ left: '2%', right: '2%' }}></div>
            
            {/* Dynamic Stages */}
            {roadmapStages.map((stage) => {
              const stageCounter = getStageCounterMeta(stage.type);
              const isOverLimit = stageCounter ? stageCounter.count > stageCounter.limit : false;

              return (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={(e) => handleStageDragStart(e, stage)}
                  onDragOver={handleStageDragOver}
                  onDragEnter={(e) => handleStageDragEnter(e, stage)}
                  onDrop={(e) => handleStageDrop(e, stage)}
                  onDragEnd={handleStageDragEnd}
                  onClick={() => setActiveStage(stage.type)}
                  className={`flex flex-col items-center relative z-10 flex-1 transition-all duration-200 hover:scale-110 cursor-pointer group ${
                    draggedStage?.id === stage.id ? 'scale-95' : ''
                  } ${dragOverStageId === stage.id ? 'scale-110' : ''}`}
                >
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all cursor-grab active:cursor-grabbing ${
                      activeStage === stage.type 
                        ? 'bg-highlight shadow-lg' 
                        : 'bg-gray-300 hover:bg-gray-400'
                    }`}>
                      <div className="w-3 h-3 rounded-full bg-white"></div>
                    </div>
                    {/* Remove stage button */}
                    <div
                      onClick={(e) => { e.stopPropagation(); handleRemoveStage(stage.id); }}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-400 hover:bg-red-500 rounded-full items-center justify-center cursor-pointer z-20 hidden group-hover:flex transition-opacity"
                      title="Remove stage"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ${
                    activeStage === stage.type ? 'text-highlight-dark font-bold' : 'text-gray-600'
                  }`}>{stage.label}</span>
                  {stageCounter && (
                    <span className={`text-xs mt-0.5 whitespace-nowrap ${
                      isOverLimit ? 'text-red-600 font-semibold' : 'text-gray-500'
                    }`}>
                      {stageCounter.label}: {stageCounter.count}/{stageCounter.limit}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Add Stage Button */}
            <div className="relative z-10 flex-shrink-0 ml-4">
              <button
                onClick={() => setShowAddStageModal(true)}
                className="flex flex-col items-center transition-all hover:scale-110"
                title="Add stage"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2 bg-white border-2 border-dashed border-[#346C9A] hover:border-highlight hover:bg-surface-light transition-all">
                  <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-secondary">Add</span>
              </button>
            </div>
          </div>
        </div>

        {/* Floating Text Formatting Toolbar */}
        {activeTextarea && (
          <div className="formatting-toolbar fixed top-20 left-1/2 transform -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-gray-200 px-4 py-3 flex items-center gap-1.5 z-50" style={{boxShadow: '0 8px 30px rgba(0,0,0,0.12)'}}>
            {/* Text Formatting */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('bold')}
                className="w-11 h-11 flex items-center justify-center hover:bg-blue-50 rounded-lg transition-all active:scale-95"
                title="Bold (Ctrl+B)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M13.5 4C14.9 4 16.2 4.5 17.1 5.4C18 6.3 18.5 7.5 18.5 8.8C18.5 10.1 18 11.1 17.1 11.9C18.3 12.7 19 14.1 19 15.5C19 17 18.4 18.2 17.3 19.1C16.2 20 14.8 20.5 13.2 20.5H5V4H13.5ZM8.5 7V10.5H13C13.5 10.5 14 10.3 14.3 10C14.7 9.7 14.8 9.3 14.8 8.8C14.8 8.3 14.6 7.9 14.3 7.5C14 7.2 13.5 7 13 7H8.5ZM8.5 13.5V17.5H13.2C13.8 17.5 14.3 17.3 14.7 16.9C15.1 16.5 15.3 16.1 15.3 15.5C15.3 14.9 15.1 14.5 14.7 14.1C14.3 13.7 13.8 13.5 13.2 13.5H8.5Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('italic')}
                className="w-11 h-11 flex items-center justify-center hover:bg-blue-50 rounded-lg transition-all active:scale-95"
                title="Italic (Ctrl+I)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M10 5V8H12.2L8.5 16H6V19H14V16H11.8L15.5 8H18V5H10Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('underline')}
                className="w-11 h-11 flex items-center justify-center hover:bg-blue-50 rounded-lg transition-all active:scale-95"
                title="Underline (Ctrl+U)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M12 17C14.8 17 17 14.8 17 12V3H14.5V12C14.5 13.4 13.4 14.5 12 14.5C10.6 14.5 9.5 13.4 9.5 12V3H7V12C7 14.8 9.2 17 12 17ZM5 20V21.5H19V20H5Z"/>
                </svg>
              </button>
            </div>

            {/* Capitalization */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('uppercase')}
                className="w-11 h-11 flex items-center justify-center hover:bg-purple-50 rounded-lg transition-all active:scale-95"
                title="UPPERCASE"
              >
                <span className="text-sm font-bold text-gray-700 leading-none">AB</span>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('lowercase')}
                className="w-11 h-11 flex items-center justify-center hover:bg-purple-50 rounded-lg transition-all active:scale-95"
                title="lowercase"
              >
                <span className="text-sm font-bold text-gray-700 leading-none">ab</span>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('capitalize')}
                className="w-11 h-11 flex items-center justify-center hover:bg-purple-50 rounded-lg transition-all active:scale-95"
                title="Capitalize Each Word"
              >
                <span className="text-sm font-bold text-gray-700 leading-none">Ab</span>
              </button>
            </div>

            {/* Lists */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('bullet')}
                className="w-11 h-11 flex items-center justify-center hover:bg-green-50 rounded-lg transition-all active:scale-95"
                title="Bullet List"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <circle cx="4" cy="6" r="2"/>
                  <rect x="9" y="4.5" width="12" height="3" rx="1.5"/>
                  <circle cx="4" cy="12" r="2"/>
                  <rect x="9" y="10.5" width="12" height="3" rx="1.5"/>
                  <circle cx="4" cy="18" r="2"/>
                  <rect x="9" y="16.5" width="12" height="3" rx="1.5"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('alphabet')}
                className="w-11 h-11 flex items-center justify-center hover:bg-green-50 rounded-lg transition-all active:scale-95"
                title="Alphabet List (a, b, c)"
              >
                <div className="flex items-center gap-1 text-gray-700" aria-hidden="true">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h2" />
                    <path d="M4 12h2" />
                    <path d="M4 18h2" />
                    <path d="M9 6h11" />
                    <path d="M9 12h11" />
                    <path d="M9 18h11" />
                  </svg>
                </div>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('numbering')}
                className="w-11 h-11 flex items-center justify-center hover:bg-green-50 rounded-lg transition-all active:scale-95"
                title="Numbered List"
              >
                <div className="flex items-center gap-1 text-gray-700" aria-hidden="true">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h2" />
                    <path d="M4 12h2" />
                    <path d="M4 18h2" />
                    <path d="M9 6h11" />
                    <path d="M9 12h11" />
                    <path d="M9 18h11" />
                    <path d="M3.2 6L4.6 4.8" />
                  </svg>
                </div>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('dash-list')}
                className="w-11 h-11 flex items-center justify-center hover:bg-green-50 rounded-lg transition-all active:scale-95"
                title="Dashed List"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h3" />
                  <path d="M3 12h3" />
                  <path d="M3 18h3" />
                  <path d="M9 6h12" />
                  <path d="M9 12h12" />
                  <path d="M9 18h12" />
                </svg>
              </button>
            </div>

            {/* Alignment */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-left')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Align Left"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="3" y="5" width="14" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="3" y="15.5" width="14" height="2.5" rx="1.25"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-center')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Align Center"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="5" y="5" width="14" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="5" y="15.5" width="14" height="2.5" rx="1.25"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-right')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Align Right"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="7" y="5" width="14" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="7" y="15.5" width="14" height="2.5" rx="1.25"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('align-justify')}
                className="w-11 h-11 flex items-center justify-center hover:bg-indigo-50 rounded-lg transition-all active:scale-95"
                title="Justify"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="3" y="5" width="18" height="2.5" rx="1.25"/>
                  <rect x="3" y="10.25" width="18" height="2.5" rx="1.25"/>
                  <rect x="3" y="15.5" width="18" height="2.5" rx="1.25"/>
                </svg>
              </button>
            </div>

            {/* Indent */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('indent')}
                className="w-11 h-11 flex items-center justify-center hover:bg-amber-50 rounded-lg transition-all active:scale-95"
                title="Indent (Tab)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="2" y="3" width="20" height="2.5" rx="1.25"/>
                  <rect x="2" y="18.5" width="20" height="2.5" rx="1.25"/>
                  <rect x="10" y="8" width="12" height="2.5" rx="1.25"/>
                  <rect x="10" y="13" width="12" height="2.5" rx="1.25"/>
                  <path d="M2 8.5L6.5 12L2 15.5V8.5Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('outdent')}
                className="w-11 h-11 flex items-center justify-center hover:bg-amber-50 rounded-lg transition-all active:scale-95"
                title="Outdent (Shift+Tab)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <rect x="2" y="3" width="20" height="2.5" rx="1.25"/>
                  <rect x="2" y="18.5" width="20" height="2.5" rx="1.25"/>
                  <rect x="10" y="8" width="12" height="2.5" rx="1.25"/>
                  <rect x="10" y="13" width="12" height="2.5" rx="1.25"/>
                  <path d="M7 8.5L2.5 12L7 15.5V8.5Z"/>
                </svg>
              </button>
            </div>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1.5 border-r border-gray-200 pr-3 mr-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('undo')}
                className="w-11 h-11 flex items-center justify-center hover:bg-cyan-50 rounded-lg transition-all active:scale-95"
                title="Undo (Ctrl+Z)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M12.5 8C15.9 8 18.8 10.1 20 13.1L18.1 13.8C17.2 11.3 15 9.6 12.5 9.6H6.8L9.3 12.1L8.1 13.3L3.5 8.7L8.1 4.1L9.3 5.3L6.8 7.8H12.5Z"/>
                </svg>
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextFormat('redo')}
                className="w-11 h-11 flex items-center justify-center hover:bg-cyan-50 rounded-lg transition-all active:scale-95"
                title="Redo (Ctrl+Y)"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#374151">
                  <path d="M11.5 8C8.1 8 5.2 10.1 4 13.1L5.9 13.8C6.8 11.3 9 9.6 11.5 9.6H17.2L14.7 12.1L15.9 13.3L20.5 8.7L15.9 4.1L14.7 5.3L17.2 7.8H11.5Z"/>
                </svg>
              </button>
            </div>

            {/* Close Button */}
            <div>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveTextarea(null)}
                className="w-11 h-11 flex items-center justify-center hover:bg-red-50 rounded-lg transition-all active:scale-95 text-gray-400 hover:text-red-500"
                title="Close Toolbar"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Introduction and Lesson Stage - Form Container */}
        {(hasMountedStage('introduction') || hasMountedStage('lesson')) && (
        <div className={`bg-white rounded-xl shadow-sm p-8 space-y-6 ${(activeStage === 'introduction' || activeStage === 'lesson') ? '' : 'hidden'}`}>
          {hasMountedStage('introduction') && (
          <div className={activeStage === 'introduction' ? '' : 'hidden'}>
          {/* Lesson Title, Time and Number Row */}
          <div className="flex gap-6">
            {/* Lesson Title */}
            <div className="flex-1">
              <label className="block text-lg font-bold text-gray-900 mb-2">
                Lesson Title
              </label>
              <div
                ref={lessonTitleRef}
                id="input-lesson-title"
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => {
                  if (e.currentTarget) {
                    const newValue = e.currentTarget.innerHTML || '';
                    setLessonData(prev => ({ ...prev, ModuleTitle: newValue }));
                  }
                }}
                onBlur={(e) => {
                  // Ensure state is synced on blur
                  if (e.currentTarget) {
                    const newValue = e.currentTarget.innerHTML || '';
                    setLessonData(prev => ({ ...prev, ModuleTitle: newValue }));
                  }
                }}
                onPaste={(e) => handleRichPaste(e, null, 'module-title')}
                onFocus={() => setActiveTextarea('input-lesson-title')}
                data-placeholder="Enter lesson title"
                className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>

            {/* Lesson Time */}
            <div className="w-48">
              <label className="block text-lg font-bold text-gray-900 mb-2">
                Lesson Time
              </label>
              <div className="flex items-center justify-center gap-1.5 px-2 py-3 border-2 border-gray-300 rounded-lg focus-within:border-highlight h-[48px]">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={lessonData.LessonTime.hours}
                  onChange={(e) => handleTimeChange('hours', e.target.value)}
                  className="w-12 px-1 focus:outline-none text-center font-medium text-sm"
                />
                <span className="text-gray-400 text-xs">hr</span>
                <span className="text-lg font-bold text-gray-400">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={lessonData.LessonTime.minutes}
                  onChange={(e) => handleTimeChange('minutes', e.target.value)}
                  className="w-12 px-1 focus:outline-none text-center font-medium text-sm"
                />
                <span className="text-gray-400 text-xs">min</span>
              </div>
            </div>

            {/* Lesson Number */}
            <div className="w-36">
              <label className="block text-lg font-bold text-gray-900 mb-2">
                Lesson Number
              </label>
              <input
                type="number"
                min="1"
                value={lessonData.LessonOrder}
                onChange={(e) => setLessonData(prev => ({ ...prev, LessonOrder: parseInt(e.target.value) || 1 }))}
                className="w-full h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-center font-bold text-lg"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-2">
              Description
            </label>
            <div
              ref={descriptionRef}
              id="textarea-description"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                if (e.currentTarget) {
                  const newValue = e.currentTarget.innerHTML || '';
                  setLessonData(prev => ({ ...prev, Description: newValue }));
                }
              }}
              onBlur={(e) => {
                // Ensure state is synced on blur
                if (e.currentTarget) {
                  const newValue = e.currentTarget.innerHTML || '';
                  setLessonData(prev => ({ ...prev, Description: newValue }));
                }
              }}
              onPaste={(e) => handleRichPaste(e, null, 'description')}
              onFocus={() => setActiveTextarea('textarea-description')}
              data-placeholder="Enter lesson description"
              className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
            />
          </div>

          {/* Learning Objectives */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-2">
              Learning Objectives
            </label>
            <div
              ref={objectivesRef}
              id="textarea-objectives"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                if (e.currentTarget) {
                  const newValue = e.currentTarget.innerHTML || '';
                  setLessonData(prev => ({ ...prev, Objectives: newValue }));
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget) {
                  const newValue = e.currentTarget.innerHTML || '';
                  setLessonData(prev => ({ ...prev, Objectives: newValue }));
                }
              }}
              onPaste={(e) => handleRichPaste(e, null, 'objectives')}
              onFocus={() => setActiveTextarea('textarea-objectives')}
              data-placeholder="Enter lesson objectives"
              className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
            />
          </div>

          {/* Reference Links */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-2">
              Reference Links
            </label>
            <textarea
              id="textarea-reference-links"
              value={lessonData.ReferenceLinks}
              onChange={handleReferenceLinksChange}
              onFocus={() => setActiveTextarea('textarea-reference-links')}
              rows={1}
              placeholder="Type links and press Enter for next item"
              className="w-full h-14 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-700 font-mono text-sm leading-4 resize-none overflow-hidden"
            />
            <p className="text-xs text-gray-500 mt-2">
              This references list is always available for learners in the sidebar References panel.
            </p>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-3">
              Lesson Language
            </label>
            <div className="flex flex-wrap gap-4">
              {['English', 'Taglish'].map((option) => (
                <label key={option} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="lesson-language"
                    checked={lessonData.LessonLanguage === option}
                    onChange={() => handleLessonLanguageChange(option)}
                    className="w-5 h-5 text-highlight-dark border-gray-300 focus:ring-highlight"
                  />
                  <span className="text-gray-900 font-medium">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-3">
              Difficulty
            </label>
            {isSupplementaryLesson ? (
              <>
                <div className="inline-flex items-center rounded-full bg-[#8D6EB1]/15 px-4 py-2 text-sm font-semibold text-[#6C4D90]">
                  Supplementary
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Supplementary lessons are managed through the dedicated supplementary lesson creation flow.
                </p>
              </>
            ) : (
              <div className="flex flex-wrap gap-4">
                {difficultyOptions.map((level) => (
                  <label key={level} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="difficulty"
                      checked={lessonData.Difficulty === level}
                      onChange={() => handleDifficultyChange(level)}
                      className="w-5 h-5 text-highlight-dark border-gray-300 focus:ring-highlight"
                    />
                    <span className="text-gray-900 font-medium">{level}</span>
                  </label>
                ))}
              </div>
            )}
            {isSupplementaryCreateMode && (
              <p className="text-xs text-gray-500 mt-2">
                Supplementary lessons are automatically excluded from BKT calculations.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t-2 border-gray-200">
            <div></div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveLesson}
                disabled={isSaveDisabled}
                className="px-8 py-3 bg-highlight hover:bg-highlight-dark text-white rounded-lg font-semibold transition-all shadow-md disabled:opacity-50"
              >
                {getSaveButtonLabel(saveLessonButtonText)}
              </button>
              {(() => {
                const currentIdx = roadmapStages.findIndex(s => s.type === 'introduction');
                const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
                return nextStage ? (
                  <button
                    onClick={() => setActiveStage(nextStage.type)}
                    className="px-8 py-3 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-semibold transition-all shadow-md flex items-center gap-2"
                  >
                    Continue to {nextStage.label}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                ) : null;
              })()}
            </div>
          </div>
          </div>
          )}

          {hasMountedStage('lesson') && (
          <div className={activeStage === 'lesson' ? '' : 'hidden'}>

          {/* Sections Display */}
          {sections.length > 0 && (
            <div className="mt-8 space-y-4">
              {displaySections.map((section, sectionIndex) => (
                <React.Fragment key={section.id}>
                <div
                  key={section.id}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, section)}
                  onDrop={(e) => handleDrop(e, section)}
                  className={`bg-white border-2 rounded-lg p-6 flex items-start gap-4 transition-all duration-200 ${
                    draggedSection?.id === section.id 
                      ? 'border-highlight border-dashed bg-gray-50' 
                      : dragOverSection?.id === section.id
                      ? 'border-highlight shadow-lg'
                      : 'border-gray-300'
                  }`}
                >
                  {/* Drag Handle - Only this is draggable */}
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, section)}
                    onDragEnd={handleDragEnd}
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 -m-1"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-secondary">
                        {getSectionDisplayTitle(section)}
                      </h3>
                      <div className="flex items-center gap-2">
                        {/* Change Material Button */}
                        <div className="relative" data-material-picker>
                          <button
                            onClick={() => setChangeMaterialPicker(changeMaterialPicker === section.id ? null : section.id)}
                            className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-secondary hover:bg-gray-100 rounded-lg transition-all flex items-center gap-1.5 flex-shrink-0"
                            title="Change material type"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                            Change Material
                          </button>
                          {changeMaterialPicker === section.id && (
                            <div className="absolute right-0 top-full mt-1 w-64 bg-white border-2 border-gray-200 rounded-lg shadow-xl z-50 py-1">
                              {[
                                { type: 'topic', label: 'Topic Title' },
                                { type: 'subtopic', label: 'Subtopic Title' },
                                { type: 'paragraph', label: 'Paragraph' },
                                { type: 'image', label: 'Image' },
                                { type: 'video', label: 'Video' },
                                { type: 'review-multiple-choice', label: 'Review - Multiple Choice' },
                                { type: 'simulation', label: 'Simulation' },
                              ].map(opt => (
                                <button
                                  key={opt.type}
                                  onClick={() => handleChangeMaterial(section.id, opt.type)}
                                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all ${
                                    section.type === opt.type
                                      ? 'bg-highlight/10 text-highlight-dark cursor-default'
                                      : 'text-gray-700 hover:bg-gray-100 hover:text-secondary'
                                  }`}
                                  disabled={section.type === opt.type}
                                >
                                  {opt.label}
                                  {section.type === opt.type && ' ✓'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {!['topic', 'subtopic'].includes(section.type) && (
                          <button
                            onClick={() => setCollapsedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                            className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-secondary hover:bg-gray-100 rounded-lg transition-all flex items-center gap-1.5 flex-shrink-0"
                            title={collapsedSections[section.id] ? 'Expand section' : 'Minimize section'}
                          >
                            {collapsedSections[section.id] ? (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                Expand
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                Minimize
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Topic Title - ContentEditable */}
                    {section.type === 'topic' && (
                      <div
                        id={`input-topic-${section.id}`}
                        contentEditable
                        suppressContentEditableWarning
                        ref={(el) => {
                          if (!el) return;
                          if (document.activeElement === el) return;

                          const targetValue = stripHtml(section.title) || '';
                          if (el.innerHTML !== targetValue) {
                            el.innerHTML = targetValue;
                          }
                        }}
                        onInput={(e) => {
                          if (e.currentTarget) {
                            const newValue = e.currentTarget.textContent || '';
                            handleSectionContentChange(section.id, 'title', newValue);
                          }
                        }}
                        onPaste={handlePlainTextPaste}
                        onFocus={() => setActiveTextarea(`input-topic-${section.id}`)}
                        data-placeholder="Enter topic title..."
                        className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 font-semibold text-lg empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                        style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                      />
                    )}

                    {/* Subtopic Title - ContentEditable */}
                    {section.type === 'subtopic' && (
                      <div
                        id={`input-subtopic-${section.id}`}
                        contentEditable
                        suppressContentEditableWarning
                        ref={(el) => {
                          if (!el) return;
                          if (document.activeElement === el) return;

                          const targetValue = stripHtml(section.title) || '';
                          if (el.innerHTML !== targetValue) {
                            el.innerHTML = targetValue;
                          }
                        }}
                        onInput={(e) => {
                          if (e.currentTarget) {
                            const newValue = e.currentTarget.textContent || '';
                            handleSectionContentChange(section.id, 'title', newValue);
                          }
                        }}
                        onPaste={handlePlainTextPaste}
                        onFocus={() => setActiveTextarea(`input-subtopic-${section.id}`)}
                        data-placeholder="Enter subtopic title..."
                        className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 font-medium empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                        style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                      />
                    )}

                    {/* Paragraph - ContentEditable with Layout Options */}
                    {section.type === 'paragraph' && !collapsedSections[section.id] && (
                      <div className="space-y-3">
                        {/* Controls bar: Layout indicator | Change Layout | Add Table */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-bold text-secondary bg-[#346C9A]/10 px-4 py-1.5 rounded-full">
                            {PARAGRAPH_LAYOUTS.find(l => l.id === (section.contentLayout || 'text'))?.icon} {PARAGRAPH_LAYOUTS.find(l => l.id === (section.contentLayout || 'text'))?.label}
                          </span>
                          <button
                            onClick={() => setParagraphLayoutPicker(paragraphLayoutPicker === section.id ? null : section.id)}
                            className="px-4 py-1.5 text-sm font-semibold text-gray-600 hover:text-secondary hover:bg-gray-100 border border-gray-300 rounded-lg transition-all flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            Change Layout
                          </button>
                          {(section.contentLayout || 'text') !== 'table' && (
                            <button
                              onClick={() => handleAddTableToSection(section.id)}
                              className="px-4 py-1.5 text-sm font-semibold text-secondary hover:text-white hover:bg-[#346C9A] border border-[#346C9A]/30 rounded-lg transition-all flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18M9 6v12M15 6v12" /></svg>
                              Add Table
                            </button>
                          )}
                        </div>

                        {/* Paragraph Layout Picker Dropdown */}
                        {paragraphLayoutPicker === section.id && (
                          <div className="bg-white border-2 border-gray-200 rounded-xl shadow-lg p-3 flex gap-3">
                            {PARAGRAPH_LAYOUTS.map((layout) => (
                              <button
                                key={layout.id}
                                onClick={() => handleSelectParagraphLayout(section.id, layout.id)}
                                className={`flex-1 text-left p-3 rounded-lg border-2 transition-all hover:border-highlight hover:bg-surface-light ${
                                  (section.contentLayout || 'text') === layout.id ? 'border-highlight bg-surface-light' : 'border-gray-200'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-lg">{layout.icon}</span>
                                  <span className="font-bold text-primary text-sm">{layout.label}</span>
                                </div>
                                <p className="text-xs text-gray-500">{layout.desc}</p>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Normal Text Content */}
                        {(section.contentLayout || 'text') === 'text' && (
                          <div className="relative">
                            <div
                              id={`textarea-${section.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              ref={(el) => {
                                if (!el) return;
                                if (document.activeElement === el) return;

                                const targetValue = section.content || '';
                                if (el.innerHTML !== targetValue) {
                                  el.innerHTML = targetValue;
                                }
                              }}
                              onInput={(e) => {
                                if (e.currentTarget) {
                                  const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                  handleSectionContentChange(section.id, 'content', newValue);
                                }
                              }}
                              onPaste={(e) => handleRichPaste(e, section.id, 'content')}
                              onFocus={() => setActiveTextarea(`textarea-${section.id}`)}
                              data-placeholder="Enter paragraph content..."
                              className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                            />
                          </div>
                        )}

                        {/* Table Content */}
                        {(section.contentLayout || 'text') === 'table' && section.tableData && (
                          <div className="space-y-3">
                            <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                              <div
                                className="overflow-x-auto"
                                onMouseLeave={() =>
                                  setTableHoverTarget((prev) =>
                                    prev?.sectionId === section.id ? null : prev
                                  )
                                }
                              >
                                <table
                                  key={`${section.id}-${section.tableData.headers.length}-${section.tableData.rows.length}`}
                                  className="w-full border-collapse"
                                >
                                {(() => {
                                  const sourceRows = Array.isArray(section.tableData.rows) && section.tableData.rows.length > 0
                                    ? section.tableData.rows
                                    : [new Array(Math.max(1, section.tableData.headers.length || 0)).fill('')];
                                  const columnCount = Math.max(
                                    section.tableData.headers.length,
                                    ...sourceRows.map((sourceRow) => (Array.isArray(sourceRow) ? sourceRow.length : 0)),
                                    1
                                  );
                                  const normalizedHeaders = Array.from(
                                    { length: columnCount },
                                    (_, colIdx) => String(section.tableData.headers?.[colIdx] || '')
                                  );
                                  const tableTitle = String(section.tableData?.title || section.tableTitle || '');
                                  const tableHeaderSpans = normalizeTableHeaderSpans(section.tableData.headerSpans, columnCount);
                                  const rowSpanMatrix = sourceRows.map((_, rowIdx) =>
                                    normalizeTableHeaderSpans(section.tableData.rowCellSpans?.[rowIdx], columnCount)
                                  );
                                  const normalizedRows = sourceRows.map((sourceRow) => {
                                    const nextRow = Array.isArray(sourceRow)
                                      ? sourceRow.slice(0, columnCount).map((cell) => String(cell || ''))
                                      : [];
                                    while (nextRow.length < columnCount) {
                                      nextRow.push('');
                                    }
                                    return nextRow;
                                  });

                                  return (
                                    <>
                                      <thead>
                                        <tr className="bg-[#346C9A]/10 border-b border-gray-200">
                                          <th colSpan={columnCount + 1} className="align-top">
                                            <div
                                              id={`table-header-${section.id}-title`}
                                              contentEditable
                                              suppressContentEditableWarning
                                              ref={(el) => {
                                                if (!el) return;
                                                if (document.activeElement === el) return;

                                                if (el.innerHTML !== tableTitle) {
                                                  el.innerHTML = tableTitle;
                                                }
                                              }}
                                              onInput={(e) => {
                                                if (e.currentTarget) {
                                                  const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                  handleTableTitleChange(section.id, newValue);
                                                }
                                              }}
                                              onPaste={(e) => handleRichPaste(e, section.id, 'table')}
                                              onFocus={() => setActiveTextarea(`table-header-${section.id}-title`)}
                                              data-placeholder="Type table header..."
                                              className="table-rich-content w-full px-3 py-2.5 bg-transparent font-bold text-primary text-sm focus:outline-none focus:bg-white/50 text-left min-w-[120px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                            />
                                          </th>
                                        </tr>
                                        <tr className="bg-[#346C9A]/10">
                                          {normalizedHeaders.map((header, colIdx) => {
                                            const colSpan = tableHeaderSpans[colIdx] || 0;
                                            if (colSpan <= 0) return null;

                                            const canMoveColumnLeft = colSpan === 1 && colIdx > 0;
                                            const canMoveColumnRight = colSpan === 1 && colIdx < columnCount - 1;
                                            const canMergeHeaderWithNext = (() => {
                                              let nextColIdx = colIdx + colSpan;
                                              while (nextColIdx < tableHeaderSpans.length && tableHeaderSpans[nextColIdx] === 0) {
                                                nextColIdx += 1;
                                              }
                                              return nextColIdx < tableHeaderSpans.length;
                                            })();
                                            const canUnmergeHeader = colSpan > 1;
                                            const columnCanMergeCells = rowSpanMatrix.some((rowSpans) => {
                                              if ((rowSpans[colIdx] || 0) <= 0) return false;
                                              const currentSpan = rowSpans[colIdx] || 1;
                                              let mergeTargetColIdx = colIdx + currentSpan;
                                              while (mergeTargetColIdx < rowSpans.length && rowSpans[mergeTargetColIdx] === 0) {
                                                mergeTargetColIdx += 1;
                                              }
                                              return mergeTargetColIdx < rowSpans.length;
                                            });
                                            const columnHasMergedCells = rowSpanMatrix.some(
                                              (rowSpans) => (rowSpans[colIdx] || 0) > 1
                                            );
                                            const isColumnHovered =
                                              tableHoverTarget?.sectionId === section.id &&
                                              tableHoverTarget?.axis === 'column' &&
                                              tableHoverTarget?.index >= colIdx &&
                                              tableHoverTarget?.index < colIdx + colSpan;

                                            return (
                                              <th
                                                key={colIdx}
                                                colSpan={colSpan}
                                                className={`relative group/col-header align-top ${isColumnHovered ? 'bg-highlight/15' : ''}`}
                                                onMouseEnter={() =>
                                                  setTableHoverTarget({ sectionId: section.id, axis: 'column', index: colIdx })
                                                }
                                                onMouseLeave={() =>
                                                  setTableHoverTarget((prev) =>
                                                    prev?.sectionId === section.id &&
                                                    prev?.axis === 'column' &&
                                                    prev?.index === colIdx
                                                      ? null
                                                      : prev
                                                  )
                                                }
                                              >
                                                <div
                                                  id={`table-header-${section.id}-${colIdx}`}
                                                  contentEditable
                                                  suppressContentEditableWarning
                                                  ref={(el) => {
                                                    if (!el) return;
                                                    if (document.activeElement === el) return;

                                                    const targetValue = header || '';
                                                    if (el.innerHTML !== targetValue) {
                                                      el.innerHTML = targetValue;
                                                    }
                                                  }}
                                                  onInput={(e) => {
                                                    if (e.currentTarget) {
                                                      const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                      handleTableHeaderChange(section.id, colIdx, newValue);
                                                    }
                                                  }}
                                                  onPaste={(e) => handleRichPaste(e, section.id, 'table')}
                                                  onFocus={() => setActiveTextarea(`table-header-${section.id}-${colIdx}`)}
                                                  data-placeholder={`Header ${colIdx + 1}`}
                                                  className="table-rich-content w-full px-3 py-2.5 bg-transparent font-bold text-primary text-sm focus:outline-none focus:bg-white/50 text-center min-w-[120px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                                />
                                                <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover/col-header:opacity-100 transition-opacity">
                                                  <button
                                                    onClick={() => handleMoveTableColumn(section.id, colIdx, 'left')}
                                                    disabled={!canMoveColumnLeft}
                                                    className={`w-6 h-6 rounded-md transition-colors flex items-center justify-center ${
                                                      canMoveColumnLeft
                                                        ? 'bg-highlight/15 text-secondary hover:bg-highlight/25'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                    }`}
                                                    title="Move column left"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                                  </button>
                                                  <button
                                                    onClick={() => handleMoveTableColumn(section.id, colIdx, 'right')}
                                                    disabled={!canMoveColumnRight}
                                                    className={`w-6 h-6 rounded-md transition-colors flex items-center justify-center ${
                                                      canMoveColumnRight
                                                        ? 'bg-highlight/15 text-secondary hover:bg-highlight/25'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                    }`}
                                                    title="Move column right"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                                  </button>
                                                  <button
                                                    onClick={() => handleInsertTableColumn(section.id, colIdx)}
                                                    className="w-6 h-6 rounded-md bg-highlight/15 text-secondary hover:bg-highlight/25 transition-colors flex items-center justify-center"
                                                    title="Insert column to the right"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14m7-7H5" /></svg>
                                                  </button>
                                                  {canMergeHeaderWithNext && (
                                                    <button
                                                      onClick={() => handleMergeTableHeaderCell(section.id, colIdx)}
                                                      className="w-6 h-6 rounded-md bg-yellow-400 text-white hover:bg-yellow-500 transition-colors flex items-center justify-center"
                                                      title="Merge header cells"
                                                    >
                                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5m0 0v3m0-3l4 4m10 6h-3m3 0v-3m0 3l-4-4" /></svg>
                                                    </button>
                                                  )}
                                                  {canUnmergeHeader && (
                                                    <button
                                                      onClick={() => handleUnmergeTableHeaderCell(section.id, colIdx)}
                                                      className="w-6 h-6 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center"
                                                      title="Unmerge header cells"
                                                    >
                                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h6m-6 0l3-3m-3 3l3 3m10 5h-6m6 0l-3-3m3 3l-3 3" /></svg>
                                                    </button>
                                                  )}
                                                  {columnCanMergeCells && (
                                                    <button
                                                      onClick={() => handleMergeTableColumnCells(section.id, colIdx)}
                                                      className="w-6 h-6 rounded-md bg-yellow-400 text-white hover:bg-yellow-500 transition-colors flex items-center justify-center"
                                                      title="Merge column cells"
                                                    >
                                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5m0 0v3m0-3l4 4m10 6h-3m3 0v-3m0 3l-4-4" /></svg>
                                                    </button>
                                                  )}
                                                  {columnHasMergedCells && (
                                                    <button
                                                      onClick={() => handleUnmergeTableColumnCells(section.id, colIdx)}
                                                      className="w-6 h-6 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center"
                                                      title="Unmerge column cells"
                                                    >
                                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h6m-6 0l3-3m-3 3l3 3m10 5h-6m6 0l-3-3m3 3l-3 3" /></svg>
                                                    </button>
                                                  )}
                                                  {columnCount > 1 && (
                                                    <button
                                                      onClick={() => handleRemoveTableColumn(section.id, colIdx)}
                                                      className="w-6 h-6 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center"
                                                      title="Remove column"
                                                    >
                                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                  )}
                                                </div>
                                              </th>
                                            );
                                          })}
                                          <th className="w-14"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {normalizedRows.map((row, rowIdx) => {
                                          const rowCellSpans = normalizeTableHeaderSpans(
                                            section.tableData.rowCellSpans?.[rowIdx],
                                            columnCount
                                          );
                                          const rowCanMergeCells = rowCellSpans.filter((span) => span > 0).length > 1;
                                          const rowHasMergedCells = rowCellSpans.some((span) => span > 1);
                                          const canMoveRowUp = rowIdx > 0;
                                          const canMoveRowDown = rowIdx < normalizedRows.length - 1;
                                          const isRowHovered =
                                            tableHoverTarget?.sectionId === section.id &&
                                            tableHoverTarget?.axis === 'row' &&
                                            tableHoverTarget?.index === rowIdx;

                                          return (
                                            <tr
                                              key={rowIdx}
                                              className={`border-t border-gray-200 group/row ${isRowHovered ? 'bg-highlight/10' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                                            >
                                              {row.map((cell, colIdx) => {
                                                const colSpan = rowCellSpans[colIdx] || 0;
                                                if (colSpan <= 0) return null;

                                                const isColumnHovered =
                                                  tableHoverTarget?.sectionId === section.id &&
                                                  tableHoverTarget?.axis === 'column' &&
                                                  tableHoverTarget?.index >= colIdx &&
                                                  tableHoverTarget?.index < colIdx + colSpan;
                                                const shouldHighlightCell = isRowHovered || isColumnHovered;
                                                const hasRightBorder = colIdx + colSpan < columnCount;

                                                return (
                                                  <td
                                                    key={colIdx}
                                                    colSpan={colSpan}
                                                    className={`${hasRightBorder ? 'border-r border-gray-100' : ''} align-top transition-colors ${shouldHighlightCell ? 'bg-highlight/15' : ''}`}
                                                  >
                                                    <div
                                                      id={`table-cell-${section.id}-${rowIdx}-${colIdx}`}
                                                      contentEditable
                                                      suppressContentEditableWarning
                                                      ref={(el) => {
                                                        if (!el) return;
                                                        if (document.activeElement === el) return;

                                                        const targetValue = cell || '';
                                                        if (el.innerHTML !== targetValue) {
                                                          el.innerHTML = targetValue;
                                                        }
                                                      }}
                                                      onInput={(e) => {
                                                        if (e.currentTarget) {
                                                          const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                          handleTableCellChange(section.id, rowIdx, colIdx, newValue);
                                                        }
                                                      }}
                                                      onPaste={(e) => handleRichPaste(e, section.id, 'table')}
                                                      onFocus={() => setActiveTextarea(`table-cell-${section.id}-${rowIdx}-${colIdx}`)}
                                                      data-placeholder="Enter value..."
                                                      className="table-rich-content w-full px-3 py-2 text-sm text-gray-700 focus:outline-none focus:bg-highlight/5 min-w-[120px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                                      style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                                    />
                                                  </td>
                                                );
                                              })}
                                              <td
                                                className={`w-14 text-center transition-colors ${isRowHovered ? 'bg-highlight/15' : ''}`}
                                                onMouseEnter={() =>
                                                  setTableHoverTarget({ sectionId: section.id, axis: 'row', index: rowIdx })
                                                }
                                                onMouseLeave={() =>
                                                  setTableHoverTarget((prev) =>
                                                    prev?.sectionId === section.id &&
                                                    prev?.axis === 'row' &&
                                                    prev?.index === rowIdx
                                                      ? null
                                                      : prev
                                                  )
                                                }
                                              >
                                                <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
                                                  <button
                                                    onClick={() => handleMoveTableRow(section.id, rowIdx, 'up')}
                                                    disabled={!canMoveRowUp}
                                                    className={`w-6 h-6 rounded-md transition-colors flex items-center justify-center ${
                                                      canMoveRowUp
                                                        ? 'bg-highlight/15 text-secondary hover:bg-highlight/25'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                    }`}
                                                    title="Move row up"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                                                  </button>
                                                  <button
                                                    onClick={() => handleMoveTableRow(section.id, rowIdx, 'down')}
                                                    disabled={!canMoveRowDown}
                                                    className={`w-6 h-6 rounded-md transition-colors flex items-center justify-center ${
                                                      canMoveRowDown
                                                        ? 'bg-highlight/15 text-secondary hover:bg-highlight/25'
                                                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                    }`}
                                                    title="Move row down"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                                  </button>
                                                  <button
                                                    onClick={() => handleInsertTableRow(section.id, rowIdx)}
                                                    className="w-6 h-6 rounded-md bg-highlight/15 text-secondary hover:bg-highlight/25 transition-colors flex items-center justify-center"
                                                    title="Insert row below"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14m7-7H5" /></svg>
                                                  </button>
                                                  {rowCanMergeCells && (
                                                    <button
                                                      onClick={() => handleMergeTableRowCells(section.id, rowIdx)}
                                                      className="w-6 h-6 rounded-md bg-yellow-400 text-white hover:bg-yellow-500 transition-colors flex items-center justify-center"
                                                      title="Merge row cells"
                                                    >
                                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5m0 0v3m0-3l4 4m10 6h-3m3 0v-3m0 3l-4-4" /></svg>
                                                    </button>
                                                  )}
                                                  {rowHasMergedCells && (
                                                    <button
                                                      onClick={() => handleUnmergeTableRowCells(section.id, rowIdx)}
                                                      className="w-6 h-6 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center"
                                                      title="Unmerge row cells"
                                                    >
                                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h6m-6 0l3-3m-3 3l3 3m10 5h-6m6 0l-3-3m3 3l-3 3" /></svg>
                                                    </button>
                                                  )}
                                                  {normalizedRows.length > 1 && (
                                                    <button
                                                      onClick={() => handleRemoveTableRow(section.id, rowIdx)}
                                                      className="w-6 h-6 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center"
                                                      title="Remove row"
                                                    >
                                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </>
                                  );
                                })()}
                                </table>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddTableRow(section.id)}
                                className="px-3 py-1.5 text-sm font-semibold text-secondary hover:bg-[#346C9A]/10 border border-[#346C9A]/20 rounded-lg transition-all flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                Add Row
                              </button>
                              <button
                                onClick={() => handleAddTableColumn(section.id)}
                                className="px-3 py-1.5 text-sm font-semibold text-secondary hover:bg-[#346C9A]/10 border border-[#346C9A]/20 rounded-lg transition-all flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                Add Column
                              </button>
                            </div>
                            <p className="text-xs text-gray-500">Use arrow controls to reposition, + controls to insert, and yellow/amber controls to merge or unmerge cells.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image - Media Container */}
                    {section.type === 'image' && !collapsedSections[section.id] && (
                      <div className="space-y-4">
                        {/* Controls bar: Layout indicator | Change layout | Add Image | Minimize */}
                        {section.layout && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-bold text-secondary bg-[#346C9A]/10 px-4 py-1.5 rounded-full">
                              {IMAGE_LAYOUTS.find(l => l.id === section.layout)?.icon} {IMAGE_LAYOUTS.find(l => l.id === section.layout)?.label}
                            </span>
                            <button
                              onClick={() => setLayoutPickerSection(section.id)}
                              className="px-4 py-1.5 text-sm font-semibold text-gray-600 hover:text-secondary hover:bg-gray-100 border border-gray-300 rounded-lg transition-all flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                              Change Layout
                            </button>
                            <button
                              onClick={() => {
                                if (section.layout === 'text-left' || section.layout === 'text-right') {
                                  const lastLayerIdx = Math.max(0, (section.layerImages || []).length - 1);
                                  handleAddLayerImage(section.id, lastLayerIdx);
                                } else {
                                  handleAddImageSlot(section.id);
                                }
                              }}
                              className="px-4 py-1.5 text-sm font-semibold text-secondary hover:text-white hover:bg-[#346C9A] border border-[#346C9A]/30 rounded-lg transition-all flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                              Add Image
                            </button>
                            {(section.layout === 'text-left' || section.layout === 'text-right') && (
                              <button
                                onClick={() => handleAddTextImageLayer(section.id)}
                                className="px-4 py-1.5 text-sm font-semibold text-secondary hover:text-white hover:bg-[#346C9A] border border-[#346C9A]/30 rounded-lg transition-all flex items-center gap-1.5"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                Add Layer
                              </button>
                            )}

                          </div>
                        )}

                        {/* Collapsed preview */}
                        {section.layout && collapsedSections[section.id] ? (
                          <div
                            onClick={() => setCollapsedSections(prev => ({ ...prev, [section.id]: false }))}
                            className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:border-highlight transition-colors bg-gray-50"
                          >
                            <div className="flex gap-2 flex-wrap">
                              {(section.images || []).map((img, i) => {
                                const imageKey = `${img.fileName || img.url || 'image'}-${i}`;

                                return img.url ? (
                                  <img key={imageKey} src={img.url} alt={`Thumb ${i+1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                                ) : (
                                  <div key={imageKey} className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                  </div>
                                );
                              })}
                            </div>
                            <span className="text-sm text-gray-500">
                              {(section.images || []).filter(img => img.url).length} image(s) · Click to expand
                            </span>
                          </div>
                        ) : (section.layout === 'text-left' || section.layout === 'text-right') ? (
                          /* Text + Image Layout - Multi-layer */
                          <div className="space-y-4">
                            {(() => {
                              const sideTexts = Array.isArray(section.sideTexts) && section.sideTexts.length > 0
                                ? section.sideTexts
                                : (section.sideText ? [section.sideText] : ['']);
                              const layerImages = Array.isArray(section.layerImages) && section.layerImages.length > 0
                                ? section.layerImages
                                : (Array.isArray(section.images) && section.images.length > 0
                                    ? section.images.map(img => [img])
                                    : [[{ url: '', file: null, fileName: '', caption: '' }]]);
                              const layerCount = Math.max(sideTexts.length, layerImages.length, 1);
                              return Array.from({ length: layerCount }, (_, layerIdx) => {
                                const layerImgs = layerImages[layerIdx] || [{ url: '', file: null, fileName: '', caption: '' }];
                                const textContent = sideTexts[layerIdx] || '';
                                return (
                                  <div key={layerIdx} className="relative group/layer">
                                    {layerCount > 1 && (
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Layer {layerIdx + 1}</span>
                                        <button
                                          onClick={() => handleRemoveTextImageLayer(section.id, layerIdx)}
                                          className="px-2 py-1 text-xs font-semibold text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all opacity-0 group-hover/layer:opacity-100"
                                        >
                                          Remove Layer
                                        </button>
                                      </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4 items-start">
                                      {section.layout === 'text-left' && (
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() => handleClearSideText(section.id, layerIdx)}
                                            className="absolute top-2 right-2 px-2 py-1 text-[10px] font-semibold text-red-500 bg-white/90 border border-red-200 rounded z-10 hover:bg-red-50"
                                            title="Clear text"
                                          >
                                            Clear
                                          </button>
                                          <div
                                            id={`sidetext-${section.id}-${layerIdx}`}
                                            contentEditable
                                            suppressContentEditableWarning
                                            ref={(el) => {
                                              if (!el) return;
                                              if (document.activeElement === el) return;

                                              const targetValue = textContent || '';
                                              if (el.innerHTML !== targetValue) {
                                                el.innerHTML = targetValue;
                                              }
                                            }}
                                            onInput={(e) => {
                                              if (e.currentTarget) {
                                                const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                handleSideTextChange(section.id, layerIdx, newValue);
                                              }
                                            }}
                                            onBlur={(e) => {
                                              const linkifiedValue = linkifyVideoLinksInHtml(sanitizeHtml(e.currentTarget.innerHTML));
                                              if (e.currentTarget.innerHTML !== linkifiedValue) {
                                                e.currentTarget.innerHTML = linkifiedValue;
                                              }
                                              handleSideTextChange(section.id, layerIdx, linkifiedValue);
                                            }}
                                            onPaste={(e) => handleRichPaste(e, section.id, 'sideText')}
                                            onFocus={() => setActiveTextarea(`sidetext-${section.id}-${layerIdx}`)}
                                            data-placeholder="Enter text content..."
                                            className="w-full h-full min-h-[200px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                          />
                                          <p className="mt-2 text-[11px] text-gray-500">Video links are auto-detected and saved as clickable links.</p>
                                        </div>
                                      )}
                                      {/* Image slots - horizontal layout */}
                                      <div className="flex gap-3 flex-wrap items-start">
                                        {layerImgs.map((img, imgIdx) => (
                                          <div
                                            key={imgIdx}
                                            className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center focus-within:border-highlight transition-colors relative group/img min-h-[180px] flex-1 min-w-[120px]"
                                            tabIndex={0}
                                            onPaste={(e) => handleLayerPasteImage(section.id, layerIdx, imgIdx, e)}
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              const file = e.dataTransfer.files?.[0];
                                              if (file && file.type.startsWith('image/')) {
                                                handleLayerImageUpload(section.id, layerIdx, imgIdx, { target: { files: [file] } });
                                              }
                                            }}
                                          >
                                            {(layerImgs.length > 1 || img.url) && (
                                              <div
                                                onClick={() => {
                                                  if (layerImgs.length > 1) {
                                                    handleRemoveLayerImage(section.id, layerIdx, imgIdx);
                                                  } else {
                                                    handleClearLayerImage(section.id, layerIdx, imgIdx);
                                                  }
                                                }}
                                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-400 hover:bg-red-500 rounded-full items-center justify-center cursor-pointer z-10 hidden group-hover/img:flex"
                                                title={layerImgs.length > 1 ? 'Remove image' : 'Clear image'}
                                              >
                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                              </div>
                                            )}
                                            {img.url ? (
                                              <div className="min-h-[140px] flex flex-col items-center justify-center">
                                                <img
                                                  src={img.url}
                                                  alt={`Image ${imgIdx + 1}`}
                                                  className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                                                  draggable="false"
                                                />
                                                <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                                                  <label className="inline-block px-3 py-1 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg cursor-pointer transition-all text-xs">
                                                    Change
                                                    <input
                                                      type="file"
                                                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/*"
                                                      onChange={(e) => handleLayerImageUpload(section.id, layerIdx, imgIdx, e)}
                                                      className="hidden"
                                                    />
                                                  </label>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleEditLayerImage(section.id, layerIdx, imgIdx)}
                                                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all text-xs font-semibold"
                                                  >
                                                    Crop / Edit
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="py-3 min-h-[140px] flex flex-col items-center justify-center">
                                                <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <label className="px-3 py-1.5 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg cursor-pointer transition-all inline-block font-semibold text-xs">
                                                  Import
                                                  <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/*"
                                                    onChange={(e) => handleLayerImageUpload(section.id, layerIdx, imgIdx, e)}
                                                    className="hidden"
                                                  />
                                                </label>
                                                <p className="text-xs text-gray-400 mt-1">or paste / drag</p>
                                              </div>
                                            )}
                                            <input
                                              type="text"
                                              value={img.caption || ''}
                                              onChange={(e) => handleLayerImageCaptionChange(section.id, layerIdx, imgIdx, e.target.value)}
                                              placeholder={`Image ${imgIdx + 1} name or description...`}
                                              className="w-full mt-2 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:border-highlight focus:outline-none text-gray-700 placeholder-gray-400"
                                            />
                                          </div>
                                        ))}
                                        {/* Inline add image button */}
                                        <button
                                          onClick={() => handleAddLayerImage(section.id, layerIdx)}
                                          className="border-2 border-dashed border-gray-200 hover:border-highlight rounded-lg min-w-[80px] min-h-[180px] flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-secondary transition-all cursor-pointer"
                                          title="Add another image to this layer"
                                        >
                                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                          <span className="text-xs font-semibold">Add</span>
                                        </button>
                                      </div>
                                      {section.layout === 'text-right' && (
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() => handleClearSideText(section.id, layerIdx)}
                                            className="absolute top-2 right-2 px-2 py-1 text-[10px] font-semibold text-red-500 bg-white/90 border border-red-200 rounded z-10 hover:bg-red-50"
                                            title="Clear text"
                                          >
                                            Clear
                                          </button>
                                          <div
                                            id={`sidetext-${section.id}-${layerIdx}`}
                                            contentEditable
                                            suppressContentEditableWarning
                                            ref={(el) => {
                                              if (!el) return;
                                              if (document.activeElement === el) return;

                                              const targetValue = textContent || '';
                                              if (el.innerHTML !== targetValue) {
                                                el.innerHTML = targetValue;
                                              }
                                            }}
                                            onInput={(e) => {
                                              if (e.currentTarget) {
                                                const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                                handleSideTextChange(section.id, layerIdx, newValue);
                                              }
                                            }}
                                            onBlur={(e) => {
                                              const linkifiedValue = linkifyVideoLinksInHtml(sanitizeHtml(e.currentTarget.innerHTML));
                                              if (e.currentTarget.innerHTML !== linkifiedValue) {
                                                e.currentTarget.innerHTML = linkifiedValue;
                                              }
                                              handleSideTextChange(section.id, layerIdx, linkifiedValue);
                                            }}
                                            onPaste={(e) => handleRichPaste(e, section.id, 'sideText')}
                                            onFocus={() => setActiveTextarea(`sidetext-${section.id}-${layerIdx}`)}
                                            data-placeholder="Enter text content..."
                                            className="w-full h-full min-h-[200px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                          />
                                          <p className="mt-2 text-[11px] text-gray-500">Video links are auto-detected and saved as clickable links.</p>
                                        </div>
                                      )}
                                    </div>
                                    {layerIdx < layerCount - 1 && (
                                      <div className="border-b border-dashed border-gray-200 mt-4"></div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        ) : section.layout ? (
                          /* Images Display - Collage-aware rendering */
                          <>
                            <div className={`gap-4 items-stretch ${
                              section.layout === 'side-by-side' ? 'grid grid-cols-2' :
                              section.layout === 'grid-2x2' ? 'grid grid-cols-2' :
                              section.layout === 'grid-3' ? 'grid grid-cols-3' :
                              section.layout === 'one-plus-two' ? 'grid grid-cols-2 [&>*:first-child]:col-span-2' :
                              section.layout === 'two-plus-one' ? 'grid grid-cols-2 [&>*:last-child]:col-span-2' :
                              section.layout === 'big-left' ? 'grid grid-cols-2 grid-rows-2 [&>*:first-child]:row-span-2' :
                              section.layout === 'big-right' ? 'grid grid-cols-2 grid-rows-2 [&>*:last-child]:row-span-2' :
                              section.layout === 'mosaic' ? 'grid grid-cols-4 grid-rows-2 [&>*:first-child]:col-span-2 [&>*:first-child]:row-span-2' :
                              'flex flex-wrap'
                            }`}>
                              {(section.images || []).map((img, imgIdx) => {
                                const imageSlotKey = `${img.fileName || img.url || 'image-slot'}-${imgIdx}`;

                                return (
                                <div
                                  key={imageSlotKey}
                                  className={`border-2 border-dashed border-gray-300 rounded-lg p-4 text-center focus-within:border-highlight transition-colors relative group/img min-w-[150px]`}
                                  tabIndex={0}
                                  onPaste={(e) => handlePasteImage(section.id, e, imgIdx)}
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file && file.type.startsWith('image/')) {
                                      handleImageSlotUpload(section.id, imgIdx, { target: { files: [file] } });
                                    }
                                  }}
                                >
                                  {/* Remove image slot button */}
                                  <div
                                    onClick={() => handleRemoveImageSlot(section.id, imgIdx)}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-400 hover:bg-red-500 rounded-full items-center justify-center cursor-pointer z-10 hidden group-hover/img:flex transition-opacity"
                                    title="Remove image"
                                  >
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </div>
                                  {img.url ? (
                                    <div>
                                      <img
                                        src={img.url}
                                        alt={`Image ${imgIdx + 1}`}
                                        className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                                        draggable="false"
                                      />
                                      <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                                        <label className="inline-block px-4 py-1.5 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg cursor-pointer transition-all text-sm">
                                          Change
                                          <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/*"
                                            onChange={(e) => handleImageSlotUpload(section.id, imgIdx, e)}
                                            className="hidden"
                                          />
                                        </label>
                                        <button
                                          type="button"
                                          onClick={() => handleEditImageSlot(section.id, imgIdx)}
                                          className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all text-sm font-semibold"
                                        >
                                          Crop / Edit
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="py-4">
                                      <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      <label className="px-4 py-2 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg cursor-pointer transition-all inline-block font-semibold text-sm">
                                        Import
                                        <input
                                          type="file"
                                          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/*"
                                          onChange={(e) => handleImageSlotUpload(section.id, imgIdx, e)}
                                          className="hidden"
                                        />
                                      </label>
                                      <p className="text-xs text-gray-400 mt-1">or paste / drag</p>
                                      <p className="text-[11px] text-gray-400 mt-2">JPG, PNG, GIF, WEBP · Max 10 MB</p>
                                    </div>
                                  )}
                                  {/* Per-image caption */}
                                  <input
                                    type="text"
                                    value={img.caption || ''}
                                    onChange={(e) => handleImageCaptionChange(section.id, imgIdx, e.target.value)}
                                    placeholder={`Image ${imgIdx + 1} caption...`}
                                    className="w-full mt-3 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-600 placeholder-gray-400"
                                  />
                                </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          /* No layout selected yet - Show layout picker */
                          <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
                            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <button
                              onClick={() => setLayoutPickerSection(section.id)}
                              className="px-8 py-3 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg transition-all font-semibold text-base shadow-md"
                            >
                              Choose a Layout
                            </button>
                            <p className="text-sm text-gray-500 mt-3">Select an image layout to get started</p>
                          </div>
                        )}

                        {/* Layout Picker Modal */}
                        {layoutPickerSection === section.id && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setLayoutPickerSection(null)} />
                            <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                                <div>
                                  <h3 className="text-xl font-bold text-primary">Choose Image Layout</h3>
                                  <p className="text-sm text-gray-500 mt-1">Select how you want image(s) arranged</p>
                                </div>
                                <button onClick={() => setLayoutPickerSection(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-2 gap-3">
                                  {IMAGE_LAYOUTS.map((layout) => (
                                    <button
                                      key={layout.id}
                                      onClick={() => handleSelectImageLayout(section.id, layout)}
                                      className={`text-left p-4 rounded-xl border-2 transition-all hover:border-highlight hover:bg-surface-light ${
                                        section.layout === layout.id ? 'border-highlight bg-surface-light' : 'border-gray-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 mb-2">
                                        <span className="text-2xl">{layout.icon}</span>
                                        <span className="font-bold text-primary text-sm">{layout.label}</span>
                                      </div>
                                      <p className="text-xs text-gray-500 leading-relaxed">{layout.desc}</p>
                                      {layout.slots > 0 && (
                                        <p className="text-xs text-highlight-dark font-semibold mt-1">{layout.slots} image slot{layout.slots > 1 ? 's' : ''}</p>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        

                      </div>
                    )}

                    {/* Video - Media Container */}
                    {section.type === 'video' && !collapsedSections[section.id] && (
                      <div className="space-y-4">
                        <div
                          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center focus-within:border-highlight transition-colors"
                          tabIndex={0}
                          onPaste={(e) => {
                            const items = e.clipboardData?.items;
                            if (!items) return;
                            for (let i = 0; i < items.length; i++) {
                              if (items[i].type.startsWith('video/')) {
                                e.preventDefault();
                                const file = items[i].getAsFile();
                                if (!file) return;
                                const fileSizeMB = file.size / (1024 * 1024);
                                if (fileSizeMB > 100) {
                                  console.error(`Video exceeds 100MB limit. Your file is ${fileSizeMB.toFixed(2)}MB.`);
                                  return;
                                }
                                const fileUrl = URL.createObjectURL(file);
                                setSections(prev => prev.map(s =>
                                  s.id === section.id
                                    ? { ...s, content: fileUrl, file: file, fileName: file.name || 'pasted-video.mp4' }
                                    : s
                                ));
                                return;
                              }
                            }
                          }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files?.[0];
                            if (file && file.type.startsWith('video/')) {
                              const fakeEvent = { target: { files: [file] } };
                              handleFileUpload(section.id, fakeEvent, 'video');
                            }
                          }}
                        >
                          {section.content ? (
                            <div className="relative">
                              {(() => {
                                const normalizedVideoUrl = normalizeVideoEmbedUrl(section.content);

                                if (isEmbedVideoUrl(normalizedVideoUrl)) {
                                  return (
                                    <div className="aspect-video max-w-3xl mx-auto">
                                      <iframe
                                        src={normalizedVideoUrl}
                                        className="w-full h-full rounded-lg shadow-md"
                                        allowFullScreen
                                        title="Embedded lesson video"
                                      ></iframe>
                                    </div>
                                  );
                                }

                                return (
                                  <video
                                    src={normalizedVideoUrl}
                                    controls
                                    className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                                    draggable="false"
                                  />
                                );
                              })()}
                              <label className="mt-4 inline-block px-6 py-2 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg cursor-pointer transition-all">
                                Change Video
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) => handleFileUpload(section.id, e, 'video')}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => handleClearVideo(section.id)}
                                className="mt-4 ml-3 inline-block px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all"
                              >
                                Clear Video
                              </button>
                            </div>
                          ) : (
                            <div>
                              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <label className="px-6 py-3 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg cursor-pointer transition-all inline-block font-semibold">
                                Import Video
                                <input
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) => handleFileUpload(section.id, e, 'video')}
                                  className="hidden"
                                />
                              </label>
                              <p className="text-sm text-gray-500 mt-2">MP4, WebM - Maximum 100MB</p>
                              <p className="text-sm text-gray-400 mt-1">or drag a video file here</p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-gray-700">Video URL (YouTube, Vimeo, Dropbox, Imgur)</label>
                          <input
                            type="url"
                            value={isManagedUploadVideoUrl(section.content) ? '' : (section.content || '')}
                            onChange={(e) => {
                              const embedUrl = normalizeVideoEmbedUrl(e.target.value);
                              setSections(prev => prev.map(s =>
                                s.id === section.id
                                  ? { ...s, content: embedUrl, file: null, fileName: null }
                                  : s
                              ));
                            }}
                            placeholder="https://www.youtube.com/watch?v=... or https://www.dropbox.com/..."
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-700"
                          />
                          <p className="text-sm text-gray-500">Paste a YouTube/Vimeo link for iframe embed, or a Dropbox/Imgur video link for direct playback.</p>
                        </div>
                        
                        {/* Caption Text Field - Same Width as Video Container */}
                        <div className="relative">
                          <div
                            id={`textarea-video-caption-${section.id}`}
                            contentEditable
                            suppressContentEditableWarning
                            ref={(el) => {
                              if (!el) return;
                              if (document.activeElement === el) return;

                              const targetValue = section.caption || '';
                              if (el.innerHTML !== targetValue) {
                                el.innerHTML = targetValue;
                              }
                            }}
                            onInput={(e) => {
                              if (e.currentTarget) {
                                const newValue = sanitizeHtml(e.currentTarget.innerHTML);
                                handleSectionContentChange(section.id, 'caption', newValue);
                              }
                            }}
                            onPaste={(e) => handleRichPaste(e, section.id, 'caption')}
                            onFocus={() => setActiveTextarea(`textarea-video-caption-${section.id}`)}
                            data-placeholder="Enter video caption or description..."
                            className="w-full min-h-[80px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-700 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                            style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Review - Multiple Choice Editor */}
                    {section.type === 'review-multiple-choice' && !collapsedSections[section.id] && (
                      <div className="space-y-4 w-full">
                        <div className="bg-blue-50 border-l-4 border-blue-500 px-4 py-2 rounded-r mb-2">
                          <p className="text-sm text-blue-700">These questions will pop up as a quiz overlay with blurred background when the user reaches this point in the lesson.</p>
                        </div>
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                          {(section.questions || []).map((question, qIdx) => (
                            <div key={question.id} className="border-2 border-gray-300 rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b-2 border-gray-300">
                                <div className="text-sm font-bold text-gray-600">{qIdx + 1}/{(section.questions || []).length}</div>
                                <button onClick={() => handleDeleteSectionQuestion(section.id, question.id)} className="w-6 h-6 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              <div className="p-4">
                                <div
                                  id={`input-reviewmc-question-${question.id}`}
                                  contentEditable
                                  suppressContentEditableWarning
                                  ref={(el) => {
                                    if (!el) return;
                                    if (document.activeElement === el) return;
                                    const targetValue = stripHtml(question.question) || '';
                                    if (el.innerHTML !== targetValue) {
                                      el.innerHTML = targetValue;
                                    }
                                  }}
                                  onInput={(e) => handleSectionQuestionChange(section.id, question.id, 'question', e.currentTarget.textContent || '')}
                                  onPaste={handlePlainTextPaste}
                                  onFocus={() => setActiveTextarea(`input-reviewmc-question-${question.id}`)}
                                  data-placeholder="Type in the question here"
                                  className="w-full min-h-[40px] px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 mb-3 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                                />
                                <div className="mb-3 flex items-center gap-4 flex-wrap">
                                  <span className="text-xs font-bold text-gray-700">Mastery Type:</span>
                                  {MASTERY_TYPE_OPTIONS.map((masteryType) => (
                                    <label key={`${question.id}-reviewmc-mastery-${masteryType}`} className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`reviewmc-mastery-${question.id}`}
                                        checked={normalizeSkillValue(question.skill || question.skillTag || 'Memorization', 'Memorization') === masteryType}
                                        onChange={() => handleSectionQuestionChange(section.id, question.id, 'skill', masteryType)}
                                        className="w-3 h-3 text-highlight-dark"
                                      />
                                      <span className="text-xs text-gray-700">{masteryType}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="mb-3 flex items-center gap-4 flex-wrap">
                                  <span className="text-xs font-bold text-gray-700">Question Type:</span>
                                  {['Easy', 'Situational'].map((questionType) => (
                                    <label key={`${question.id}-${questionType}`} className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`reviewmc-type-${question.id}`}
                                        checked={normalizeQuestionTypeValue(question.questionType || question.type || 'Easy', 'Easy') === questionType}
                                        onChange={() => handleSectionQuestionChange(section.id, question.id, 'questionType', questionType)}
                                        className="w-3 h-3 text-highlight-dark"
                                      />
                                      <span className="text-xs text-gray-700">{questionType}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                                    <span className="text-xs font-semibold text-gray-600">Answer Choices (one per line)</span>
                                    <span className="text-xs text-gray-400">Select correct →</span>
                                  </div>
                                  <div className="flex">
                                    <textarea
                                      value={optionsToTextareaValue(question.options)}
                                      onChange={(e) => {
                                        const newOptions = parseOptionsFromTextareaInput(e.target.value);
                                        handleSectionQuestionChange(section.id, question.id, 'options', newOptions);
                                      }}
                                      placeholder={"a. First choice\nb. Second choice\nc. Third choice\nd. Fourth choice"}
                                      rows={4}
                                      className="flex-1 px-3 py-2 focus:outline-none text-gray-900 resize-none leading-8 text-sm"
                                    />
                                    <div className="flex flex-col justify-center gap-[2px] pr-2 pl-2 border-l border-gray-200 bg-gray-50">
                                      {['a', 'b', 'c', 'd'].map((letter, idx) => (
                                        <label key={letter} className="flex items-center gap-1 cursor-pointer h-8">
                                          <input type="radio" name={`reviewmc-correct-${question.id}`} checked={question.correctAnswer === idx} onChange={() => handleSectionQuestionChange(section.id, question.id, 'correctAnswer', idx)} className="w-3 h-3 text-green-500" />
                                          <span className={`text-xs font-medium ${question.correctAnswer === idx ? 'text-green-600' : 'text-gray-400'}`}>{question.correctAnswer === idx ? `${letter}. ✓` : `${letter}.`}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button onClick={() => handleAddSectionQuestion(section.id)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-[#346C9A] hover:text-secondary transition-all flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add Question
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Simulation Section Editor */}
                    {section.type === 'simulation' && !collapsedSections[section.id] && (
                      <div className="space-y-4 w-full">
                        {(() => {
                          const sectionSimulationId =
                            section.simulationId ||
                            section.simulation?.SimulationID ||
                            section.simulation?.id ||
                            null;

                          const sectionSimulation = section.simulation ||
                            availableSimulations.find((sim) => Number(sim.SimulationID) === Number(sectionSimulationId)) ||
                            null;

                          return sectionSimulation ? (
                            <div className="border-2 border-highlight rounded-lg p-5 bg-surface-light">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h4 className="text-lg font-bold text-secondary">{sectionSimulation.SimulationTitle}</h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {sectionSimulation.Description || 'Linked simulation activity'}
                                  </p>
                                  <div className="flex gap-2 mt-3 flex-wrap">
                                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-200">
                                      Type: {sectionSimulation.ActivityType || 'Interactive Exercise'}
                                    </span>
                                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-200">
                                      Max Score: {sectionSimulation.MaxScore || 0}
                                    </span>
                                    {Number(sectionSimulation.TimeLimit || 0) > 0 && (
                                      <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-200">
                                        Time Limit: {sectionSimulation.TimeLimit} min
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => openSimulationPickerForSection(section.id)}
                                    className="px-4 py-2 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all text-sm font-semibold"
                                  >
                                    Change
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSections((prevSections) =>
                                        prevSections.map((candidate) =>
                                          candidate.id === section.id
                                            ? { ...candidate, simulationId: null, simulation: null }
                                            : candidate
                                        )
                                      );
                                    }}
                                    className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-sm font-semibold"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
                              <p className="text-gray-600 mb-3 font-semibold">No simulation selected for this section</p>
                              <button
                                onClick={() => openSimulationPickerForSection(section.id)}
                                className="px-5 py-2.5 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all text-sm font-semibold"
                              >
                                Select Simulation
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteSection(section.id)}
                    className="flex-shrink-0 w-8 h-8 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Insert between button */}
                {sectionIndex < displaySections.length - 1 && (
                  <div className="flex justify-center -mt-2 -mb-2">
                    <button
                      onClick={() => { setInsertAtIndex(sectionIndex + 1); setShowSectionModal(true); }}
                      className="group flex items-center gap-1 px-3 py-1 rounded-full text-gray-300 hover:text-highlight-dark hover:bg-highlight/10 transition-all"
                      title="Add section in between"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Add Section in Between</span>
                    </button>
                  </div>
                )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Add Section Area */}
          <div className="mt-12 pt-8 border-t-2 border-gray-200">
            <div className="border-2 border-gray-300 rounded-xl p-16 flex flex-col items-center justify-center hover:border-[#346C9A] transition-all cursor-pointer group">
              <button
                onClick={handleAddSection}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-20 h-20 bg-[#346C9A] rounded-full flex items-center justify-center group-hover:bg-highlight transition-all shadow-lg">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-xl font-semibold text-gray-700 group-hover:text-secondary">
                  Add Section
                </span>
              </button>
            </div>
          </div>

          {/* Note */}
          <div className="mt-6 bg-blue-50 border-l-4 border-[#346C9A] p-4">
            <p className="text-sm text-gray-700">
              <span className="font-bold">Note:</span> Include at least 10 total review sections to generate a diagnostic for the lesson
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t-2 border-gray-200">
            <div></div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveLesson}
                disabled={isSaveDisabled}
                className="px-8 py-3 bg-highlight hover:bg-highlight-dark text-white rounded-lg font-semibold transition-all shadow-md disabled:opacity-50"
              >
                {getSaveButtonLabel(saveLessonButtonText)}
              </button>
              {(() => {
                const currentIdx = roadmapStages.findIndex(s => s.type === 'lesson');
                const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
                return nextStage ? (
                  <button
                    onClick={() => setActiveStage(nextStage.type)}
                    className="px-8 py-3 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-semibold transition-all shadow-md flex items-center gap-2"
                  >
                    Continue to {nextStage.label}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                ) : null;
              })()}
            </div>
          </div>
          </div>
          )}
        </div>
        )}

        {/* Diagnostic Stage */}
        {hasMountedStage('diagnostic') && (
        <div className={`bg-white rounded-xl shadow-sm p-8 space-y-6 ${activeStage === 'diagnostic' ? '' : 'hidden'}`}>
          <h2 className="text-2xl font-bold text-secondary mb-4">Diagnostic Assessment for {stripHtml(lessonData.ModuleTitle) || 'New Lesson'}</h2>
          <div className="border border-[#BFE7E2] bg-[#F3FCFA] rounded-lg p-4">
            <p className="text-sm text-secondary font-semibold">Diagnostic questions are auto-generated from existing Review questions.</p>
            <p className="text-xs text-gray-600 mt-1">
              Current diagnostic set: {autoDiagnosticQuestions.length}/{diagnosticLimit} items
            </p>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4">
            {autoDiagnosticQuestions.length > 0 ? autoDiagnosticQuestions.map((question, index) => {
              const optionList = Array.isArray(question.options) ? question.options : [];

              return (
                <div key={question.id || `auto-diagnostic-${index}`} className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b-2 border-gray-300">
                    <div className="text-sm font-bold text-gray-600">{index + 1}/{autoDiagnosticQuestions.length}</div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[#346C9A]/10 text-secondary">
                      {normalizeSkillValue(question.skill || question.skillTag || 'Memorization', 'Memorization')}
                    </span>
                  </div>

                  <div className="p-5">
                    <p className="text-gray-900 font-semibold mb-3">{stripHtml(question.question) || 'Untitled question'}</p>
                    <div className="mb-3 flex items-center gap-4 flex-wrap">
                      <span className="text-xs font-bold text-gray-700">Question Type:</span>
                      {['Easy', 'Situational'].map((questionType) => (
                        <label key={`${question.id || index}-diagnostic-${questionType}`} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`diagnostic-type-${question.id || index}`}
                            checked={normalizeQuestionTypeValue(question.questionType || question.type || 'Easy', 'Easy') === questionType}
                            onChange={() => handleDiagnosticQuestionTypeChange(question.id, questionType)}
                            className="w-3.5 h-3.5 text-highlight-dark"
                          />
                          <span className="text-xs text-gray-700">{questionType}</span>
                        </label>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {optionList.map((option, optionIndex) => (
                        <div
                          key={`${question.id || index}-option-${optionIndex}`}
                          className={`px-3 py-2 rounded-md border ${
                            Number(question.correctAnswer) === optionIndex
                              ? 'border-green-500 bg-green-50 text-green-700 font-semibold'
                              : 'border-gray-200 bg-gray-50 text-gray-700'
                          }`}
                        >
                          <span className="mr-2 font-semibold">{String.fromCharCode(97 + optionIndex)}.</span>
                          {option || 'Empty option'}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center">
                <p className="text-gray-600 font-semibold">No diagnostic questions generated yet.</p>
                <p className="text-sm text-gray-500 mt-1">Add Review questions first to auto-generate diagnostics.</p>
              </div>
            )}
          </div>

          {/* Save & Next Buttons */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleSaveLesson}
              disabled={isSaveDisabled}
              className="px-8 py-4 bg-highlight text-white font-bold text-lg rounded-lg hover:bg-[#346C9A] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {getSaveButtonLabel(saveLessonButtonText)}
            </button>
            {(() => {
              const currentIdx = roadmapStages.findIndex(s => s.type === 'diagnostic');
              const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
              return nextStage ? (
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#346C9A] hover:bg-[#2A5D84] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ) : null;
            })()}
          </div>
        </div>
        )}

        {/* Review Assessment Stage */}
        {hasMountedStage('review') && (
        <div className={`bg-white rounded-xl shadow-sm p-8 space-y-6 ${activeStage === 'review' ? '' : 'hidden'}`}>
          <h2 className="text-2xl font-bold text-secondary mb-4">Review Assessment for {stripHtml(lessonData.ModuleTitle) || 'New Lesson'}</h2>
          
          {/* Questions List */}
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4">
            {reviewQuestions.map((question, index) => (
              <div key={question.id} className="border-2 border-gray-300 rounded-lg relative overflow-hidden">
                {/* Question Counter and Delete Button Container */}
                <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b-2 border-gray-300">
                  <div className="text-xl font-bold text-gray-600">
                    {index + 1}/{reviewQuestions.length}
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion('review', question.id)}
                    className="w-7 h-7 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
                  >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                </div>

                {/* Question Content */}
                <div className="p-6">
                {/* Question Input */}
                <div
                  id={`input-review-question-${question.id}`}
                  contentEditable
                  suppressContentEditableWarning
                  ref={(el) => {
                    if (!el) return;
                    if (document.activeElement === el) return;
                    const targetValue = stripHtml(question.question) || '';
                    if (el.innerHTML !== targetValue) {
                      el.innerHTML = targetValue;
                    }
                  }}
                  onInput={(e) => {
                    if (e.currentTarget) {
                      const newValue = e.currentTarget.textContent || '';
                      handleQuestionChange('review', question.id, 'question', newValue);
                    }
                  }}
                  onPaste={handlePlainTextPaste}
                  onFocus={() => setActiveTextarea(`input-review-question-${question.id}`)}
                  data-placeholder="Type in the question here"
                  className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 mb-4 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                />

                <div className="mb-4 flex items-center gap-4 flex-wrap">
                  <span className="font-bold text-gray-900">Mastery Type:</span>
                  {MASTERY_TYPE_OPTIONS.map((masteryType) => (
                    <label key={`${question.id}-review-mastery-${masteryType}`} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`review-mastery-${question.id}`}
                        checked={normalizeSkillValue(question.skill || question.skillTag || 'Memorization', 'Memorization') === masteryType}
                        onChange={() => handleQuestionChange('review', question.id, 'skill', masteryType)}
                        className="w-4 h-4 text-highlight-dark"
                      />
                      <span className="text-gray-700">{masteryType}</span>
                    </label>
                  ))}
                </div>

                <div className="mb-4 flex items-center gap-4 flex-wrap">
                  <span className="font-bold text-gray-900">Question Type:</span>
                  {['Easy', 'Situational'].map((questionType) => (
                    <label key={`${question.id}-review-${questionType}`} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`review-type-${question.id}`}
                        checked={normalizeQuestionTypeValue(question.questionType || question.type || 'Easy', 'Easy') === questionType}
                        onChange={() => handleQuestionChange('review', question.id, 'questionType', questionType)}
                        className="w-4 h-4 text-highlight-dark"
                      />
                      <span className="text-gray-700">{questionType}</span>
                    </label>
                  ))}
                </div>

                {/* Answer Options - Merged Container */}
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-600">Answer Choices (one per line)</span>
                    <span className="text-xs text-gray-400">Select correct answer →</span>
                  </div>
                  <div className="flex">
                    <textarea
                      id={`textarea-review-options-${question.id}`}
                      value={optionsToTextareaValue(question.options)}
                      onChange={(e) => {
                        const newOptions = parseOptionsFromTextareaInput(e.target.value);
                        handleQuestionChange('review', question.id, 'options', newOptions);
                      }}
                      onFocus={() => setActiveTextarea(`textarea-review-options-${question.id}`)}
                      placeholder={"a. First choice\nb. Second choice\nc. Third choice\nd. Fourth choice"}
                      rows={4}
                      className="flex-1 px-4 py-3 focus:outline-none text-gray-900 resize-none leading-8"
                    />
                    <div className="flex flex-col justify-center gap-[2px] pr-3 pl-2 border-l border-gray-200 bg-gray-50">
                      {['a', 'b', 'c', 'd'].map((letter, idx) => (
                        <label key={letter} className="flex items-center gap-1.5 cursor-pointer group h-8">
                          <input
                            type="radio"
                            name={`correct-answer-${question.id}`}
                            checked={question.correctAnswer === idx}
                            onChange={() => handleQuestionChange('review', question.id, 'correctAnswer', idx)}
                            className="w-4 h-4 text-green-500 focus:ring-green-500 cursor-pointer"
                          />
                          <span className={`text-xs font-medium whitespace-nowrap ${
                            question.correctAnswer === idx 
                              ? 'text-green-600' 
                              : 'text-gray-400 group-hover:text-gray-600'
                          }`}>
                            {question.correctAnswer === idx ? `${letter}. ✓` : `${letter}.`}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            ))}

            {/* Add Question Button */}
            <div className="border-2 border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center hover:border-[#346C9A] transition-all cursor-pointer group">
              <button
                onClick={() => handleAddQuestion('review')}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-16 h-16 bg-[#346C9A] rounded-full flex items-center justify-center group-hover:bg-highlight transition-all shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-700 group-hover:text-secondary">Add Question</span>
              </button>
            </div>
          </div>

          {/* Next Button */}
          {(() => {
            const currentIdx = roadmapStages.findIndex(s => s.type === 'review');
            const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
            return nextStage ? (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#346C9A] hover:bg-[#2A5D84] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            ) : null;
          })()}
        </div>
        )}

        {/* Final Assessment Stage */}
        {hasMountedStage('final') && (
        <div className={`bg-white rounded-xl shadow-sm p-8 space-y-6 ${activeStage === 'final' ? '' : 'hidden'}`}>
          <h2 className="text-2xl font-bold text-secondary mb-4">Final Assessment for {stripHtml(lessonData.ModuleTitle) || 'New Lesson'}</h2>
          
          {/* Instruction / Message for Users */}
          <div className="border-2 border-gray-200 rounded-lg p-5 bg-gray-50">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              <svg className="w-4 h-4 inline mr-1 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Instruction / Message for Students
            </label>
            <textarea
              value={finalInstruction}
              onChange={(e) => setFinalInstruction(e.target.value)}
              placeholder="e.g., This final assessment affects your learning path progression. Read and answer each question carefully. Good luck!"
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 resize-none"
            />
            <p className="text-sm text-gray-400 mt-1">This message will be shown to students before they start the final assessment.</p>
          </div>

          {/* Questions List */}
          <div className="space-y-6">
            {finalQuestions.map((question, index) => (
              <div key={question.id} className="border-2 border-gray-300 rounded-lg relative overflow-hidden">
                {/* Question Counter and Delete Button Container */}
                <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b-2 border-gray-300">
                  <div className="text-xl font-bold text-gray-600">
                    {index + 1}/{finalQuestions.length}
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion('final', question.id)}
                    className="w-7 h-7 bg-red-400 hover:bg-red-500 rounded-full flex items-center justify-center transition-all"
                  >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                </div>

                {/* Question Content */}
                <div className="p-6">
                {/* Question Input */}
                <div
                  id={`input-final-question-${question.id}`}
                  contentEditable
                  suppressContentEditableWarning
                  ref={(el) => {
                    if (!el) return;
                    if (document.activeElement === el) return;
                    const targetValue = stripHtml(question.question) || '';
                    if (el.innerHTML !== targetValue) {
                      el.innerHTML = targetValue;
                    }
                  }}
                  onInput={(e) => {
                    if (e.currentTarget) {
                      const newValue = e.currentTarget.textContent || '';
                      handleQuestionChange('final', question.id, 'question', newValue);
                    }
                  }}
                  onPaste={handlePlainTextPaste}
                  onFocus={() => setActiveTextarea(`input-final-question-${question.id}`)}
                  data-placeholder="Type in the question here"
                  className="w-full min-h-[48px] px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-highlight focus:outline-none text-gray-900 mb-4 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                />

                {/* Skills Section */}
                <div className="mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-bold text-gray-900">Skill:</span>
                    {['No Skill', 'Memorization', 'Technical Comprehension', 'Analytical Thinking', 'Problem Solving', 'Critical Thinking'].map((skill) => (
                      <label key={skill} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`skill-${question.id}`}
                          checked={question.skill === skill}
                          onChange={() => handleQuestionChange('final', question.id, 'skill', skill)}
                          className="w-4 h-4 text-highlight-dark"
                        />
                        <span className={`${skill === 'No Skill' ? 'text-gray-400 italic' : 'text-gray-700'}`}>{skill}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-bold text-gray-900">Question Type:</span>
                    {['Easy', 'Situational'].map((questionType) => (
                      <label key={`${question.id}-final-${questionType}`} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`final-type-${question.id}`}
                          checked={normalizeQuestionTypeValue(question.questionType || question.type || 'Situational', 'Situational') === questionType}
                          onChange={() => handleQuestionChange('final', question.id, 'questionType', questionType)}
                          className="w-4 h-4 text-highlight-dark"
                        />
                        <span className="text-gray-700">{questionType}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Answer Options - Merged Container */}
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-600">Answer Choices (one per line)</span>
                    <span className="text-xs text-gray-400">Select correct answer →</span>
                  </div>
                  <div className="flex">
                    <textarea
                      id={`textarea-final-options-${question.id}`}
                      value={optionsToTextareaValue(question.options)}
                      onChange={(e) => {
                        const newOptions = parseOptionsFromTextareaInput(e.target.value);
                        handleQuestionChange('final', question.id, 'options', newOptions);
                      }}
                      onFocus={() => setActiveTextarea(`textarea-final-options-${question.id}`)}
                      placeholder={"a. First choice\nb. Second choice\nc. Third choice\nd. Fourth choice"}
                      rows={4}
                      className="flex-1 px-4 py-3 focus:outline-none text-gray-900 resize-none leading-8"
                    />
                    <div className="flex flex-col justify-center gap-[2px] pr-3 pl-2 border-l border-gray-200 bg-gray-50">
                      {['a', 'b', 'c', 'd'].map((letter, idx) => (
                        <label key={letter} className="flex items-center gap-1.5 cursor-pointer group h-8">
                          <input
                            type="radio"
                            name={`correct-answer-${question.id}`}
                            checked={question.correctAnswer === idx}
                            onChange={() => handleQuestionChange('final', question.id, 'correctAnswer', idx)}
                            className="w-4 h-4 text-green-500 focus:ring-green-500 cursor-pointer"
                          />
                          <span className={`text-xs font-medium whitespace-nowrap ${
                            question.correctAnswer === idx 
                              ? 'text-green-600' 
                              : 'text-gray-400 group-hover:text-gray-600'
                          }`}>
                            {question.correctAnswer === idx ? `${letter}. ✓` : `${letter}.`}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            ))}

            {/* Add Question Button */}
            <div className="border-2 border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center hover:border-[#346C9A] transition-all cursor-pointer group">
              <button
                onClick={() => handleAddQuestion('final')}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-16 h-16 bg-[#346C9A] rounded-full flex items-center justify-center group-hover:bg-highlight transition-all shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-700 group-hover:text-secondary">Add Question</span>
              </button>
            </div>
          </div>

          {/* Save & Next Buttons */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleSaveLesson}
              disabled={isSaveDisabled}
              className="px-8 py-4 bg-highlight text-white font-bold text-lg rounded-lg hover:bg-[#346C9A] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {getSaveButtonLabel('Save Final Assessment')}
            </button>
            {(() => {
              const currentIdx = roadmapStages.findIndex(s => s.type === 'final');
              const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
              return nextStage ? (
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#346C9A] hover:bg-[#2A5D84] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ) : null;
            })()}
          </div>
        </div>
        )}

        {/* Simulation Stage */}
        {hasMountedStage('simulation') && (
        <div className={`bg-white rounded-xl shadow-sm p-8 space-y-6 ${activeStage === 'simulation' ? '' : 'hidden'}`}>
          <h2 className="text-2xl font-bold text-secondary mb-4">Simulation</h2>
          {selectedSimulation ? (
            <div className="border-2 border-highlight rounded-lg p-6 bg-surface-light">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-secondary">{selectedSimulation.SimulationTitle}</h3>
                  <p className="text-gray-600 mt-2">{selectedSimulation.Description}</p>
                  <div className="flex gap-4 mt-3 flex-wrap">
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Type: {selectedSimulation.ActivityType}</span>
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Max Score: {selectedSimulation.MaxScore}</span>
                    {selectedSimulation.TimeLimit > 0 && (
                      <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Time Limit: {selectedSimulation.TimeLimit} min</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={openSimulationPickerForStage}
                  className="px-5 py-2.5 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all font-semibold flex-shrink-0 ml-4"
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-16 flex flex-col items-center justify-center">
              <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <p className="text-gray-500 text-lg mb-4">No simulation selected</p>
              <button
                onClick={openSimulationPickerForStage}
                className="px-6 py-3 bg-[#346C9A] text-white rounded-lg hover:bg-[#2A5D84] transition-all font-semibold shadow-md"
              >
                Select Simulation
              </button>
            </div>
          )}

          {/* Save & Next Buttons */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleSaveLesson}
              disabled={isSaveDisabled}
              className="px-8 py-4 bg-highlight text-white font-bold text-lg rounded-lg hover:bg-[#346C9A] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {getSaveButtonLabel(saveLessonButtonText)}
            </button>
            {(() => {
              const currentIdx = roadmapStages.findIndex(s => s.type === 'simulation');
              const nextStage = currentIdx >= 0 && currentIdx < roadmapStages.length - 1 ? roadmapStages[currentIdx + 1] : null;
              return nextStage ? (
                <button
                  onClick={() => setActiveStage(nextStage.type)}
                  className="px-8 py-4 bg-[#346C9A] hover:bg-[#2A5D84] text-white font-bold text-lg rounded-lg transition-all shadow-lg flex items-center gap-2"
                >
                  Continue to {nextStage.label}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ) : null;
            })()}
          </div>
        </div>
        )}
      </div>

      {/* Quick navigation arrows for long editor pages */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-16">
        <div className="group relative">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="w-11 h-11 rounded-full bg-white border border-gray-300 shadow-md hover:border-highlight hover:text-secondary text-gray-600 flex items-center justify-center transition-all"
            aria-label="Go to top"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            go to top
          </span>
        </div>

        <div className="group relative">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            className="w-11 h-11 rounded-full bg-white border border-gray-300 shadow-md hover:border-highlight hover:text-secondary text-gray-600 flex items-center justify-center transition-all"
            aria-label="Go to bottom"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <span className="absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            go to bottom
          </span>
        </div>
      </div>

      {/* Materials Side Panel */}
      {showSectionModal && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => { setShowSectionModal(false); setInsertAtIndex(null); }}
          ></div>

          {/* Side Panel */}
          <div className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b-2 border-gray-200">
              <h2 className="text-3xl font-bold text-secondary">Materials</h2>
              <button
                onClick={() => { setShowSectionModal(false); setInsertAtIndex(null); }}
                className="text-secondary hover:text-highlight-dark transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Materials List */}
            <div className="p-4 space-y-2 overflow-y-auto h-[calc(100%-88px)]">
              <button
                onClick={() => handleAddMaterial('topic')}
                className="w-full py-4 px-6 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Topic Title
              </button>

              <button
                onClick={() => handleAddMaterial('subtopic')}
                className="w-full py-4 px-6 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Subtopic Title
              </button>

              <button
                onClick={() => handleAddMaterial('paragraph')}
                className="w-full py-4 px-6 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Paragraph
              </button>

              <button
                onClick={() => handleAddMaterial('image')}
                className="w-full py-4 px-6 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Image
              </button>

              <button
                onClick={() => handleAddMaterial('video')}
                className="w-full py-4 px-6 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Video
              </button>

              <button
                onClick={() => handleAddMaterial('review-multiple-choice')}
                className="w-full py-4 px-6 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Review - Multiple Choice
              </button>

              <button
                onClick={() => handleAddMaterial('simulation')}
                className="w-full py-4 px-6 bg-[#346C9A] hover:bg-[#2A5D84] text-white rounded-lg font-bold text-xl transition-all shadow-md"
              >
                Simulation
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Stage Modal */}
      {showAddStageModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowAddStageModal(false)}
          ></div>
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 p-8 w-[420px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-secondary">Add Stage</h2>
              <button
                onClick={() => setShowAddStageModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                { type: 'introduction', label: 'Introduction', desc: 'Lesson overview and metadata fields', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )},
                { type: 'diagnostic', label: 'Diagnostic', desc: 'Pre-assessment to evaluate prior knowledge', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )},
                { type: 'lesson', label: 'Lesson', desc: 'Main lesson content and materials', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                )},
                { type: 'final', label: 'Final Assessment', desc: 'End-of-lesson comprehensive assessment', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                )},
                { type: 'simulation', label: 'Simulation', desc: 'Import an existing interactive simulation', icon: (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                )},
              ].map(option => {
                const alreadyAdded = isStageTypeInRoadmap(option.type);

                return (
                  <button
                    key={option.type}
                    onClick={() => handleAddStage(option.type)}
                    disabled={alreadyAdded}
                    className={`w-full py-4 px-5 rounded-lg text-left transition-all flex items-center gap-4 border-2 ${
                      alreadyAdded
                        ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-gray-200 hover:border-highlight hover:bg-surface-light text-gray-800'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      alreadyAdded ? 'bg-gray-300 text-white' : 'bg-[#346C9A] text-white'
                    }`}>
                      {option.icon}
                    </div>
                    <div>
                      <div className="font-bold text-lg">
                        {option.label}
                        {alreadyAdded ? ' (Added)' : ''}
                      </div>
                      <div className="text-sm text-gray-500">{option.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Simulation Picker Modal */}
      {showSimulationPicker && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={closeSimulationPicker}
          ></div>
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 p-8 w-[520px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-secondary">Select Simulation</h2>
              <button
                onClick={closeSimulationPicker}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {availableSimulations.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <p className="text-gray-500 text-lg">No simulations available</p>
                <p className="text-gray-400 text-sm mt-2">Create simulations first in the Simulations section</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                {availableSimulations.map(sim => (
                  <button
                    key={sim.SimulationID}
                    onClick={() => handleSimulationPicked(sim)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all hover:border-highlight hover:bg-surface-light ${
                      Number(activeSimulationPickerSelectionId) === Number(sim.SimulationID)
                        ? 'border-highlight bg-surface-light'
                        : 'border-gray-200'
                    }`}
                  >
                    <h3 className="font-bold text-secondary text-lg">{sim.SimulationTitle}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{sim.Description}</p>
                    <div className="flex gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Type: {sim.ActivityType}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Max Score: {sim.MaxScore}</span>
                      {sim.TimeLimit > 0 && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Time: {sim.TimeLimit}min</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showImageCropper && imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          title="Crop Lesson Image"
          cropShape="rect"
          aspect={4 / 3}
          aspectOptions={[
            { label: '1:1', value: 1 },
            { label: '4:3', value: 4 / 3 },
            { label: '16:9', value: 16 / 9 },
            { label: '3:4', value: 3 / 4 }
          ]}
          outputSize={1400}
          outputFileName="lesson-image-cropped.png"
          onSave={handleSaveCroppedLessonImage}
          onClose={closeLessonImageCropper}
        />
      )}

    </div>
  );
};

export default AddLesson;
