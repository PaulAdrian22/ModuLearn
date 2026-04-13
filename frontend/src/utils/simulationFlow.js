export const SIMULATION_SKILL_OPTIONS = [
  'Memorization',
  'Technical Comprehension',
  'Analytical Thinking',
  'Problem Solving',
  'Critical Thinking'
];

export const normalizeSimulationSkill = (value = '', fallback = 'Memorization') => {
  const normalized = String(value || '').trim().toLowerCase();
  const matched = SIMULATION_SKILL_OPTIONS.find((skill) => skill.toLowerCase() === normalized);
  return matched || fallback;
};

const ACTION_TYPE_OPTIONS = ['mark', 'navigate', 'interact', 'drag'];

export const normalizeFlowActionType = (value = '', fallback = 'mark') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ACTION_TYPE_OPTIONS.includes(normalized) ? normalized : fallback;
};

const STEP_PREFIX_REGEX = /^\s*(?:\d+[\.)]|[-*])\s*(.+)$/;

export const extractChecklistLines = (instructionText = '') => {
  const lines = String(instructionText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const extracted = [];

  lines.forEach((line) => {
    const prefixed = line.match(STEP_PREFIX_REGEX);
    if (prefixed?.[1]) {
      extracted.push(prefixed[1].trim());
      return;
    }

    // Capture inline numbered steps (e.g., "1. Foo 2. Bar") by splitting before each number marker.
    const inlineParts = line
      .split(/(?=\s\d+[\.)]\s*)/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (inlineParts.length > 1) {
      inlineParts.forEach((part) => {
        const inlinePrefixed = part.match(STEP_PREFIX_REGEX);
        if (inlinePrefixed?.[1]) {
          extracted.push(inlinePrefixed[1].trim());
        }
      });
      return;
    }

    extracted.push(line);
  });

  return extracted;
};

const inferActionTypeFromText = (stepText = '') => {
  const normalized = stepText.toLowerCase();

  if (/\b(go to|go back|return to|back to|switch to|move to|navigate to|proceed to)\b/.test(normalized)) return 'navigate';

  if (/(drag|install|place|set aside|pull out|pull the|insert)/.test(normalized)) return 'drag';

  if (/(open|close|unplug|disconnect|unscrew|screw|lift|push|remove|lock|unlock|apply|connect)/.test(normalized)) {
    return 'interact';
  }

  return 'mark';
};

const AREA_KEYWORDS = [
  { keyword: 'inside back panel', perspectiveHint: 'back panel - inside' },
  { keyword: 'back panel inside', perspectiveHint: 'back panel - inside' },
  { keyword: 'back panel', perspectiveHint: 'back panel' },
  { keyword: 'front side', perspectiveHint: 'front panel' },
  { keyword: 'front panel', perspectiveHint: 'front panel' },
  { keyword: 'cpu area', perspectiveHint: 'cpu area' },
  { keyword: 'ram area', perspectiveHint: 'ram area' },
  { keyword: 'hdd bay', perspectiveHint: 'hdd area' },
  { keyword: 'hdd area', perspectiveHint: 'hdd area' },
  { keyword: 'ssd area', perspectiveHint: 'ssd area' },
  { keyword: 'gpu area', perspectiveHint: 'gpu area' },
  { keyword: 'psu area', perspectiveHint: 'side view' },
  { keyword: 'motherboard area', perspectiveHint: 'side view' },
  { keyword: 'side view', perspectiveHint: 'side view' }
];

const inferPerspectiveIdFromText = (stepText = '', perspectives = []) => {
  if (!Array.isArray(perspectives) || perspectives.length === 0) return null;

  const normalized = stepText.toLowerCase();

  for (const areaKeyword of AREA_KEYWORDS) {
    if (!normalized.includes(areaKeyword.keyword)) continue;

    const match = perspectives.find((perspective) =>
      String(perspective?.name || '').toLowerCase().includes(areaKeyword.perspectiveHint)
    );

    if (match) return match.id;
  }

  return null;
};

const inferTargetLabelFromText = (stepText = '', perspectives = [], perspectiveId = null) => {
  const normalized = stepText.toLowerCase();

  const sourcePerspectives = perspectiveId
    ? perspectives.filter((perspective) => perspective.id === perspectiveId)
    : perspectives;

  const labels = sourcePerspectives
    .flatMap((perspective) => perspective?.dropZones || [])
    .map((zone) => String(zone?.label || '').trim())
    .filter(Boolean);

  if (labels.length === 0) return '';

  const sortedLabels = [...new Set(labels)].sort((a, b) => b.length - a.length);

  const directMatch = sortedLabels.find((label) => normalized.includes(label.toLowerCase()));
  if (directMatch) return directMatch;

  const heuristicMap = [
    { keyword: 'power cable', includesAny: ['plug', 'power'] },
    { keyword: 'system unit case', includesAny: ['side cover', 'case shade'] },
    { keyword: 'cpu fan', includesAny: ['cooler', 'cpu fan'] },
    { keyword: 'cpu power', includesAny: ['cpu connector', 'connectors'] },
    { keyword: '24-pin', includesAny: ['24 pin'] },
    { keyword: 'pcie', includesAny: ['pcie'] },
    { keyword: 'sata', includesAny: ['sata', 'connector'] },
    { keyword: 'fan', includesAny: ['fan'] },
    { keyword: 'gpu', includesAny: ['gpu'] },
    { keyword: 'ssd', includesAny: ['ssd'] },
    { keyword: 'hdd', includesAny: ['hdd'] },
    { keyword: 'ram', includesAny: ['ram'] },
    { keyword: 'motherboard', includesAny: ['motherboard'] },
    { keyword: 'psu', includesAny: ['psu'] }
  ];

  for (const rule of heuristicMap) {
    if (!normalized.includes(rule.keyword)) continue;
    const match = sortedLabels.find((label) =>
      rule.includesAny.some((token) => label.toLowerCase().includes(token))
    );
    if (match) return match;
  }

  return '';
};

export const parseInstructionChecklistToFlowSteps = (instructionText = '', perspectives = []) => {
  const checklistLines = extractChecklistLines(instructionText);

  return checklistLines.map((line, index) => {
    const actionType = inferActionTypeFromText(line);
    const perspectiveId = inferPerspectiveIdFromText(line, perspectives);
    const targetLabel = inferTargetLabelFromText(line, perspectives, perspectiveId);

    return {
      id: index + 1,
      text: line,
      actionType,
      perspectiveId: perspectiveId || null,
      targetLabel: targetLabel || ''
    };
  });
};
